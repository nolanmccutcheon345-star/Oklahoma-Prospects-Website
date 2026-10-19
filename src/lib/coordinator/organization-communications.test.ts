import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { audit } from "./access.server";
import { decideApproval } from "./governance.server";
import { deliverCenterNotifications } from "../tryout-center-delivery.server";
import {
  organizationDrafts,
  organizationOwnActivity,
  saveOrganizationDraft,
  sendOrganizationRecruitingEmail,
} from "./organization-communications.server";

const CANARY = "PRIVATE-FINANCIAL-91827345";
async function fixture() {
  const db = new PGlite();
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${name}`, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, values: unknown[] = []) =>
      (await query(q, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  assert.equal(
    (await sql`select user_id from organization_operational_access`).length,
    0,
    "Migration must not activate any account",
  );
  for (const id of ["steve", "sara", "legacy", "other", "fake"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" || id === "fake" ? "admin" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into staff_authorities(email,capability) values('steve@example.invalid','staff_approvals.review')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  for (const actor of ["sara", "legacy"])
    await sql`insert into coordinator_assignments(user_id,sport,status,coverage,permissions,updated_by) values(${actor},'baseball','active','sport',array['communications.recruit.send','contacts.read'],'steve')`;
  const club = {
    teams: [
      { id: "base", name: "Test Baseball", sport: "baseball", closed: false },
      { id: "soft", name: "Test Softball", sport: "softball", closed: false },
    ],
  };
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  for (const sport of ["baseball", "softball"])
    await sql`insert into club_requests(id,kind,payload) values(${sport},'tryout',${JSON.stringify({ sport, preferredTeamId: sport === "baseball" ? "base" : "soft", email: "guardian@example.invalid", notes: CANARY, invoice: 91827345 })}::jsonb)`;
  return { db, sql };
}
const draft = () => ({
  id: randomUUID(),
  sport: "baseball" as const,
  teamId: "base",
  revision: 0,
  title: "Practice update",
  body: "Arrive at 5 pm.",
  submit: false,
});
const mail = () => ({
  id: randomUUID(),
  requestId: "baseball",
  subject: "Tryout time",
  body: "Please confirm your tryout time.",
  confirmedEmail: "guardian@example.invalid",
});
async function allowed(
  sql: Sql,
  actor = "sara",
  requestId = "baseball",
  recipient = "guardian@example.invalid",
) {
  return (
    await sql<{
      allowed: boolean;
    }>`select coordinator_notice_allowed(${actor},${requestId},${recipient}) as allowed`
  )[0].allowed;
}

test("operational recruiting email is exact-recipient bound, cross-sport, and idempotently queued", async () => {
  const { db, sql } = await fixture();
  try {
    const email = mail();
    await assert.rejects(
      () =>
        sendOrganizationRecruitingEmail(sql, "sara", {
          ...email,
          confirmedEmail: "stranger@example.invalid",
        }),
      /recipient changed/,
    );
    assert.deepEqual(await sendOrganizationRecruitingEmail(sql, "sara", email), {
      ok: true,
      delivery: "queued",
    });
    assert.deepEqual(await sendOrganizationRecruitingEmail(sql, "sara", email), {
      ok: true,
      delivery: "queued",
    });
    await assert.rejects(
      () => sendOrganizationRecruitingEmail(sql, "sara", { ...email, body: "Changed content" }),
      /identifier was already used/,
    );
    await assert.rejects(
      () => sendOrganizationRecruitingEmail(sql, "steve", email),
      /identifier was already used/,
    );
    assert.equal((await sql`select id from tryout_center_notices where id=${email.id}`).length, 1);
    assert.equal(
      (
        await sql`select id from tryout_center_activity where request_id='baseball' and actor_id='sara' and kind='email'`
      ).length,
      1,
    );
    await sendOrganizationRecruitingEmail(sql, "sara", { ...mail(), requestId: "softball" });
    assert.equal(await allowed(sql, "sara", "softball"), true);
    await sendOrganizationRecruitingEmail(sql, "steve", mail());
    assert.equal(await allowed(sql, "steve"), true);
    await sql`update club_requests set payload=jsonb_set(payload,'{email}','"changed@example.invalid"') where id='baseball'`;
    assert.equal(await allowed(sql), false);
    await assert.rejects(
      () => sendOrganizationRecruitingEmail(sql, "sara", email),
      /recipient changed/,
    );
    const [notice] = await sql<{
      email: string;
      body: string;
    }>`select email,body from tryout_center_notices where id=${email.id}`;
    assert.equal(notice.email, "guardian@example.invalid");
    assert.equal(notice.body, email.body);
    assert.ok(!JSON.stringify(notice).includes(CANARY));
  } finally {
    await db.close();
  }
});

test("delivery recheck cannot fall back to legacy grants for restricted suspended/removed accounts", async () => {
  const { db, sql } = await fixture();
  try {
    assert.equal(await allowed(sql), true);
    assert.equal(
      await allowed(sql, "legacy"),
      true,
      "Unrestricted prior coordinator workflow remains available",
    );
    assert.equal(await allowed(sql, "legacy", "softball"), false);
    const queued = mail();
    await sendOrganizationRecruitingEmail(sql, "sara", queued);
    for (const status of ["suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      assert.equal(await allowed(sql), false);
      await assert.rejects(() => sendOrganizationRecruitingEmail(sql, "sara", mail()));
      await assert.rejects(() =>
        organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" }),
      );
      await assert.rejects(() => saveOrganizationDraft(sql, "sara", draft()));
      await assert.rejects(() => organizationOwnActivity(sql, "sara"));
    }
    let calls = 0;
    const delivered = await deliverCenterNotifications(
      sql,
      {
        RESEND_API_KEY: "synthetic-not-a-credential",
        RESEND_FROM_EMAIL: "no-reply@example.invalid",
        TRYOUT_NOTIFICATIONS_ENABLED: "true",
        SQUARE_DEPLOY_CONTEXT: "development",
        TRYOUT_EMAIL_TEST_RECIPIENTS: "guardian@example.invalid",
      },
      async () => {
        calls++;
        throw new Error("Revoked mail must not reach the transport");
      },
    );
    assert.equal(calls, 0);
    assert.equal(delivered.accepted, 0);
    assert.equal(
      (await sql`select status from tryout_center_notices where id=${queued.id}`)[0].status,
      "skipped",
    );
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    await sql`update "user" set "emailVerified"=false where id='sara'`;
    assert.equal(await allowed(sql), false);
    await assert.rejects(() => sendOrganizationRecruitingEmail(sql, "sara", mail()));
    await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='sara'`;
    assert.equal(await allowed(sql), false);
    await assert.rejects(() => organizationOwnActivity(sql, "sara"));
    for (const actor of ["other", "fake", "legacy"]) {
      await assert.rejects(() => sendOrganizationRecruitingEmail(sql, actor, mail()));
      await assert.rejects(() => saveOrganizationDraft(sql, actor, draft()));
      await assert.rejects(() =>
        organizationDrafts(sql, actor, { sport: "baseball", teamId: "base" }),
      );
      await assert.rejects(() => organizationOwnActivity(sql, actor));
    }
  } finally {
    await db.close();
  }
});

test("draft create/edit/submit uses existing owner-review workflow and withholds historical mixed content", async () => {
  const { db, sql } = await fixture();
  try {
    const historical = randomUUID(),
      other = randomUUID(),
      d = draft();
    await sql`insert into coordinator_drafts(id,user_id,sport,team_id,title,body) values(${historical},'sara','baseball','base',${CANARY},${CANARY})`;
    await sql`insert into coordinator_drafts(id,user_id,sport,team_id,title,body,content_classification,classified_revision) values(${other},'steve','baseball','base','Owner draft',${CANARY},'operational',1)`;
    assert.deepEqual(await organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" }), {
      items: [],
      withheldCount: 1,
    });
    await assert.rejects(() =>
      saveOrganizationDraft(sql, "sara", { ...d, id: historical, revision: 1 }),
    );
    await assert.rejects(() =>
      saveOrganizationDraft(sql, "sara", { ...d, id: other, revision: 1 }),
    );
    assert.deepEqual(await saveOrganizationDraft(sql, "sara", d), {
      ok: true,
      id: d.id,
      revision: 1,
      status: "draft",
    });
    await assert.rejects(() => saveOrganizationDraft(sql, "sara", d), /Draft changed/);
    const edited = { ...d, revision: 1, body: "Arrive at 6 pm." };
    assert.equal((await saveOrganizationDraft(sql, "sara", edited)).revision, 2);
    const listed = await organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].body, edited.body);
    assert.equal(listed.items[0].revision, 2);
    assert.ok(!JSON.stringify(listed).includes(CANARY));
    const submitted = await saveOrganizationDraft(sql, "sara", {
      ...edited,
      revision: 2,
      submit: true,
    });
    assert.equal(submitted.status, "submitted");
    assert.equal(submitted.revision, 3);
    const [approval] = await sql<{
      proposal: { revision: number };
      status: string;
      kind: string;
    }>`select proposal,status,kind from coordinator_approvals where id=${d.id}`;
    assert.deepEqual(approval, { proposal: { revision: 3 }, status: "pending", kind: "content" });
    await assert.rejects(() => saveOrganizationDraft(sql, "sara", { ...edited, revision: 3 }));
    assert.equal(
      (await organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" })).items[0]
        .status,
      "submitted",
    );
    assert.equal(
      (await sql`select body from coordinator_drafts where id=${historical}`)[0].body,
      CANARY,
    );
  } finally {
    await db.close();
  }
});

test("classification is revision-bound and sport/team scopes cannot be forged", async () => {
  const { db, sql } = await fixture();
  try {
    const d = draft();
    await saveOrganizationDraft(sql, "sara", d);
    await sql`update coordinator_drafts set title=${CANARY},body=${CANARY},revision=revision+1 where id=${d.id}`;
    const result = await organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" });
    assert.deepEqual(result, { items: [], withheldCount: 1 });
    await assert.rejects(() => saveOrganizationDraft(sql, "sara", { ...d, revision: 2 }));
    await assert.rejects(() => saveOrganizationDraft(sql, "sara", { ...draft(), teamId: "soft" }));
    await assert.rejects(() =>
      organizationDrafts(sql, "sara", { sport: "softball", teamId: "base" }),
    );
    await assert.rejects(() =>
      saveOrganizationDraft(sql, "sara", { ...draft(), teamId: "unknown" }),
    );
    await sql`update club_requests set payload=jsonb_set(payload,'{preferredTeamId}','"soft"') where id='baseball'`;
    assert.equal(await allowed(sql), false);
    await assert.rejects(() => sendOrganizationRecruitingEmail(sql, "sara", mail()));
    await assert.rejects(() =>
      saveOrganizationDraft(sql, "sara", { ...draft(), invoice: CANARY } as never),
    );
    await assert.rejects(() =>
      sendOrganizationRecruitingEmail(sql, "sara", { ...mail(), providerPayload: CANARY } as never),
    );
  } finally {
    await db.close();
  }
});

test("own activity is actor-scoped and returns only allowlisted summary fields", async () => {
  const { db, sql } = await fixture();
  try {
    await audit(
      sql,
      "sara",
      "organization.team.save",
      "base",
      "allowed",
      { before: { payment: CANARY }, after: { invoice: 91827345 } },
      "baseball",
      "base",
    );
    await audit(
      sql,
      "sara",
      "communications.recruit.send",
      "message-id",
      "allowed",
      { body: CANARY },
      "softball",
      "soft",
    );
    await audit(
      sql,
      "steve",
      "organization.team.save",
      "private-target",
      "allowed",
      { payment: CANARY },
      "baseball",
      "base",
    );
    await audit(sql, "sara", "financial.invoice.export", CANARY, "allowed", { payment: CANARY });
    const activity = await organizationOwnActivity(sql, "sara");
    assert.equal(activity.length, 2);
    for (const entry of activity) {
      assert.deepEqual(
        Object.keys(entry).sort(),
        ["action", "targetId", "result", "sport", "teamId", "createdAt"].sort(),
      );
      assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
    }
    assert.ok(!JSON.stringify(activity).includes(CANARY));
    assert.ok(!JSON.stringify(activity).includes("private-target"));
    assert.deepEqual(await organizationOwnActivity(sql, "steve"), [
      {
        action: "organization.team.save",
        targetId: "private-target",
        result: "allowed",
        sport: "baseball",
        teamId: "base",
        createdAt: (await organizationOwnActivity(sql, "steve"))[0].createdAt,
      },
    ]);
  } finally {
    await db.close();
  }
});

test("reviewed communication transports explicitly opt in and keep legacy middleware unchanged", async () => {
  const api = await readFile("src/lib/coordinator/organization-communications-api.ts", "utf8");
  assert.equal((api.match(/\.middleware\(\[operationalAuthMiddleware\]\)/g) || []).length, 4);
  assert.match(
    await readFile("src/lib/coordinator/api.ts", "utf8"),
    /\.middleware\(\[authMiddleware\]\)/,
  );
  assert.match(
    await readFile("src/lib/tryout-center-delivery.server.ts", "utf8"),
    /coordinator_notice_allowed\(coordinator_actor_id,request_id,email\)/,
  );
});

test("owner reviews classified organization submissions without legacy grants and cannot bypass revocation", async () => {
  const { db, sql } = await fixture();
  try {
    const submitted = { ...draft(), submit: true };
    await saveOrganizationDraft(sql, "sara", submitted);
    const review = {
      id: submitted.id,
      revision: 1,
      decision: "approved" as const,
      reason: "Operational announcement reviewed",
      confirm: true as const,
    };
    await decideApproval(sql, "steve", review);
    const [approved] = (
      await organizationDrafts(sql, "sara", { sport: "baseball", teamId: "base" })
    ).items;
    assert.equal(approved.status, "approved");
    assert.equal(approved.revision, 2);
    assert.equal(approved.body, submitted.body);
    const [approval] = await sql`select status from coordinator_approvals where id=${submitted.id}`;
    assert.equal(approval.status, "approved");

    const suspended = { ...draft(), submit: true };
    await saveOrganizationDraft(sql, "sara", suspended);
    await sql`update coordinator_assignments set permissions=array_append(permissions,'content.submit') where user_id='sara'`;
    for (const status of ["suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      await assert.rejects(() => decideApproval(sql, "steve", { ...review, id: suspended.id }));
      assert.equal(
        (await sql`select status from coordinator_approvals where id=${suspended.id}`)[0].status,
        "pending",
      );
      assert.equal(
        (await sql`select status from coordinator_drafts where id=${suspended.id}`)[0].status,
        "submitted",
      );
    }
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    const changed = { ...draft(), submit: true };
    await saveOrganizationDraft(sql, "sara", changed);
    await sql`update coordinator_drafts set classified_revision=null where id=${changed.id}`;
    await assert.rejects(() => decideApproval(sql, "steve", { ...review, id: changed.id }));
    assert.equal(
      (await sql`select status from coordinator_approvals where id=${changed.id}`)[0].status,
      "pending",
    );
    await sql`update coordinator_drafts set classified_revision=1,revision=2 where id=${changed.id}`;
    await assert.rejects(
      () => decideApproval(sql, "steve", { ...review, id: changed.id }),
      /draft changed/,
    );
  } finally {
    await db.close();
  }
});
