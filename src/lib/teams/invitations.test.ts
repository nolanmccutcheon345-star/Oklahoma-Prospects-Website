import { approveSyntheticNotices } from "../notifications/release-control.test-fixture";
import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { issueTeamInvitation, teamInvitationWorkspace } from "./invitations.server";
import {
  invitationIssuerAuthorized,
  queueInvitationEmail,
  deliverInvitationEmails,
  invitationDeliveryStatus,
} from "../invitation-delivery.server";

test("team invitation access is scoped, persistent, idempotent, revocable and independent of financial access", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    const input = { teamId: "base", playerId: "base-player", email: "guardian@example.invalid" };
    for (const actor of ["guardian", "player", "fake", "stranger", "othercoach", "coordinator"])
      await assert.rejects(issueTeamInvitation(sql, actor, input));
    await assert.rejects(
      issueTeamInvitation(sql, "coach", { ...input, email: "stranger@example.invalid" }),
      /listed guardian/,
    );
    await assert.rejects(
      issueTeamInvitation(sql, "coach", { ...input, playerId: "soft-player" }),
      /listed guardian/,
    );
    const invite = await issueTeamInvitation(sql, "coach", input);
    assert.equal((await issueTeamInvitation(sql, "owner", input)).id, invite.id);
    assert.equal((await sql`select invitation_id from invitation_delivery`).length, 0);
    await queueInvitationEmail(sql, "owner", invite.id);
    await queueInvitationEmail(sql, "coach", invite.id);
    await assert.rejects(queueInvitationEmail(sql, "othercoach", invite.id));
    let sends = 0;
    const env = {
      SQUARE_DEPLOY_CONTEXT: "production",
      CONTEXT: "production",
      RESEND_API_KEY: "synthetic",
      EMAIL_FROM: "office@example.invalid",
    };
    const send: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(body.text, /https:\/\/prospectssports\.club\/team-hub/);
      assert.match(body.text, /After accepting your invitation/);
      assert.doesNotMatch(body.text, /chatgpt\.site|Sample data/);
      sends++;
      return new Response(JSON.stringify({ id: "synthetic-message" }));
    };
    await approveSyntheticNotices(sql, "invitation", env, [invite.id]);
    await deliverInvitationEmails(sql, env, send, invite.id);
    await deliverInvitationEmails(sql, env, send, invite.id);
    assert.equal(sends, 1);
    const workspace = await teamInvitationWorkspace(sql, "coach", "base");
    assert.equal(workspace.players[0].guardians[0].invitation!.emailStatus, "accepted");
    assert.equal(workspace.published, false);
    assert.doesNotMatch(
      JSON.stringify(workspace),
      /feeLock|payments|balance|budget|medical|card|amountCents/,
    );
    await sql`update coordinator_assignments set permissions=array['enrollment.manage','contacts.read'] where user_id='coordinator'`;
    const soft = await issueTeamInvitation(sql, "coordinator", {
      ...input,
      teamId: "soft",
      playerId: "soft-player",
    });
    await queueInvitationEmail(sql, "othercoach", soft.id);
    await assert.rejects(teamInvitationWorkspace(sql, "coordinator", "base"));
    await assert.rejects(invitationDeliveryStatus(sql, "coordinator", invite.id, {}));
    const [stored] = await sql<{
      role: string;
      family_id: string;
      team_id: string;
      email: string;
      invited_by: string;
    }>`select * from club_invites where id=${soft.id}`;
    assert.equal(await invitationIssuerAuthorized(sql, stored), true);
    await approveSyntheticNotices(sql, "invitation", env, [soft.id]);
    await sql`update coordinator_assignments set permissions=array['enrollment.read','contacts.read'] where user_id='coordinator'`;
    assert.equal(await invitationIssuerAuthorized(sql, stored), false);
    await deliverInvitationEmails(sql, env, send, soft.id);
    assert.equal(sends, 1, "Permission revocation suppresses queued email");
    const runtime = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<typeof sql> };
    const oldSql = runtime.__pgSqlPromise__,
      oldUrl = process.env.DATABASE_URL,
      oldContext = process.env.CONTEXT;
    try {
      process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
      process.env.CONTEXT = "dev";
      runtime.__pgSqlPromise__ = Promise.resolve(sql);
      const { acceptInvitation } = await import("../invitations.server");
      await assert.rejects(acceptInvitation("stranger", invite.id), /unavailable/);
      await acceptInvitation("guardian", invite.id);
      assert.equal(
        (await sql<{ status: string }>`select status from club_invites where id=${invite.id}`)[0]
          .status,
        "accepted",
      );
      assert.equal(
        (
          await sql`select 1 from household_members where household_id='home-guardian' and user_id='stranger'`
        ).length,
        0,
      );
    } finally {
      runtime.__pgSqlPromise__ = oldSql;
      if (oldUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldUrl;
      if (oldContext === undefined) delete process.env.CONTEXT;
      else process.env.CONTEXT = oldContext;
    }
    await sql`update club_invites set expires_at=now()-interval '1 second' where id=${invite.id}`;
    const renewed = await issueTeamInvitation(sql, "coach", input);
    assert.notEqual(renewed.id, invite.id);
    club.teams[0].roster[0].withdrawn = true;
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await assert.rejects(queueInvitationEmail(sql, "coach", renewed.id));
    await assert.rejects(issueTeamInvitation(sql, "owner", input));
  } finally {
    await db.close();
  }
});
