import { approveSyntheticNotices } from "./notifications/release-control.test-fixture";
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
    assert.equal((await deliverInvitationEmails(sql, env, send, id)).accepted, 0);
    assert.equal(calls.length, 0, "Queued invitations are held until exact owner approval");
    await approveSyntheticNotices(sql, "invitation", env, [id]);
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
      await approveSyntheticNotices(sql, "invitation", env, [id]);
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
        "pending", // Changed invitation invalidates approval and remains safely held.
      );
    }
    assert.equal(calls, 0);
    const preview = await invitation(sql);
    await queueInvitationEmail(sql, "owner", preview);
    await approveSyntheticNotices(sql, "invitation", env, [preview]);
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
    await approveSyntheticNotices(
      sql,
      "invitation",
      {
        ...env,
        SQUARE_DEPLOY_CONTEXT: "deploy-preview",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://preview.example.invalid",
      },
      [preview],
    );
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
    await approveSyntheticNotices(sql, "invitation", env, [revokedOwner]);
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
    await approveSyntheticNotices(sql, "invitation", env, [id]);
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

test("a selected approved invitation sends without releasing an older unrelated backlog", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const held = await invitation(sql, "held@example.invalid");
    await queueInvitationEmail(sql, "owner", held);
    const selected = await invitation(sql);
    await queueInvitationEmail(sql, "owner", selected);
    await approveSyntheticNotices(sql, "invitation", env, [selected]);
    const recipients: string[] = [];
    const send: typeof fetch = async (_url, init) => {
      recipients.push(...JSON.parse(String(init?.body)).to);
      return Response.json({ id: "synthetic-selected-provider" });
    };
    assert.equal((await deliverInvitationEmails(sql, env, send, selected)).accepted, 1);
    assert.equal((await deliverInvitationEmails(sql, env, send, selected)).accepted, 0);
    await deliverInvitationEmails(sql, env, send);
    assert.deepEqual(recipients, ["guardian@example.invalid"]);
    const [preserved] =
      await sql`select status,attempts,provider_message_id from invitation_delivery where invitation_id=${held}`;
    assert.deepEqual(preserved, { status: "pending", attempts: 0, provider_message_id: null });
  } finally {
    await db.close();
  }
});

for (const stop of ["hold", "owner-revoked"] as const)
  test(`invitation ${stop} after claim prevents the provider call and later worker retries`, async () => {
    const { db, sql } = await enrollmentFixture();
    try {
      const id = await invitation(sql);
      await queueInvitationEmail(sql, "owner", id);
      await approveSyntheticNotices(sql, "invitation", env, [id]);
      let intercepted = false;
      const guarded = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
        if (!intercepted && parts.join("?").includes("and status='pending' and expires_at>now()")) {
          intercepted = true;
          if (stop === "owner-revoked") {
            await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
          } else {
            const { auditNoticeReleases, holdNoticeReleases } =
              await import("./notifications/release-control.server");
            const item = (
              await auditNoticeReleases(sql, "owner", env, { queue: "invitation" })
            ).rows.find((r) => r.id === id)!;
            await holdNoticeReleases(sql, "owner", env, {
              items: [{ queue: item.queue, id: item.id, digest: item.digest }],
              reason: "Synthetic owner hold after claim",
            });
          }
        }
        return sql(parts, ...values);
      }) as Sql;
      guarded.query = sql.query;
      guarded.transaction = sql.transaction;
      let calls = 0;
      const send: typeof fetch = async () => {
        calls++;
        return Response.json({ id: "must-not-be-created" });
      };
      await deliverInvitationEmails(guarded, env, send, id);
      assert.equal(intercepted, true);
      assert.equal(calls, 0, "Final gate must recheck approval and owner authority after claiming");
      await sql`update invitation_delivery set lease_until=now()-interval '1 minute' where invitation_id=${id}`;
      await deliverInvitationEmails(sql, env, send, id);
      assert.equal(calls, 0);
      const [row] =
        await sql`select status,attempts,first_attempt_at,request_body,provider_message_id from invitation_delivery where invitation_id=${id}`;
      assert.notEqual(row.status, "accepted");
      assert.equal(row.provider_message_id, null);
      if (stop === "hold") {
        assert.equal(row.status, "pending", "A known-not-submitted claim must be recoverable");
        assert.equal(row.attempts, 0);
        assert.equal(row.first_attempt_at, null);
        assert.ok(row.request_body, "Frozen message body remains available for exact reapproval");
        assert.deepEqual((row.request_body as { to: string[] }).to, ["guardian@example.invalid"]);
        await approveSyntheticNotices(sql, "invitation", env, [id]);
        assert.equal((await deliverInvitationEmails(sql, env, send, id)).accepted, 1);
        assert.equal(
          calls,
          1,
          "Fresh exact owner approval safely resumes the never-submitted message",
        );
      }
    } finally {
      await db.close();
    }
  });
