import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { enrollmentFixture } from "./enrollment/test-fixture";
import {
  queueInvitationEmail,
  deliverInvitationEmails,
  invitationDeliveryStatus,
  invitationIssuerAuthorized,
} from "./invitation-delivery.server";
const env = {
  CONTEXT: "production",
  SQUARE_DEPLOY_CONTEXT: "production",
  RESEND_API_KEY: "synthetic",
  RESEND_FROM_EMAIL: "office@example.invalid",
};
async function invitation(sql: Sql, email = "guardian@example.invalid") {
  const id = randomUUID();
  await sql`insert into club_invites(id,token_hash,email,role,invited_by,expires_at) values(${id},${id},${email},'parent','owner',now()+interval '7 days')`;
  return id;
}
test("invitations send only after an explicit request; retries retain one payload and provider idempotency key", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const id = await invitation(sql);
    const calls: { key: string | null; body: string }[] = [];
    const send: typeof fetch = async (_u, init) => {
      calls.push({
        key: new Headers(init?.headers).get("Idempotency-Key"),
        body: String(init?.body),
      });
      return new Response(JSON.stringify({ id: "provider-id" }), {
        status: calls.length === 1 ? 500 : 200,
      });
    };
    assert.equal((await deliverInvitationEmails(sql, env, send)).accepted, 0);
    assert.equal(calls.length, 0);
    for (const actor of ["guardian", "coach", "coordinator", "fake", "stranger"])
      await assert.rejects(queueInvitationEmail(sql, actor, id), /unavailable/);
    await queueInvitationEmail(sql, "owner", id);
    await queueInvitationEmail(sql, "owner", id);
    assert.equal((await deliverInvitationEmails(sql, env, send, id)).failed, 1);
    await sql`update invitation_delivery set next_attempt_at=now() where invitation_id=${id}`;
    assert.equal(
      (
        await deliverInvitationEmails(
          sql,
          { ...env, RESEND_FROM_EMAIL: "changed@example.invalid" },
          send,
          id,
        )
      ).accepted,
      1,
    );
    assert.deepEqual(calls[0], calls[1]);
    assert.match(calls[0].body, /https:\/\/prospectssports.club\/invitations/);
    await queueInvitationEmail(sql, "owner", id);
    await deliverInvitationEmails(sql, env, send, id);
    assert.equal(calls.length, 2);
    assert.equal(
      (await invitationDeliveryStatus(sql, "owner", id, {}, send)).delivery,
      "not confirmed",
    );
    const delivered: typeof fetch = async () =>
      new Response(JSON.stringify({ to: ["guardian@example.invalid"], last_event: "delivered" }));
    assert.equal(
      (await invitationDeliveryStatus(sql, "owner", id, env, delivered)).delivery,
      "delivered",
    );
    const bounced: typeof fetch = async () =>
      new Response(JSON.stringify({ to: ["guardian@example.invalid"], last_event: "bounced" }));
    assert.equal(
      (await invitationDeliveryStatus(sql, "owner", id, env, bounced)).delivery,
      "bounced",
    );
    const wrong: typeof fetch = async () =>
      new Response(JSON.stringify({ to: ["other@example.invalid"], last_event: "delivered" }));
    await assert.rejects(
      invitationDeliveryStatus(sql, "owner", id, env, wrong),
      /recipient mismatch/,
    );
  } finally {
    await db.close();
  }
});
test("delivery suppresses expired, revoked and unauthorized invites and isolates preview recipients", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    let calls = 0;
    const send: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ id: "test-message" }));
    };
    for (const status of ["revoked", "accepted", "expired"]) {
      const id = await invitation(sql);
      await queueInvitationEmail(sql, "owner", id);
      if (status === "expired")
        await sql`update club_invites set expires_at=now()-interval '1 second' where id=${id}`;
      else await sql`update club_invites set status=${status} where id=${id}`;
      await deliverInvitationEmails(sql, env, send, id);
      assert.equal(
        (
          await sql<{
            status: string;
          }>`select status from invitation_delivery where invitation_id=${id}`
        )[0].status,
        "superseded",
      );
    }
    assert.equal(calls, 0);
    const preview = await invitation(sql);
    await queueInvitationEmail(sql, "owner", preview);
    await deliverInvitationEmails(
      sql,
      {
        ...env,
        SQUARE_DEPLOY_CONTEXT: "deploy-preview",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://preview.example.invalid",
      },
      send,
      preview,
    );
    assert.equal(calls, 0);
    await deliverInvitationEmails(
      sql,
      {
        ...env,
        SQUARE_DEPLOY_CONTEXT: "deploy-preview",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://preview.example.invalid",
        AUTH_EMAIL_TEST_RECIPIENTS: "guardian@example.invalid",
      },
      send,
      preview,
    );
    assert.equal(calls, 1);
    const revokedOwner = await invitation(sql);
    await queueInvitationEmail(sql, "owner", revokedOwner);
    await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    await deliverInvitationEmails(sql, env, send, revokedOwner);
    assert.equal(calls, 1);
    assert.equal(
      await invitationIssuerAuthorized(sql, {
        invited_by: "owner",
        family_id: null,
        role: "parent",
      }),
      false,
    );
    assert.equal(
      await invitationIssuerAuthorized(sql, {
        invited_by: "guardian",
        family_id: "home-guardian",
        role: "parent",
      }),
      true,
    );
    await sql`delete from household_members where user_id='guardian'`;
    assert.equal(
      await invitationIssuerAuthorized(sql, {
        invited_by: "guardian",
        family_id: "home-guardian",
        role: "parent",
      }),
      false,
    );
  } finally {
    await db.close();
  }
});
test("ambiguous email retries stop before provider idempotency expires and never silently resend", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const id = await invitation(sql);
    await queueInvitationEmail(sql, "owner", id);
    await sql`update invitation_delivery set first_attempt_at=now()-interval '24 hours',attempts=1 where invitation_id=${id}`;
    const send: typeof fetch = async () => {
      throw new Error("Unexpected provider call");
    };
    await deliverInvitationEmails(sql, env, send, id);
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from invitation_delivery where invitation_id=${id}`
      )[0].status,
      "review",
    );
    await queueInvitationEmail(sql, "owner", id);
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from invitation_delivery where invitation_id=${id}`
      )[0].status,
      "review",
    );
  } finally {
    await db.close();
  }
});
