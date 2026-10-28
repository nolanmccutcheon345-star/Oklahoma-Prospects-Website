import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { emptyDevelopment } from "../pd/empty";
import { serviceInput } from "../ops-contracts";
import { saveServiceFor } from "../ops-owner.server";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
import { requireCoachService } from "../commerce/coach-services.server";
import {
  organizationServices,
  ownerServiceDrafts,
  createOrganizationServiceDraft,
  saveOrganizationService,
  setOrganizationServiceStatus,
  availableOperationalServices,
  assertOperationalServiceForNewPurchase,
} from "./organization-services.server";
import type { OrganizationService } from "./organization-services-contracts";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"], nested = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (work) => {
    assert.equal(nested, false);
    return db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"], true)));
  };
  return sql;
}
async function fixture(mode = "legacy") {
  await db.exec("drop schema public cascade; create schema public");
  for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["other", "admin"],
    ["parent", "parent"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const file = emptyDevelopment();
  file.coaches = [
    {
      id: "coach",
      name: "Coach",
      email: "coach@example.invalid",
      active: true,
      specialties: ["Pitching"],
    },
  ];
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify(file)})`;
  await sql`insert into club_staff(id,name,email,role,active) values('staff','Coach','coach@example.invalid','coach',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','s2',63)`;
  await sql`insert into club_services(id,kind,name,price,active,detail) values('private','lesson','PRIVATE-SERVICE',99999,false,'PRIVATE-DETAIL')`;
  if (mode !== "legacy") {
    const p = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      sourceClubRevision: p.sourceClubRevision,
      sourceDigest: p.sourceDigest,
      reason: "Synthetic service preservation fixture",
    });
    if (mode === "basis") await applyFutureActiveSchemaForTest(sql);
  }
  return { sql, file };
}
const target = (s: OrganizationService) => ({
  id: s.id,
  revision: s.revision,
  sourceRevision: s.sourceRevision,
});
const draft = {
  kind: "lesson" as const,
  name: "New operational lesson",
  discipline: "Pitching",
  purpose: "Public purpose",
  detail: "Public description",
  featured: false,
  sortOrder: 10,
};
const metadata = (s: OrganizationService) => ({
  ...target(s),
  name: s.name,
  purpose: s.purpose,
  detail: s.detail,
  featured: s.featured,
  sortOrder: s.sortOrder,
});
function terms(id: string, revision: number, basisVersion?: number) {
  return serviceInput.parse({
    id,
    operationalDraftRevision: revision,
    operationalDraftConfirmed: true,
    basisVersion,
    kind: "lesson",
    name: draft.name,
    discipline: "Pitching",
    price: 75,
    minutes: 45,
    purpose: draft.purpose,
    entry: false,
    group_session: false,
    requires_assessment: false,
    credits: 0,
    remote: 0,
    expires_days: 0,
    hours: 0,
    featured: false,
    detail: draft.detail,
    includes: [],
    unit: "",
    lanes: "",
    period: "",
    hourly: "",
    bestFor: "",
    savings: "",
    perks: [],
    active: true,
    sort_order: 10,
  });
}
async function protectedRows(sql: Sql) {
  const out: Record<string, unknown> = {};
  for (const table of [
    "club_services",
    "club_staff_services",
    "financial_basis_state",
    "financial_basis_versions",
    "financial_lesson_bindings",
    "finance_records",
    "contractor_earnings",
    "commerce_orders",
    "credit_grants",
    "booking_records",
  ])
    out[table] = await sql.query(
      `select to_jsonb(t) as value from ${table} t order by to_jsonb(t)::text`,
    );
  return out;
}
for (const mode of ["legacy", "captured", "basis"])
  test(`unpriced create/copy and operational archive preserve every commercial source (${mode})`, async () => {
    const { sql, file } = await fixture(mode);
    const before = await protectedRows(sql);
    const list = await organizationServices(sql, "owner");
    assert.doesNotMatch(JSON.stringify(list), /PRIVATE|price|profit|credits|expires/);
    const created = await createOrganizationServiceDraft(sql, "owner", draft);
    const copied = await createOrganizationServiceDraft(sql, "owner", { ...draft, name: "Copy" });
    assert.notEqual(created.id, copied.id);
    assert.equal((await sql`select id from club_services where id=${created.id}`).length, 0);
    assert.equal((await ownerServiceDrafts(sql, "owner")).length, 2);
    await assert.rejects(createOrganizationServiceDraft(sql, "owner", { ...draft, price: 0 }));
    const service = list.find((s) => s.id === "s2")!;
    await setOrganizationServiceStatus(sql, "owner", {
      ...target(service),
      status: "archived",
      reason: "Instructor is away",
    });
    assert.deepEqual(await protectedRows(sql), before);
    assert.equal(
      (await availableOperationalServices(sql, [{ id: "s2" }, { id: "s3" }])).some(
        (s) => s.id === "s2",
      ),
      false,
    );
    await assert.rejects(assertOperationalServiceForNewPurchase(sql, "s2"), /unavailable/);
    assert.equal(
      (await requireCoachService(sql, file.coaches, "coach", "s2", { operational: false })).id,
      "coach",
      "prepared/purchased fulfillment retains original offering",
    );
    await assert.rejects(
      setOrganizationServiceStatus(sql, "owner", {
        ...target(service),
        status: "active",
        reason: "Stale revision",
      }),
      /changed/,
    );
    const archived = (await organizationServices(sql, "owner")).find((s) => s.id === "s2")!;
    await setOrganizationServiceStatus(sql, "owner", {
      ...target(archived),
      status: "active",
      reason: "Instructor returned",
    });
    await assertOperationalServiceForNewPurchase(sql, "s2");
    assert.deepEqual(await protectedRows(sql), before);
    const d = (await organizationServices(sql, "owner")).find((s) => s.id === created.id)!;
    await setOrganizationServiceStatus(sql, "owner", {
      ...target(d),
      status: "archived",
      reason: "Pause new draft",
    });
    const a = (await organizationServices(sql, "owner")).find((s) => s.id === created.id)!;
    await setOrganizationServiceStatus(sql, "owner", {
      ...target(a),
      status: "active",
      reason: "Restore review draft",
    });
    assert.equal(
      (await ownerServiceDrafts(sql, "owner")).find((s) => s.id === created.id)?.status,
      "draft",
    );
  });
test("public metadata is field-scoped, source-CAS protected, and never becomes approved future financial terms", async () => {
  const { sql } = await fixture("basis");
  const before = await protectedRows(sql);
  const s = (await organizationServices(sql, "owner")).find((s) => s.id === "s2")!;
  await assert.rejects(
    saveOrganizationService(sql, "owner", {
      ...metadata(s),
      name: "New financial assessment name",
    }),
    /owner review/,
  );
  await saveOrganizationService(sql, "owner", {
    ...metadata(s),
    detail: "Current public delivery description",
  });
  const after = await protectedRows(sql);
  for (const name of Object.keys(before).filter((n) => n !== "club_services"))
    assert.deepEqual(after[name], before[name]);
  const [saved] = await sql<{
    detail: string;
    price: string;
    minutes: number;
  }>`select detail,price,minutes from club_services where id='s2'`;
  assert.equal(saved.detail, "Current public delivery description");
  await assert.rejects(
    saveOrganizationService(sql, "owner", { ...metadata(s), detail: "Stale draft" }),
    /changed/,
  );
  const current = (await organizationServices(sql, "owner")).find((s) => s.id === "s2")!;
  await sql`update club_services set price=price+1 where id='s2'`;
  await assert.rejects(
    setOrganizationServiceStatus(sql, "owner", {
      ...target(current),
      status: "archived",
      reason: "Stale source input",
    }),
    /changed/,
  );
});
test("only a current genuine owner can adopt the reviewed draft atomically with positive financial terms and basis CAS", async () => {
  const { sql } = await fixture("basis");
  const created = await createOrganizationServiceDraft(sql, "owner", draft);
  const raw = terms(created.id, 1, 1);
  await assert.rejects(saveServiceFor(sql, "sara", raw));
  await assert.rejects(saveServiceFor(sql, "other", raw));
  await assert.rejects(
    saveServiceFor(sql, "owner", { ...raw, operationalDraftConfirmed: undefined }),
    /confirm/,
  );
  await assert.rejects(
    saveServiceFor(sql, "owner", { ...raw, operationalDraftRevision: 2 }),
    /current service draft/,
  );
  await assert.rejects(saveServiceFor(sql, "owner", { ...raw, price: 0 }), /greater than zero/);
  await assert.rejects(
    saveServiceFor(sql, "owner", { ...raw, basisVersion: 999 }),
    /changed|version|stale/i,
  );
  assert.equal((await sql`select id from club_services where id=${created.id}`).length, 0);
  await db.exec(
    "create function reject_service_audit() returns trigger language plpgsql as $$ begin if new.action='organization.services.owner-adopt' then raise exception 'audit failed'; end if; return new; end $$; create trigger reject_service_audit before insert on coordinator_audit for each row execute function reject_service_audit()",
  );
  await assert.rejects(saveServiceFor(sql, "owner", raw), /audit failed/);
  assert.equal((await sql`select id from club_services where id=${created.id}`).length, 0);
  assert.equal((await ownerServiceDrafts(sql, "owner"))[0].revision, 1);
  await sql.query("drop trigger reject_service_audit on coordinator_audit");
  await saveServiceFor(sql, "owner", raw);
  const [saved] = await sql<{
    price: string;
    minutes: number;
    active: boolean;
  }>`select price,minutes,active from club_services where id=${created.id}`;
  assert.equal(Number(saved.price), 75);
  assert.equal(saved.minutes, 45);
  assert.equal(saved.active, true);
  assert.equal((await ownerServiceDrafts(sql, "owner")).length, 0);
  await assertOperationalServiceForNewPurchase(sql, created.id);
  assert.equal(
    (await sql<{ current_version: number }>`select current_version from financial_basis_state`)[0]
      .current_version,
    2,
  );
  await assert.rejects(
    saveServiceFor(sql, "owner", { ...raw, basisVersion: 2 }),
    /already been approved/,
  );
  await sql`delete from club_services where id=${created.id}`;
  assert.equal((await ownerServiceDrafts(sql, "owner")).length, 0);
  await assert.rejects(
    saveServiceFor(sql, "owner", { ...raw, operationalDraftRevision: 2, basisVersion: 2 }),
    /former commercial identity/,
  );
});
test("current security revocation and operational audit failure deny or roll back all service writes", async () => {
  const { sql } = await fixture();
  const s = (await organizationServices(sql, "owner")).find((s) => s.id === "s2")!;
  await assert.rejects(createOrganizationServiceDraft(sql, "parent", draft));
  await assert.rejects(ownerServiceDrafts(sql, "sara"));
  await db.exec(
    "create function reject_service_audit() returns trigger language plpgsql as $$ begin raise exception 'audit failed'; end $$; create trigger reject_service_audit before insert on coordinator_audit for each row execute function reject_service_audit()",
  );
  await assert.rejects(
    setOrganizationServiceStatus(sql, "owner", {
      ...target(s),
      status: "archived",
      reason: "Test failure rollback",
    }),
    /audit failed/,
  );
  assert.equal((await sql`select id from operational_service_catalog`).length, 0);
  await sql.query("drop trigger reject_service_audit on coordinator_audit");
  await sql`update organization_operational_access set status='removed' where user_id='sara'`;
  await assert.rejects(createOrganizationServiceDraft(sql, "sara", draft));
  await assert.rejects(organizationServices(sql, "sara"));
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(ownerServiceDrafts(sql, "owner"));
});
test("a verified prepared Square package still fulfills original paid credits after operational archive", async () => {
  const { sql } = await fixture();
  await sql`insert into club_athletes(id,user_id,household_email,name) values('athlete','parent','parent@example.invalid','Synthetic Athlete')`;
  const q = {
    productId: "p1",
    kind: "package",
    title: "Original package",
    totalCents: 22000,
    regularCents: 22000,
    setupCents: 0,
    recurring: false,
    assessment: false,
    duration: 0,
    sessionMinutes: 30,
    credits: 4,
    remote: 0,
    expiresDays: 120,
    discipline: "Pitching",
    resources: [],
    lines: [{ label: "Package", cents: 22000 }],
    teamRate: false,
    needsSlot: false,
  };
  await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id) values('prepared','prepared','parent','parent@example.invalid','athlete','p1','package',${JSON.stringify(q)}::jsonb,22000,now()+interval '10 minutes','square','sandbox','customer')`;
  const s = (await organizationServices(sql, "owner")).find((s) => s.id === "p1")!;
  await setOrganizationServiceStatus(sql, "owner", {
    ...target(s),
    status: "archived",
    reason: "No new package sales",
  });
  await assert.rejects(assertOperationalServiceForNewPurchase(sql, "p1"), /unavailable/);
  const payment = {
    id: "verified-fixture",
    referenceId: "prepared",
    locationId: "location",
    customerId: "customer",
    status: "COMPLETED" as const,
    amountMoney: { amount: 22000n, currency: "USD" as const },
    totalMoney: { amount: 22000n, currency: "USD" as const },
    sourceType: "CARD",
    createdAt: new Date().toISOString(),
  };
  await sql.transaction((tx) =>
    fulfillSquarePayment(tx, payment, { environment: "sandbox", locationId: "location" }),
  );
  assert.equal(
    (
      await sql<{ quantity: number }>`select quantity from credit_grants where order_id='prepared'`
    )[0].quantity,
    4,
  );
  assert.equal(
    (await sql<{ snapshot: typeof q }>`select snapshot from commerce_orders where id='prepared'`)[0]
      .snapshot.credits,
    4,
  );
});
for (const mode of ["legacy", "captured"])
  test(`owner adoption works without an active basis version (${mode})`, async () => {
    const { sql } = await fixture(mode);
    const d = await createOrganizationServiceDraft(sql, "owner", draft);
    await saveServiceFor(sql, "owner", terms(d.id, 1));
    assert.equal((await sql`select id from club_services where id=${d.id}`).length, 1);
  });
