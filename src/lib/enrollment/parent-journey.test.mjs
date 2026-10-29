import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture, prepareOrganization } from "./test-fixture.ts";
import { defaultBudget } from "../teams/fee-model.ts";
import { mutateFeePlan } from "../teams/fee.server.ts";
import { independentWorkspace } from "../teams/independent.server.ts";
import { prepareTeamCheckout } from "../teams/payment.server.ts";
import { enrollmentCase, signPacket } from "./enrollment.server.ts";
import { acceptedFeeAgreement } from "../teams/fee-explanation.server.ts";
import {
  collectionStatus,
  authorizeTeamCollection,
} from "../teams/collection-authorization.server.ts";
import {
  deliverFeeReadyEmails,
  feeNotificationWorkspace,
  checkFeeDelivery,
} from "../teams/fee-notifications.server.ts";
import { enrollmentGuide } from "./guide.server.ts";
import { approveSyntheticNotices } from "../notifications/release-control.test-fixture.ts";
for (const key of [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DATABASE_URL_UNPOOLED",
  "SQUARE_PRODUCTION_ACCESS_TOKEN",
  "SQUARE_SANDBOX_ACCESS_TOKEN",
])
  if (process.env[key]) throw Error("Synthetic audit refuses " + key);

for (const order of ["invite-before-publish", "publish-before-player-and-invite"])
  test(
    order + " — fees-ready delivery, guardian enrollment and authoritative payment preparation",
    async () => {
      const f = await enrollmentFixture(),
        { sql, db } = f;
      const previous = globalThis.__pgSqlPromise__;
      process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
      process.env.CONTEXT = "dev";
      globalThis.__pgSqlPromise__ = Promise.resolve(sql);
      try {
        const { issueInvitation, acceptInvitation } = await import("../invitations.server.ts");
        await sql`insert into "user"(id,name,email,"emailVerified") values('invitee','Synthetic Invited Guardian','invitee@example.invalid',false)`;
        await sql`insert into profiles(user_id,name,email,role) values('invitee','Synthetic Invited Guardian','invitee@example.invalid','parent')`;
        for (const t of f.club.teams) for (const p of t.roster) p.teamId = t.id;
        const child = structuredClone(f.club.teams[0].roster[0]);
        if (order === "publish-before-player-and-invite") f.club.teams[0].roster = [];
        await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
        await prepareOrganization(sql);
        const budget = {
          ...defaultBudget(),
          fundingModel: "independent",
          processingBps: 0,
          processingFixed: 0,
          policy: "Synthetic withdrawal policy.",
          parentExplanation: {
            initialDeposit: "PUBLIC-COVERAGE: uniforms and coaching.",
            monthlyDues: "Team facility practice.",
            teamExpenses: "Independent tournament entries.",
            additionalNotes: "",
          },
          independent: {
            seasonKey: randomUUID(),
            uniformDeposit: 70000,
            monthlyDues: 14900,
            uniformDue: "2098-01-01",
            firstDue: "2098-02-01",
            billingDay: 1,
            lastDue: "2098-06-01",
            seasonEnd: "2098-06-30",
            processingExplanation: "No processing fee.",
          },
        };
        let invitation;
        if (order === "invite-before-publish")
          invitation = await issueInvitation(
            "owner",
            "invitee@example.invalid",
            "parent",
            "home-guardian",
          );
        await mutateFeePlan(sql, "owner", {
          action: "publishIndependent",
          teamId: "base",
          revision: 0,
          budget,
          confirmed: true,
        });
        if (order === "publish-before-player-and-invite") {
          const [row] = await sql`select payload from club_state where id='oklahoma-prospects'`;
          row.payload.teams.find((t) => t.id === "base").roster.push(child);
          await sql`update club_state set payload=${JSON.stringify(row.payload)}::jsonb,rev=rev+1 where id='oklahoma-prospects'`;
          invitation = await issueInvitation(
            "owner",
            "invitee@example.invalid",
            "parent",
            "home-guardian",
          );
        }
        assert.equal((await sql`select * from fee_ready_notifications`).length, 1);
        const sent = [];
        const env = {
          CONTEXT: "production",
          SQUARE_DEPLOY_CONTEXT: "production",
          RESEND_API_KEY: "synthetic",
          RESEND_FROM_EMAIL: "office@example.invalid",
        };
        const stub = async (_url, init) => {
          sent.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ id: "synthetic-email" }));
        };
        await deliverFeeReadyEmails(sql, env, stub);
        assert.equal(sent.length, 0, "Published fees remain held until exact owner email approval");
        assert.equal((await sql`select attempts from fee_ready_notifications`)[0].attempts, 0);
        await approveSyntheticNotices(sql, "fee", env);
        await deliverFeeReadyEmails(sql, env, stub);
        await deliverFeeReadyEmails(sql, env, stub);
        assert.equal(sent.length, 1);
        assert.match(sent[0].text, /PUBLIC-COVERAGE/);
        assert.match(sent[0].text, /Initial deposit: \$700.00/);
        assert.match(sent[0].text, /\$149.00/);
        assert.match(sent[0].text, /enrollment\?teamId=base&playerId=base-player/);
        assert.match(sent[0].text, /verify your email/);
        assert.doesNotMatch(sent[0].text, /uniformUnitCost|pricingPlayerCount|margin/);
        const notices = await feeNotificationWorkspace(sql, "owner", {});
        assert.equal(notices.rows[0].status, "accepted");
        assert.equal(notices.rows[0].delivery_event, null);
        const delivered = async () =>
          new Response(
            JSON.stringify({ to: ["invitee@example.invalid"], last_event: "delivered" }),
          );
        assert.equal(
          (await checkFeeDelivery(sql, "owner", notices.rows[0].id, env, delivered)).delivery,
          "delivered",
        );
        for (const actor of ["guardian", "coach", "coordinator", "stranger"])
          await assert.rejects(feeNotificationWorkspace(sql, actor, {}));
        await assert.rejects(acceptInvitation("invitee", invitation.id), /verif/i);
        await sql`update "user" set "emailVerified"=true where id='invitee'`;
        await assert.rejects(acceptInvitation("stranger", invitation.id), /unavailable/);
        await acceptInvitation("invitee", invitation.id);
        assert.equal(
          (
            await sql`select * from household_members where user_id='invitee' and household_id='home-guardian'`
          ).length,
          1,
        );
        let guide = await enrollmentGuide(sql, "invitee", {});
        assert.equal(guide.players.length, 2);
        assert.equal(
          guide.players.find((p) => p.teamId === "base").steps[3].status,
          "Action needed",
        );
        assert.equal(
          guide.players.find((p) => p.teamId === "soft").steps[3].status,
          "Waiting for Prospects",
        );
        assert.equal((await enrollmentGuide(sql, "stranger", {})).players.length, 0);
        assert.equal((await enrollmentGuide(sql, "coach", {})).players.length, 0);
        const view = () => independentWorkspace(sql, "invitee");
        const space = (await view()).spaces.find((s) => s.teamId === "base");
        assert.ok(space);
        const player = space.prospects.find((p) => p.id === "base-player");
        assert.equal(player.accepted, false);
        assert.equal(player.acceptancePreview.rows[0].amount, 70000);
        assert.equal(player.acceptancePreview.rows[1].amount, 14900);
        const accept = {
          action: "accept",
          teamId: "base",
          playerId: "base-player",
          revision: space.planRevision,
          consent: true,
          name: "Synthetic Invited Guardian",
          independentOfferDigest: player.acceptancePreview.digest,
        };
        await assert.rejects(
          mutateFeePlan(sql, "invitee", accept),
          /Review and sign your current team packet/,
        );
        const packet = await enrollmentCase(sql, "invitee", {
          teamId: "base",
          playerId: "base-player",
        });
        await signPacket(sql, "invitee", {
          teamId: "base",
          playerId: "base-player",
          packetDigest: packet.packet.digest,
          signerName: "Synthetic Invited Guardian",
          guardian: true,
          electronicConsent: true,
          conductDiscussed: true,
          medicalAuthorization: true,
          concussionAcknowledged: true,
          athleteAcknowledged: true,
          athleteSignerName: "Synthetic athlete",
        });
        await mutateFeePlan(sql, "invitee", accept);
        const accepted = (await view()).spaces.find((s) => s.teamId === "base");
        assert.equal(accepted.prospects[0].accepted, true);
        guide = await enrollmentGuide(sql, "invitee", {});
        const progress = guide.players.find((p) => p.teamId === "base");
        assert.equal(progress.steps[3].status, "Complete");
        assert.notEqual(progress.steps[4].status, "Complete");
        assert.equal(progress.steps[5].status, "Autopay unavailable");
        assert.equal(progress.parentComplete, false);
        assert.equal((await feeNotificationWorkspace(sql, "owner", {})).preview.length, 0);
        const download = await acceptedFeeAgreement(sql, "invitee", {
          teamId: "base",
          playerId: "base-player",
          seasonId: budget.independent.seasonKey,
        });
        assert.match(download.text, /PUBLIC-COVERAGE/);
        assert.equal((await sql`select * from team_collection_authorizations`).length, 0);
        await assert.rejects(
          mutateFeePlan(sql, "invitee", { ...accept, revision: accepted.planRevision }),
          /already accepted/,
        );
        const request = {
          teamId: "base",
          playerId: "base-player",
          amount: 70000,
          consent: true,
          requestId: randomUUID(),
        };
        const checkout = await prepareTeamCheckout(sql, "invitee", request, "sandbox");
        const repeated = await prepareTeamCheckout(sql, "invitee", request, "sandbox");
        assert.equal(checkout.orderId, repeated.orderId);
        assert.equal(checkout.totalCents, 70000);
        assert.notEqual(
          (await enrollmentGuide(sql, "invitee", { SQUARE_ENVIRONMENT: "sandbox" })).players.find(
            (p) => p.teamId === "base",
          ).steps[4].status,
          "Complete",
        );
        await sql`insert into square_payment_attempts(id,order_id,token_hash,status) values(${"attempt-" + order},${checkout.orderId},'synthetic','unknown')`;
        assert.equal(
          (await enrollmentGuide(sql, "invitee", { SQUARE_ENVIRONMENT: "sandbox" })).players.find(
            (p) => p.teamId === "base",
          ).steps[4].status,
          "Payment processing",
        );
        await assert.rejects(
          prepareTeamCheckout(sql, "invitee", { ...request, requestId: randomUUID() }, "sandbox"),
          /pending|review|already|progress/i,
        );
        await assert.rejects(
          prepareTeamCheckout(sql, "stranger", { ...request, requestId: randomUUID() }, "sandbox"),
          /guardian/,
        );
        assert.equal(
          (await sql`select * from square_payments`).length,
          0,
          "Preparing payment creates no provider charge",
        );
        const status = await collectionStatus(
          sql,
          "invitee",
          { teamId: "base", playerId: "base-player" },
          "sandbox",
        );
        assert.equal(status.status, "not set up");
        await assert.rejects(
          authorizeTeamCollection(
            sql,
            "invitee",
            { teamId: "base", playerId: "base-player" },
            "sandbox",
            "activate",
          ),
          /two different/,
        );
      } finally {
        globalThis.__pgSqlPromise__ = previous;
        delete process.env.DATABASE_URL;
        delete process.env.CONTEXT;
        await db.close();
      }
    },
  );
