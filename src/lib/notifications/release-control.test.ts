import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "../enrollment/test-fixture";
import {
  auditNoticeReleases,
  approveNoticeReleases,
  holdNoticeReleases,
  dispatchNoticeReleases,
  noticeReleaseAllowed,
  releaseUnsubmittedNoticeClaim,
} from "./release-control.server";
import type { NoticeReleaseItem } from "./release-control-contracts";
import { deliverCenterNotifications } from "../tryout-center-delivery.server";
const pick = (x: NoticeReleaseItem) => ({ queue: x.queue, id: x.id, digest: x.digest });
const env = {
  SQUARE_DEPLOY_CONTEXT: "production",
  CONTEXT: "production",
  RESEND_API_KEY: "synthetic-only",
  RESEND_FROM_EMAIL: "Prospects <synthetic@example.invalid>",
  TRYOUT_NOTIFICATIONS_ENABLED: "false",
};
async function fixture() {
  const f = await enrollmentFixture();
  await f.sql`insert into club_requests(id,kind,payload) values('release-request','tryout','{"player":"Synthetic athlete","email":"guardian@example.invalid"}'::jsonb)`;
  for (const id of ["old-a", "old-b"])
    await f.sql`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key) values(${id},'release-request','guardian@example.invalid',${"Subject " + id},${"Body " + id},${id})`;
  return f;
}
test("owner preview is read-only, default holds every old and new message, and exact selected dispatch ignores unrelated backlog", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const send = (async () => {
      calls++;
      return Response.json({ id: "synthetic-provider-" + calls });
    }) as typeof fetch;
    const before = await auditNoticeReleases(f.sql, "owner", env, { queue: "center", limit: 1 });
    assert.equal(before.rows.length, 1);
    const initialHeld = before.counts.find((x) => x.queue === "center")!.held;
    assert.ok(initialHeld >= 2);
    assert.ok(before.nextCursor);
    assert.equal((await f.sql`select * from notice_release_approvals`).length, 0);
    await deliverCenterNotifications(f.sql, { ...env, TRYOUT_NOTIFICATIONS_ENABLED: "true" }, send);
    assert.equal(calls, 0);
    const item = (
      await auditNoticeReleases(f.sql, "owner", env, { queue: "center", limit: 50 })
    ).rows.find((r) => r.id === "old-b")!;
    await approveNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true });
    assert.equal(await noticeReleaseAllowed(f.sql, "center", item.id, env), true);
    await f.sql`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key) values('new-c','release-request','guardian@example.invalid','New','New content','new-c')`;
    const result = await dispatchNoticeReleases(
      f.sql,
      "owner",
      env,
      { items: [pick(item)], confirmed: true },
      send,
    );
    assert.equal(result.results[0].status, "sent");
    assert.equal(calls, 1);
    assert.equal(env.TRYOUT_NOTIFICATIONS_ENABLED, "false");
    await assert.rejects(
      dispatchNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true }, send),
      /not currently approved/,
    );
    assert.equal(calls, 1);
    const after = await auditNoticeReleases(f.sql, "owner", env, { queue: "center", limit: 50 });
    assert.equal(after.counts.find((x) => x.queue === "center")?.held, initialHeld);
    assert.equal(after.counts.find((x) => x.queue === "center")?.sent, 1);
    assert.equal(
      (await f.sql`select attempts from tryout_center_notices where id='old-a'`)[0].attempts,
      0,
    );
    assert.equal(
      (await f.sql`select attempts from tryout_center_notices where id='new-c'`)[0].attempts,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("owner authority and exact content digest are rechecked; holds preserve original records and invalidate release", async () => {
  const f = await fixture();
  try {
    const view = await auditNoticeReleases(f.sql, "owner", env, { queue: "center" }),
      item = view.rows[0];
    for (const actor of ["fake", "coach", "guardian", "coordinator", "player"]) {
      await assert.rejects(auditNoticeReleases(f.sql, actor, env), /owner access/);
      await assert.rejects(
        approveNoticeReleases(f.sql, actor, env, { items: [pick(item)], confirmed: true }),
        /owner access/,
      );
    }
    await approveNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true });
    await holdNoticeReleases(f.sql, "owner", env, {
      items: [pick(item)],
      reason: "Owner holds this message",
    });
    assert.equal(await noticeReleaseAllowed(f.sql, "center", item.id, env), false);
    assert.equal(
      (await f.sql`select status from tryout_center_notices where id=${item.id}`)[0].status,
      "pending",
    );
    await approveNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true });
    await f.sql`update tryout_center_notices set body='Changed after owner preview' where id=${item.id}`;
    assert.equal(await noticeReleaseAllowed(f.sql, "center", item.id, env), false);
    await assert.rejects(
      dispatchNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true }),
      /not currently approved/,
    );
    const changed = (await auditNoticeReleases(f.sql, "owner", env, { queue: "center" })).rows.find(
      (x) => x.id === item.id,
    )!;
    assert.notEqual(changed.digest, item.digest);
    await approveNoticeReleases(f.sql, "owner", env, { items: [pick(changed)], confirmed: true });
    await f.sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    assert.equal(await noticeReleaseAllowed(f.sql, "center", item.id, env), false);
  } finally {
    await f.db.close();
  }
});
test("failed attempts retain approved immutable body and idempotency key; unapproved prior attempts cannot be renewed", async () => {
  const f = await fixture();
  try {
    const item = (await auditNoticeReleases(f.sql, "owner", env, { queue: "center" })).rows[0];
    await approveNoticeReleases(f.sql, "owner", env, { items: [pick(item)], confirmed: true });
    const bodies: string[] = [],
      keys: string[] = [];
    const send = (async (_u, init) => {
      bodies.push(String(init?.body));
      keys.push(String((init?.headers as Record<string, string>)["Idempotency-Key"]));
      if (keys.length === 1) throw Error("Synthetic uncertain outcome");
      return Response.json({ id: "provider-retry" });
    }) as typeof fetch;
    await dispatchNoticeReleases(
      f.sql,
      "owner",
      env,
      { items: [pick(item)], confirmed: true },
      send,
    );
    await f.sql`update tryout_center_notices set next_attempt_at=now() where id=${item.id}`;
    await dispatchNoticeReleases(
      f.sql,
      "owner",
      env,
      { items: [pick(item)], confirmed: true },
      send,
    );
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(bodies[0], bodies[1]);
    await f.sql`update tryout_center_notices set attempts=1 where id='old-b'`;
    const old = (await auditNoticeReleases(f.sql, "owner", env, { queue: "center" })).rows.find(
      (r) => r.id === "old-b",
    )!;
    await assert.rejects(
      approveNoticeReleases(f.sql, "owner", env, { items: [pick(old)], confirmed: true }),
      /Previously attempted/,
    );
  } finally {
    await f.db.close();
  }
});

test("known-unsent claim recovery cannot erase prior uncertain attempts or another worker lease", async () => {
  const f = await fixture();
  try {
    const body = {
      from: env.RESEND_FROM_EMAIL,
      to: ["guardian@example.invalid"],
      subject: "Frozen",
      text: "Frozen original",
    };
    await f.sql`update tryout_center_notices set status='processing',attempts=2,first_attempt_at='2026-10-29T12:00:00Z',request_body=${JSON.stringify(body)}::jsonb,lease_token='owned',lease_until=now()+interval '2 minutes' where id='old-a'`;
    await releaseUnsubmittedNoticeClaim(f.sql, "center", "old-a", "wrong");
    assert.equal(
      (await f.sql`select attempts from tryout_center_notices where id='old-a'`)[0].attempts,
      2,
    );
    await releaseUnsubmittedNoticeClaim(f.sql, "center", "old-a", "owned");
    const [r] =
      await f.sql`select status,attempts,first_attempt_at,request_body,lease_token from tryout_center_notices where id='old-a'`;
    assert.equal(r.status, "pending");
    assert.equal(r.attempts, 1);
    assert.ok(r.first_attempt_at);
    assert.deepEqual(r.request_body, body);
    assert.equal(r.lease_token, null);
    await releaseUnsubmittedNoticeClaim(f.sql, "center", "old-a", "owned");
    assert.equal(
      (await f.sql`select attempts from tryout_center_notices where id='old-a'`)[0].attempts,
      1,
    );
  } finally {
    await f.db.close();
  }
});
