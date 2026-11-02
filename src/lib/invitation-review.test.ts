import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "./enrollment/test-fixture";
import {
  prepareInvitationEmail,
  sendReviewedInvitationEmail,
  deliverInvitationEmails,
} from "./invitation-delivery.server";
const env = {
  SQUARE_DEPLOY_CONTEXT: "production",
  CONTEXT: "production",
  RESEND_API_KEY: "synthetic",
  RESEND_FROM_EMAIL: "office@example.invalid",
};

test("owner reviews one invitation in place and sends only its immutable approved message; retries stay idempotent", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const id = randomUUID(),
      unrelated = randomUUID();
    for (const key of [id, unrelated])
      await sql`insert into club_invites(id,token_hash,email,role,invited_by,expires_at) values(${key},${key},'guardian@example.invalid','parent','owner',now()+interval '7 days')`;
    const preview = await prepareInvitationEmail(sql, "owner", id, env);
    await prepareInvitationEmail(sql, "owner", unrelated, env);
    assert.deepEqual(preview.blockers, []);
    assert.equal(preview.review?.approvalStatus, "held");
    assert.deepEqual(preview.review?.recipients, ["guardian@example.invalid"]);
    assert.match(preview.review!.text, /https:\/\/prospectssports.club\/invitations/);
    assert.equal((await sql`select * from notice_release_approvals`).length, 0);
    const calls: { body: string; key: string | null }[] = [];
    const send: typeof fetch = async (_url, init) => {
      calls.push({
        body: String(init?.body),
        key: new Headers(init?.headers).get("Idempotency-Key"),
      });
      return calls.length === 1
        ? new Response("Provider unavailable", { status: 503 })
        : Response.json({ id: "synthetic-provider" });
    };
    assert.equal((await deliverInvitationEmails(sql, env, send)).accepted, 0);
    assert.equal(calls.length, 0);
    const failed = await sendReviewedInvitationEmail(
      sql,
      "owner",
      id,
      preview.review!.digest,
      env,
      send,
    );
    assert.equal(failed.status, "pending");
    assert.match(failed.message, /not been accepted.*retry after/);
    assert.equal(JSON.parse(calls[0].body).text, preview.review!.text);
    await sendReviewedInvitationEmail(sql, "owner", id, preview.review!.digest, env, send);
    assert.equal(calls.length, 1, "Backoff prevents an immediate second provider attempt");
    await sql`update invitation_delivery set next_attempt_at=now() where invitation_id=${id}`;
    const accepted = await sendReviewedInvitationEmail(
      sql,
      "owner",
      id,
      preview.review!.digest,
      env,
      send,
    );
    assert.equal(accepted.status, "accepted");
    assert.deepEqual(calls[0], calls[1]);
    await sendReviewedInvitationEmail(sql, "owner", id, preview.review!.digest, env, send);
    assert.equal(calls.length, 2, "Already accepted messages never send twice");
    const [held] =
      await sql`select status,attempts from invitation_delivery where invitation_id=${unrelated}`;
    assert.deepEqual(held, { status: "pending", attempts: 0 });
    assert.equal(
      (await sql`select * from notice_release_approvals where source_id=${unrelated}`).length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("inline invitation send rejects changed content, nonowners, previews, pause, missing provider and revoked authority", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const id = randomUUID();
    await sql`insert into club_invites(id,token_hash,email,role,family_id,invited_by,expires_at) values(${id},${id},'stranger@example.invalid','parent','home-guardian','guardian',now()+interval '7 days')`;
    const preview = await prepareInvitationEmail(sql, "owner", id, env);
    const guardian = await prepareInvitationEmail(sql, "guardian", id, env);
    assert.equal(guardian.review, null);
    assert.match(guardian.blockers.join(" "), /owner must review/);
    let calls = 0;
    const send: typeof fetch = async () => {
      calls++;
      return Response.json({ id: "unexpected" });
    };
    for (const actor of ["guardian", "fake", "coach", "stranger"]) {
      await assert.rejects(
        sendReviewedInvitationEmail(sql, actor, id, preview.review!.digest, env, send),
      );
    }
    for (const patch of [
      { INVITATION_EMAIL_PAUSED: "true" },
      { RESEND_API_KEY: "" },
      { CONTEXT: "deploy-preview" },
    ]) {
      await assert.rejects(
        sendReviewedInvitationEmail(
          sql,
          "owner",
          id,
          preview.review!.digest,
          { ...env, ...patch },
          send,
        ),
        /paused|configured|production/,
      );
    }
    await sql`update club_invites set email='changed@example.invalid' where id=${id}`;
    await assert.rejects(
      sendReviewedInvitationEmail(sql, "owner", id, preview.review!.digest, env, send),
      /changed/,
    );
    assert.equal((await sql`select * from notice_release_approvals`).length, 0);
    const latest = await prepareInvitationEmail(sql, "owner", id, env);
    await sql`update "user" set "disabledAt"=now() where id='guardian'`;
    await assert.rejects(
      sendReviewedInvitationEmail(sql, "owner", id, latest.review!.digest, env, send),
      /unavailable/,
    );
    assert.equal(calls, 0);
  } finally {
    await db.close();
  }
});
