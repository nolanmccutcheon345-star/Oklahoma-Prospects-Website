import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { emptyDevelopment } from "../pd/empty";
import { blankProfile, CONSENT_VERSION } from "../recruiting-contracts";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import {
  organizationContent,
  organizationContentReview,
  classifyOrganizationContent,
  saveOrganizationEditorialDraft,
  decideOrganizationEditorialDraft,
  saveOrganizationRecruitingProfile,
  saveOrganizationRecruitingMetric,
  reviewOrganizationRecruitingMetric,
  saveOrganizationDocumentMetadata,
} from "./organization-content.server";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"]): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? "$" + i : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (work) =>
    db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"])));
  return sql;
}
const metricId = "00000000-0000-4000-8000-000000000001";
async function fixture(mode = "legacy") {
  await db.exec("drop schema public cascade;create schema public");
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["other", "parent"],
    ["guardian", "parent"],
    ["fake", "admin"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
  }
  await sql`insert into owner_grants(user_id,email) values('owner','owner@example.invalid')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner'),('other','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const file = {
    ...emptyDevelopment(),
    documents: [
      {
        id: "doc",
        athleteId: "athlete",
        name: "PRIVATE-DOCUMENT",
        kind: "Waiver metadata",
        date: "2026-01-01",
        storageKey: "PRIVATE-STORAGE",
        signature: "DO NOT TOUCH",
      },
      {
        id: "doc2",
        athleteId: "other-athlete",
        name: "PRIVATE-DOCUMENT-TWO",
        kind: "Other",
        date: "",
      },
    ],
    secretFinancialData: { amount: 999 },
  };
  await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)}::jsonb,1)`;
  await sql`insert into club_athletes(id,name,birth_date,household_email) values('athlete','Synthetic Athlete','2012-01-01','guardian@example.invalid'),('other-athlete','Other Athlete','2011-01-01','guardian@example.invalid')`;
  await sql`insert into recruiting_profiles(athlete_id,payload) values('athlete',${JSON.stringify({ ...blankProfile, bio: "PRIVATE-PROFILE", privateFinancial: "HIDDEN" })}::jsonb)`;
  await sql`insert into recruiting_metrics(id,athlete_id,metric,value,measured_on,evidence,status,submitted_by,review_note) values(${metricId},'athlete','exitVelocity',70,'2026-01-01','https://example.invalid/private-evidence','pending','guardian','PRIVATE-REVIEW')`;
  if (mode !== "legacy") {
    const p = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      sourceClubRevision: p.sourceClubRevision,
      sourceDigest: p.sourceDigest,
      reason: "Synthetic operational content preservation",
    });
    if (mode === "basis") await applyFutureActiveSchemaForTest(sql);
  }
  return sql;
}
async function classifyAll(sql: Sql) {
  for (const source of await organizationContentReview(sql, "owner"))
    await classifyOrganizationContent(sql, "owner", {
      kind: source.kind,
      id: source.id,
      revision: source.revision,
      sourceDigest: source.sourceDigest,
      confirmed: true,
      reason: "Reviewed operational narrative and metadata",
    });
}
async function invariants(sql: Sql) {
  const tables = [
    '"user"',
    "profiles",
    "owner_grants",
    "organization_operational_access",
    "club_staff",
    "club_staff_services",
    "club_services",
    "club_state",
    "financial_basis_state",
    "financial_basis_versions",
    "household_members",
    "recruiting_roster_links",
  ];
  return {
    tables: await Promise.all(tables.map((t) => sql.query(`select * from ${t} order by 1`))),
    consent:
      await sql`select athlete_id,published,consent_by,consent_name,consent_at,consent_version from recruiting_profiles order by athlete_id`,
  };
}
test("unclassified historical narratives remain withheld; owner review is projected and bound to exact revisions/digests", async () => {
  const sql = await fixture();
  const id = randomUUID();
  await sql`insert into coordinator_drafts(id,user_id,sport,title,body) values(${id},'owner','baseball','PRIVATE-DRAFT','PRIVATE-DRAFT-BODY')`;
  const hidden = await organizationContent(sql, "sara");
  assert.equal(hidden.profiles[0].profile, null);
  assert.equal(hidden.metrics[0].detail, null);
  assert.deepEqual(hidden.withheld, { drafts: 1, profiles: 1, metrics: 1, documents: 2 });
  assert.ok(!JSON.stringify(hidden).includes("PRIVATE"));
  await assert.rejects(organizationContentReview(sql, "sara"));
  const review = await organizationContentReview(sql, "owner");
  assert.ok(!JSON.stringify(review).includes("PRIVATE-STORAGE"));
  assert.ok(!JSON.stringify(review).includes("privateFinancial"));
  const source = review.find((s) => s.kind === "recruiting-profile")!;
  await assert.rejects(
    classifyOrganizationContent(sql, "sara", {
      ...source,
      confirmed: true,
      reason: "Forged owner classification",
    }),
  );
  await assert.rejects(
    classifyOrganizationContent(sql, "owner", {
      kind: source.kind,
      id: source.id,
      revision: source.revision,
      sourceDigest: "a".repeat(64),
      confirmed: true,
      reason: "Wrong content digest",
    }),
    /changed/,
  );
  await classifyAll(sql);
  assert.equal(
    (await organizationContent(sql, "sara")).profiles[0].profile?.bio,
    "PRIVATE-PROFILE",
  );
  await sql`update recruiting_profiles set revision=revision+1 where athlete_id='athlete'`;
  await sql`update coordinator_drafts set revision=revision+1 where id=${id}`;
  const stale = await organizationContent(sql, "sara");
  assert.equal(stale.profiles[0].profile, null);
  assert.equal(stale.drafts.length, 0);
});
test("editorial drafts are organization-wide, independently reviewed, revision checked, and never implicitly published", async () => {
  const sql = await fixture();
  const id = randomUUID();
  const draft = {
    id,
    sport: "baseball" as const,
    teamId: "",
    revision: 0,
    title: "Operational announcement",
    body: "Practice schedule details",
    submit: false,
  };
  await saveOrganizationEditorialDraft(sql, "sara", draft);
  await saveOrganizationEditorialDraft(sql, "other", { ...draft, revision: 1, submit: true });
  const row = (await organizationContent(sql, "sara")).drafts[0];
  assert.equal(row.authorId, "sara");
  assert.equal(row.lastEditorId, "other");
  const decision = {
    id,
    revision: 2,
    approvalRevision: 1,
    decision: "approved" as const,
    reason: "Reviewed operational announcement",
  };
  await assert.rejects(decideOrganizationEditorialDraft(sql, "sara", decision));
  await assert.rejects(decideOrganizationEditorialDraft(sql, "other", decision));
  await assert.rejects(
    saveOrganizationEditorialDraft(sql, "owner", { ...draft, revision: 2 }),
    /authorized/,
  );
  await decideOrganizationEditorialDraft(sql, "owner", decision);
  assert.equal((await organizationContent(sql, "sara")).drafts[0].status, "approved");
  await assert.rejects(decideOrganizationEditorialDraft(sql, "owner", decision), /changed/);
  await saveOrganizationEditorialDraft(sql, "other", { ...draft, revision: 3, submit: true });
  await sql`update organization_operational_access set status='suspended' where user_id='other'`;
  await assert.rejects(
    decideOrganizationEditorialDraft(sql, "owner", {
      ...decision,
      revision: 4,
      approvalRevision: 3,
    }),
  );
  assert.ok(!JSON.stringify(await sql`select payload from club_state`).includes(draft.title));
});
for (const mode of ["legacy", "captured", "basis"])
  test(`recruiting/doc edits leave financial, auth and consent snapshots unchanged (${mode})`, async () => {
    const sql = await fixture(mode);
    await classifyAll(sql);
    const before = await invariants(sql);
    const [pdBefore] = await sql<{
      payload: Record<string, unknown>;
    }>`select payload::jsonb as payload from pd_working_file where id='club'`;
    await saveOrganizationRecruitingProfile(sql, "sara", {
      athleteId: "athlete",
      revision: 1,
      profile: { ...blankProfile, bio: "Operational biography" },
    });
    await saveOrganizationRecruitingMetric(sql, "sara", {
      id: metricId,
      athleteId: "athlete",
      revision: 1,
      metric: "exitVelocity",
      value: 75,
      measuredOn: "2026-01-02",
      evidence: "",
      request: true,
    });
    await reviewOrganizationRecruitingMetric(sql, "sara", {
      id: metricId,
      revision: 2,
      approve: true,
      method: "Measured in person",
      note: "Verified operational measurement",
    });
    const doc = (await organizationContent(sql, "sara")).documents.find((d) => d.id === "doc")!;
    await saveOrganizationDocumentMetadata(sql, "sara", { ...doc, name: "Updated metadata" });
    assert.deepEqual(await invariants(sql), before);
    const [after] = await sql<{
      payload: Record<string, unknown>;
    }>`select payload::jsonb as payload from pd_working_file where id='club'`;
    assert.deepEqual(
      { ...after.payload, documents: null },
      { ...pdBefore.payload, documents: null },
    );
    const docs = after.payload.documents as Record<string, string>[];
    assert.equal(docs[0].storageKey, "PRIVATE-STORAGE");
    assert.equal(docs[0].signature, "DO NOT TOUCH");
    assert.equal(docs[1].name, "PRIVATE-DOCUMENT-TWO");
    assert.equal(
      (
        await sql<{
          payload: Record<string, string>;
        }>`select payload from recruiting_profiles where athlete_id='athlete'`
      )[0].payload.privateFinancial,
      "HIDDEN",
    );
    await assert.rejects(
      saveOrganizationDocumentMetadata(sql, "sara", { ...doc, name: "Stale edit" }),
      /changed/,
    );
  });
test("current public consent allows only actually published valid profile fields; verified metric evidence still requires classification", async () => {
  const sql = await fixture();
  await sql`update recruiting_profiles set published=true,consent_by='guardian',consent_name='Guardian',consent_version=${CONSENT_VERSION},consent_at=now() where athlete_id='athlete'`;
  await sql`update recruiting_metrics set status='verified',method='Public verification method',review_note='PRIVATE-REVIEW' where id=${metricId}`;
  let content = await organizationContent(sql, "sara");
  assert.equal(
    content.profiles[0].profile,
    null,
    "unknown raw keys fail the actual public profile schema",
  );
  assert.equal(content.metrics[0].detail, null);
  assert.ok(!JSON.stringify(content).includes("private-evidence"));
  assert.ok(
    (await organizationContentReview(sql, "owner")).some((s) => s.kind === "recruiting-metric"),
  );
  await sql`update recruiting_profiles set payload=payload-'privateFinancial' where athlete_id='athlete'`;
  content = await organizationContent(sql, "sara");
  assert.equal(content.profiles[0].profile?.bio, "PRIVATE-PROFILE");
  const before = await invariants(sql);
  await saveOrganizationRecruitingProfile(sql, "sara", {
    athleteId: "athlete",
    revision: 1,
    profile: { ...blankProfile, bio: "Reviewed bio" },
  });
  assert.deepEqual(await invariants(sql), before);
  await assert.rejects(
    saveOrganizationRecruitingProfile(sql, "sara", {
      athleteId: "athlete",
      revision: 2,
      profile: blankProfile,
      publish: true,
    } as never),
  );
  await saveOrganizationRecruitingProfile(sql, "sara", {
    athleteId: "other-athlete",
    revision: 0,
    profile: blankProfile,
  });
  assert.equal(
    (
      await sql<{
        published: boolean;
      }>`select published from recruiting_profiles where athlete_id='other-athlete'`
    )[0].published,
    false,
  );
});
test("metadata rejects forged storage/athlete IDs, duplicate row IDs, stale classification and rolls back failed writes", async () => {
  const sql = await fixture();
  await classifyAll(sql);
  const doc = (await organizationContent(sql, "sara")).documents[0];
  await assert.rejects(
    saveOrganizationDocumentMetadata(sql, "sara", { ...doc, storageKey: "forged" } as never),
  );
  await assert.rejects(
    saveOrganizationDocumentMetadata(sql, "sara", { ...doc, athleteId: "other-athlete" }),
    /changed/,
  );
  const [before] = await sql<{
    payload: unknown;
    revision: number;
  }>`select payload,revision from pd_working_file where id='club'`;
  await db.exec(
    `create function deny_content_write() returns trigger language plpgsql as $$begin raise exception 'synthetic rollback';end$$;create trigger deny_content before update on operational_content_classifications for each row execute function deny_content_write();`,
  );
  await assert.rejects(
    saveOrganizationDocumentMetadata(sql, "sara", { ...doc, name: "Rejected atomic patch" }),
    /rollback/,
  );
  assert.deepEqual(
    (await sql`select payload,revision from pd_working_file where id='club'`)[0],
    before,
  );
  await db.exec("drop trigger deny_content on operational_content_classifications");
  await sql`update pd_working_file set payload=jsonb_set(payload::jsonb,'{documents}',(payload::jsonb->'documents')||jsonb_build_array(payload::jsonb->'documents'->0)),revision=revision+1 where id='club'`;
  await assert.rejects(
    saveOrganizationDocumentMetadata(sql, "sara", { ...doc, sourceRevision: 2 }),
  );
});
test("fake, removed, disabled and unverified actors cannot read or mutate operational content", async () => {
  const sql = await fixture();
  for (const actor of ["fake", "guardian"]) await assert.rejects(organizationContent(sql, actor));
  await sql`update "user" set "emailVerified"=false where id='sara'`;
  await assert.rejects(organizationContent(sql, "sara"));
  await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='sara'`;
  await assert.rejects(organizationContent(sql, "sara"));
  await sql`update "user" set "disabledAt"=null where id='sara'`;
  await sql`update organization_operational_access set status='removed' where user_id='sara'`;
  await assert.rejects(organizationContent(sql, "sara"));
});

test("unknown historical metric keys never enter operational DTOs even after classification", async () => {
  const sql = await fixture();
  const unknownId = randomUUID();
  await sql`insert into recruiting_metrics(id,athlete_id,metric,value,measured_on,evidence,status,submitted_by,review_note) values(${unknownId},'athlete','PRIVATE-SALARY-KEY',987654,'2026-01-01','https://example.invalid/private-unknown','verified','guardian','PRIVATE-UNKNOWN-NOTE')`;
  let content = await organizationContent(sql, "sara");
  assert.equal(content.metrics.length, 1);
  assert.equal(content.metrics[0].metric, "exitVelocity");
  assert.equal(content.metrics[0].value, 70);
  assert.equal(content.withheld.metrics, 2);
  assert.ok(!JSON.stringify(content).includes("PRIVATE-SALARY-KEY"));
  assert.ok(!JSON.stringify(content).includes("987654"));
  const source = (await organizationContentReview(sql, "owner")).find((s) => s.id === unknownId)!;
  assert.equal(source.content.metric, "PRIVATE-SALARY-KEY");
  await classifyOrganizationContent(sql, "owner", {
    kind: source.kind,
    id: source.id,
    revision: source.revision,
    sourceDigest: source.sourceDigest,
    confirmed: true,
    reason: "Synthetic owner review of unsupported measurement",
  });
  content = await organizationContent(sql, "sara");
  assert.equal(content.metrics.length, 1);
  assert.equal(content.withheld.metrics, 2);
  assert.ok(!JSON.stringify(content).includes("PRIVATE-UNKNOWN-NOTE"));
});
