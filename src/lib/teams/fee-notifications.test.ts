import { issueTeamInvitation } from "./invitations.server";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, type FeeBudget } from "./fee-model";
import { mutateFeePlan } from "./fee.server";
import {
  deliverFeeReadyEmails,
  feeNotificationWorkspace,
  queueFeeCatchup,
  checkFeeDelivery,
  queueFeeReadyInTransaction,
} from "./fee-notifications.server";
import { mutateStoredClub } from "./club-store.server";
import type { Sql } from "../db";
import { prepareOrganization } from "../enrollment/test-fixture";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import { withFinancialContext } from "../finance/context.server";
import { enrollmentGuide } from "../enrollment/guide.server";
const env = {
  CONTEXT: "production",
  SQUARE_DEPLOY_CONTEXT: "production",
  RESEND_API_KEY: "synthetic",
  RESEND_FROM_EMAIL: "office@example.invalid",
};
const budget = (): FeeBudget => ({
  ...defaultBudget(),
  fundingModel: "independent",
  policy: "Synthetic payment, withdrawal and refund policy.",
  processingBps: 0,
  processingFixed: 0,
  parentExplanation: {
    initialDeposit: "PUBLIC uniform and coaching coverage",
    monthlyDues: "PUBLIC facility dues",
    teamExpenses: "PUBLIC independent tournament expenses",
    additionalNotes: "Planned fundraising is arranged by the coach.",
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
    processingExplanation: "No additional processing fee.",
  },
});
async function invite(sql: Sql) {
  const id = randomUUID();
  await sql`insert into club_invites(id,token_hash,email,role,family_id,team_id,invited_by,expires_at) values(${id},${id},'guardian@example.invalid','parent','home-guardian','base','owner',now()+interval '7 days')`;
  return id;
}
test("an accepted household guardian receives the correct second team's published offer without another household or player", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const id = await invite(sql);
    await sql`update club_invites set status='accepted',accepted_by='guardian' where id=${id}`;
    await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    await sql`insert into owner_grants(email,user_id) values('fake@example.invalid','fake')`;
    await mutateFeePlan(sql, "fake", {
      action: "publishIndependent",
      teamId: "soft",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    const view = await feeNotificationWorkspace(sql, "fake", {});
    const configured = {
      ...env,
      TRYOUT_NOTIFICATIONS_ENABLED: "true",
      TRYOUT_NOTIFICATIONS_SECRET: "synthetic",
    };
    assert.equal((await feeNotificationWorkspace(sql, "fake", configured)).enabled, true);
    assert.equal(
      (
        await feeNotificationWorkspace(sql, "fake", {
          ...configured,
          SQUARE_DEPLOY_CONTEXT: "deploy-preview",
        })
      ).enabled,
      false,
    );
    assert.equal(view.rows.length, 1);
    assert.equal(view.rows[0].snapshot.teamId, "soft");
    assert.equal(view.rows[0].snapshot.playerId, "soft-player");
    assert.equal(view.rows[0].snapshot.recipient, "guardian@example.invalid");
    assert.equal(
      (await sql`select * from household_members where household_id='home-guardian'`).length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("operational invitations and new household membership never bypass frozen financial admission", async () => {
  const { sql, db, club } = await enrollmentFixture();
  try {
    for (const t of club.teams) for (const p of t.roster) p.teamId = t.id;
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await prepareOrganization(sql);
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    const preview = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      ...preview,
      reason: "Synthetic enrollment admission isolation",
    });
    await applyFutureActiveSchemaForTest(sql);
    await sql`insert into "user"(id,name,email,"emailVerified") values('new-guardian','Synthetic new guardian','new-guardian@example.invalid',true)`;
    await sql`insert into profiles(user_id,name,email,role) values('new-guardian','Synthetic new guardian','new-guardian@example.invalid','parent')`;
    await sql`insert into household_members(household_id,user_id) values('home-guardian','new-guardian')`;
    const id = randomUUID();
    await sql`insert into club_invites(id,token_hash,email,role,family_id,team_id,invited_by,expires_at,status,accepted_by) values(${id},${id},'new-guardian@example.invalid','parent','home-guardian','base','owner',now()+interval '7 days','accepted','new-guardian')`;
    await withFinancialContext(sql, "owner", "owner", (tx) =>
      queueFeeReadyInTransaction(tx, "owner", { teamId: "base" }),
    );
    assert.equal((await sql`select * from fee_ready_notifications`).length, 0);
    assert.equal((await feeNotificationWorkspace(sql, "owner", {})).preview.length, 0);
    const guide = await enrollmentGuide(sql, "new-guardian", {});
    assert.equal(
      guide.players.find((p) => p.teamId === "base")!.steps[3].status,
      "Waiting for Prospects",
    );
    assert.match(
      guide.players.find((p) => p.teamId === "base")!.steps[3].detail,
      /finish linking your player's fee account/,
    );
    assert.doesNotMatch(JSON.stringify(guide), /70000|14900|PUBLIC uniform/);
  } finally {
    await db.close();
  }
});
test("delivery checks recheck owner authority after the provider response", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    await invite(sql);
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    const [{ id }] = await sql<{ id: string }>`select id from fee_ready_notifications`;
    await sql`update fee_ready_notifications set status='accepted',provider_message_id='synthetic-provider' where id=${id}`;
    await assert.rejects(
      checkFeeDelivery(sql, "owner", id, env, async () => {
        await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
        return new Response(
          JSON.stringify({ to: ["guardian@example.invalid"], last_event: "delivered" }),
        );
      }),
      /owner|access|authorized/i,
    );
    assert.equal(
      (await sql`select delivery_event from fee_ready_notifications where id=${id}`)[0]
        .delivery_event,
      null,
    );
  } finally {
    await db.close();
  }
});
test("new notices are deduplicated across republication and roster saves; retries freeze body and key and stop before provider idempotency expires", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    assert.equal((await sql`select * from fee_ready_notifications`).length, 0);
    await invite(sql);
    const b = budget();
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      confirmed: true,
    });
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 1,
      budget: b,
      confirmed: true,
    });
    assert.equal((await sql`select * from fee_ready_notifications`).length, 1);
    const calls: { key: string | null; body: string }[] = [];
    const send: typeof fetch = async (_url, init) => {
      calls.push({
        key: new Headers(init?.headers).get("Idempotency-Key"),
        body: String(init?.body),
      });
      return new Response(JSON.stringify({ id: "synthetic-provider" }), {
        status: calls.length === 1 ? 500 : 200,
      });
    };
    assert.equal((await deliverFeeReadyEmails(sql, env, send)).failed, 1);
    await sql`update fee_ready_notifications set next_attempt_at=now()`;
    assert.equal(
      (
        await deliverFeeReadyEmails(
          sql,
          { ...env, RESEND_FROM_EMAIL: "changed@example.invalid" },
          send,
        )
      ).accepted,
      1,
    );
    assert.deepEqual(calls[0], calls[1]);
    await deliverFeeReadyEmails(sql, env, send);
    assert.equal(calls.length, 2);
    const id = (await feeNotificationWorkspace(sql, "owner", {})).rows[0].id;
    await assert.rejects(
      checkFeeDelivery(
        sql,
        "owner",
        id,
        env,
        async () =>
          new Response(JSON.stringify({ to: ["wrong@example.invalid"], last_event: "delivered" })),
      ),
      /mismatch/,
    );
    assert.equal(
      (
        await checkFeeDelivery(
          sql,
          "owner",
          id,
          env,
          async () =>
            new Response(
              JSON.stringify({ to: ["guardian@example.invalid"], last_event: "bounced" }),
            ),
        )
      ).delivery,
      "bounced",
    );
    await mutateStoredClub(sql, "owner", "owner", undefined, async (_tx, club) => {
      const p = structuredClone(club.teams[0].roster[0]);
      p.id = "late-player";
      p.name = "Late synthetic athlete";
      p.teamId = "base";
      club.teams[0].roster.push(p);
    });
    assert.equal((await sql`select * from fee_ready_notifications`).length, 2);
    await sql`update fee_ready_notifications set first_attempt_at=now()-interval '24 hours',attempts=1 where player_id='late-player'`;
    await deliverFeeReadyEmails(sql, env, send);
    assert.equal(calls.length, 2);
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from fee_ready_notifications where player_id='late-player'`
      )[0].status,
      "review",
    );
  } finally {
    await db.close();
  }
});
test("catch-up requires an owner-reviewed current preview; drafts and historical deployment do not enqueue messages", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const b = budget();
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      confirmed: true,
    });
    await invite(sql); // Simulates an invitation that predates the event hooks; no backfill scanner.
    const preview = await feeNotificationWorkspace(sql, "owner", {});
    assert.equal(preview.preview.length, 1);
    assert.equal(preview.rows.length, 0);
    assert.match(preview.preview[0].text, /PUBLIC/);
    assert.equal((await sql`select * from fee_ready_notifications`).length, 0);
    for (const actor of ["guardian", "coach", "coordinator", "fake", "stranger"])
      await assert.rejects(queueFeeCatchup(sql, actor, [preview.preview[0].id]));
    const changed = structuredClone(b);
    changed.independent!.uniformDeposit = 71000;
    await mutateFeePlan(sql, "owner", {
      action: "save",
      teamId: "base",
      revision: 1,
      budget: changed,
      expenses: [],
      uniforms: [],
    });
    assert.equal((await sql`select * from fee_ready_notifications`).length, 0);
    assert.equal(
      (await feeNotificationWorkspace(sql, "owner", {})).preview[0].id,
      preview.preview[0].id,
    );
    await queueFeeCatchup(sql, "owner", [preview.preview[0].id]);
    await queueFeeCatchup(sql, "owner", [preview.preview[0].id]);
    assert.equal((await sql`select * from fee_ready_notifications`).length, 1);
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 2,
      budget: changed,
      confirmed: true,
    });
    await assert.rejects(queueFeeCatchup(sql, "owner", [preview.preview[0].id]), /changed/);
    let sent = 0;
    await deliverFeeReadyEmails(sql, env, async (_url, init) => {
      sent++;
      assert.match(String(init?.body), /710.00/);
      return new Response(JSON.stringify({ id: "synthetic" }));
    });
    assert.equal(sent, 1);
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from fee_ready_notifications where id=${preview.preview[0].id}`
      )[0].status,
      "superseded",
    );
  } finally {
    await db.close();
  }
});
test("unchanged republication does not turn historical invitations into an automatic catch-up send", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const b = budget();
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      confirmed: true,
    });
    await invite(sql);
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 1,
      budget: b,
      confirmed: true,
    });
    assert.equal((await sql`select * from fee_ready_notifications`).length, 0);
    const preview = await feeNotificationWorkspace(sql, "owner", {});
    assert.equal(preview.preview.length, 1);
    await queueFeeCatchup(sql, "owner", [preview.preview[0].id]);
    assert.equal((await sql`select * from fee_ready_notifications`).length, 1);
  } finally {
    await db.close();
  }
});
for (const change of [
  "expired",
  "revoked",
  "withdrawn",
  "disabled",
  "canceled",
  "issuer-revoked",
] as const)
  test(`fee notification suppresses ${change} access before provider delivery`, async () => {
    const { sql, db } = await enrollmentFixture();
    try {
      const id = await invite(sql),
        b = budget();
      await mutateFeePlan(sql, "owner", {
        action: "publishIndependent",
        teamId: "base",
        revision: 0,
        budget: b,
        confirmed: true,
      });
      if (change === "expired")
        await sql`update club_invites set expires_at=now()-interval '1 second' where id=${id}`;
      if (change === "revoked") await sql`update club_invites set status='revoked' where id=${id}`;
      if (change === "disabled")
        await sql`update "user" set "disabledAt"=now() where id='guardian'`;
      if (change === "issuer-revoked")
        await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
      if (change === "withdrawn")
        await mutateStoredClub(sql, "owner", "owner", undefined, async (_tx, club) => {
          club.teams[0].roster[0].withdrawn = true;
        });
      if (change === "canceled")
        await mutateFeePlan(sql, "owner", {
          action: "independentSeasonCancel",
          teamId: "base",
          revision: 1,
          reason: "Synthetic season cancellation.",
        });
      const send: typeof fetch = async () => {
        throw Error("A stale notification must not call the provider.");
      };
      const result = await deliverFeeReadyEmails(sql, env, send);
      assert.equal(result.failed, 0);
      assert.equal(
        (await sql<{ status: string }>`select status from fee_ready_notifications`)[0].status,
        "superseded",
      );
    } finally {
      await db.close();
    }
  });

test("pending team invitations retain issuer scope in fee notices and revoked staff cannot deliver them", async () => {
  const { sql, db, club } = await enrollmentFixture();
  try {
    await issueTeamInvitation(sql, "coach", {
      teamId: "base",
      playerId: "base-player",
      email: "guardian@example.invalid",
    });
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    assert.equal(
      (await sql`select id from fee_ready_notifications where team_id='base'`).length,
      1,
    );
    club.teams[0].coachEmail = "othercoach@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    let sends = 0;
    await deliverFeeReadyEmails(sql, env, async () => {
      sends++;
      return new Response(JSON.stringify({ id: "synthetic" }));
    });
    assert.equal(sends, 0);
    await sql`update coordinator_assignments set permissions=array['enrollment.manage','contacts.read'] where user_id='coordinator'`;
    await issueTeamInvitation(sql, "coordinator", {
      teamId: "soft",
      playerId: "soft-player",
      email: "guardian@example.invalid",
    });
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "soft",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    assert.equal(
      (await sql`select id from fee_ready_notifications where team_id='soft'`).length,
      1,
    );
    await sql`update coordinator_assignments set permissions=array['enrollment.read','contacts.read'] where user_id='coordinator'`;
    await deliverFeeReadyEmails(sql, env, async () => {
      sends++;
      return new Response(JSON.stringify({ id: "synthetic" }));
    });
    assert.equal(sends, 0);
  } finally {
    await db.close();
  }
});
