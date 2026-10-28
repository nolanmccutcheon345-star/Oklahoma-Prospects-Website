import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { defaultCoachSplit } from "../ops";
import { campPurchase, type TrainingEvent } from "../training-events-contracts";
import { validateEventPayment } from "../training-events.server";
import type { SquareOrder } from "../commerce/square-payments.server";
import {
  organizationCatalog,
  saveOrganizationServiceMetadata,
  saveOrganizationTrainingEventMetadata,
} from "./organization-catalog.server";
import {
  organizationServiceMetadataInput,
  organizationTrainingEventMetadataInput,
  type OrganizationCatalogService,
  type OrganizationCatalogEvent,
} from "./organization-catalog-contracts";

const SECRET = "PRIVATE-CATALOG-FINANCIAL-CANARY";
const AMOUNT = 918273;
type Json = Record<string, unknown>;
type Trace = { statement: string; rows: unknown; transaction: boolean };
async function fixture() {
  const db = new PGlite();
  for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  let capture = false;
  const trace: Trace[] = [];
  const wrap = (query: PGlite["query"], transaction = false): Sql => {
    const execute = async (statement: string, values: unknown[] = []) => {
      const { rows } = await query(statement, values);
      if (capture) trace.push({ statement, rows, transaction });
      return rows;
    };
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      execute(
        parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
        values,
      )) as Sql;
    sql.query = execute as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"], true)));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const id of ["steve", "sara", "parent", "coach", "fake-owner"])
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
  for (const id of ["steve", "sara", "parent", "coach", "fake-owner"])
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" || id === "fake-owner" ? "admin" : id === "coach" ? "coach" : "parent"})`;
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  // Synthetic unknown columns/keys prove the DTO does not materialize or rewrite future finance fields.
  await sql`alter table club_services add column private_financial_future jsonb`;
  await sql`update club_services set private_financial_future=${JSON.stringify({ memo: SECRET, amount: AMOUNT })}::jsonb`;
  await sql`insert into club_services(id,kind,name,price,purpose,detail,active,private_financial_future) values('withheld-service','lesson',${SECRET},${AMOUNT},${SECRET},${SECRET},false,${JSON.stringify({ memo: SECRET })}::jsonb)`;
  await sql`insert into club_staff(id,name,email,role) values('instructor','Synthetic Instructor','coach@example.invalid','coach')`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('instructor','s2',73)`;
  await sql`insert into club_households(id,primary_email) values('family','parent@example.invalid')`;
  for (const id of ["base-player", "soft-player", "pending-player"])
    await sql`insert into club_athletes(id,name,household_email,household_id,profile) values(${id},${"Synthetic " + id},'parent@example.invalid','family',${JSON.stringify({ privateFinancialFuture: SECRET })}::jsonb)`;
  const events: TrainingEvent[] = [];
  for (const [sport, status] of [
    ["Baseball", "published"],
    ["Softball", "closed"],
    ["Both", "draft"],
    ["Baseball", "cancelled"],
  ] as const) {
    const hidden = status === "draft" || status === "cancelled";
    const event: TrainingEvent = {
      id: randomUUID(),
      revision: 1,
      name: hidden ? SECRET : `Synthetic ${sport} camp`,
      type: "camp",
      sport,
      description: hidden ? SECRET : `Published ${sport} event description.`,
      priceCents: AMOUNT,
      dayPriceCents: 12345,
      pricingMode: "both",
      location: "Synthetic facility",
      capacity: 30,
      sessions: [{ date: "2030-06-01", start: "09:00", end: "12:00" }],
      coachIds: ["instructor"],
      status,
      policy: SECRET,
    };
    const payload = {
      ...event,
      privateFinancialFuture: { memo: SECRET, amount: AMOUNT },
      sessions: event.sessions.map((session) => ({ ...session, privateFinancialFuture: SECRET })),
    };
    await sql`insert into training_events(id,payload,updated_by) values(${event.id},${JSON.stringify(payload)}::jsonb,'steve')`;
    events.push(event);
  }
  const expired: TrainingEvent = {
    ...events[0],
    id: randomUUID(),
    name: SECRET,
    description: SECRET,
    sessions: [{ date: "2020-01-01", start: "09:00", end: "12:00" }],
  };
  await sql`insert into training_events(id,payload,updated_by) values(${expired.id},${JSON.stringify(expired)}::jsonb,'steve')`;
  events.push(expired);
  const invalid: TrainingEvent = {
    ...events[0],
    id: randomUUID(),
    name: SECRET,
    description: SECRET,
    sessions: [{ date: "2030-02-31", start: "09:00", end: "12:00" }],
  };
  await sql`insert into training_events(id,payload,updated_by) values(${invalid.id},${JSON.stringify(invalid)}::jsonb,'steve')`;
  events.push(invalid);
  for (const [index, athlete] of ["base-player", "soft-player"].entries()) {
    const event = events[index],
      id = `order-${athlete}`;
    await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id) values(${id},${id},'parent',${SECRET + "@example.invalid"},${athlete},${event.id},'event',${JSON.stringify({ privateFinancialFuture: SECRET, eventRegistration: { ...event, privateFinancialFuture: SECRET } })}::jsonb,${AMOUNT},'paid','square',${SECRET + id},'family')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${SECRET + id},${id},'sandbox',${AMOUNT},'COMPLETED')`;
    await sql`insert into training_event_registrations(id,event_id,athlete_id,user_id,order_id,status) values(${"registration-" + athlete},${event.id},${athlete},'parent',${id},'confirmed')`;
    await sql`insert into booking_records(id,order_id,user_id,athlete_id,product_id,starts_at,ends_at,resources,status) values(${"booking-" + athlete},${id},'parent',${athlete},${event.id},'2030-06-01T14:00:00Z','2030-06-01T17:00:00Z','[]'::jsonb,'confirmed')`;
  }
  await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status,hold_until,payment_provider,household_id) values('pending-order','pending-order','parent','parent@example.invalid','pending-player',${events[0].id},'event',${JSON.stringify({ eventRegistration: { id: events[0].id, revision: 1, sessions: events[0].sessions, option: "package", dates: ["2030-06-01"], location: events[0].location, policy: SECRET }, privateFinancialFuture: SECRET })}::jsonb,${AMOUNT},'pending',now()+interval '1 hour','square','family')`;
  await sql`insert into finance_records(id,kind,payload) values('catalog-finance','expense',${JSON.stringify({ memo: SECRET, amount: AMOUNT })}::jsonb)`;
  return {
    db,
    sql,
    events,
    trace,
    capture: (enabled: boolean) => {
      capture = enabled;
      if (enabled) trace.length = 0;
    },
  };
}
function serviceInput(service: OrganizationCatalogService) {
  return {
    id: service.id,
    revision: service.revision,
    name: service.name,
    purpose: service.purpose,
    detail: service.detail,
    featured: service.featured,
    sortOrder: service.sortOrder,
  };
}
function eventInput(event: OrganizationCatalogEvent) {
  return {
    id: event.id,
    revision: event.revision,
    editToken: event.editToken,
    name: event.name,
    description: event.description,
  };
}
async function financialSnapshot(sql: Sql) {
  const result: Record<string, unknown> = {};
  const tables = await sql<{
    tablename: string;
  }>`select tablename from pg_tables where schemaname='public' order by tablename`;
  for (const { tablename } of tables.filter(({ tablename }) =>
    /^(commerce_|finance_|financial_|team_fee_|team_budget_|billing_|club_subscription|customer_payment_|fundraising_|square_|credit_|booking_|club_staff_services|service_resources|training_event_registrations)/.test(
      tablename,
    ),
  )) {
    assert.match(tablename, /^[a-z_]+$/);
    result[tablename] = await sql.query(
      `select to_jsonb(t)::text as row from "${tablename}" t order by to_jsonb(t)::text`,
    );
  }
  result.serviceProtected =
    await sql`select (to_jsonb(s)-'name'-'purpose'-'detail'-'featured'-'sort_order'-'lesson_version'-'updated_at')::text as row from club_services s order by id`;
  result.eventProtected =
    await sql`select id,revision,(payload-'name'-'description')::text as payload from training_events order by id`;
  return result;
}
function assertPrivate(value: unknown) {
  assert.doesNotMatch(
    JSON.stringify(value),
    new RegExp(
      `${SECRET}|${AMOUNT}|"(?:price|priceCents|dayPriceCents|profit_split|credits|order_id|total_cents|policy|snapshot|privateFinancialFuture|private_financial_future)"`,
    ),
  );
}

test("published catalog metadata has owner parity without hydrating or changing finance", async (t) => {
  const f = await fixture();
  const { db, sql, events } = f;
  try {
    await t.test(
      "both sports, exact public projections, roster sessions and same-transaction authority",
      async () => {
        f.capture(true);
        const workspace = await organizationCatalog(sql, "steve");
        f.capture(false);
        assertPrivate(workspace);
        assertPrivate(f.trace.map((row) => row.rows));
        assert.equal(workspace.events.length, 2);
        assert.deepEqual(workspace.events.map((e) => e.sport).sort(), ["Baseball", "Softball"]);
        assert.equal(workspace.registrations.length, 2);
        assert.ok(
          workspace.registrations.every(
            (r) =>
              r.sessions[0].date === "2030-06-01" &&
              r.sessions[0].start === "09:00" &&
              r.sessions[0].end === "12:00",
          ),
        );
        assert.deepEqual(
          Object.keys(workspace.services[0]).sort(),
          [
            "id",
            "kind",
            "name",
            "discipline",
            "purpose",
            "detail",
            "featured",
            "sortOrder",
            "revision",
            "nameEditable",
          ].sort(),
        );
        assert.deepEqual(
          Object.keys(workspace.events[0]).sort(),
          [
            "id",
            "revision",
            "editToken",
            "name",
            "description",
            "type",
            "sport",
            "status",
            "location",
            "sessions",
          ].sort(),
        );
        assert.deepEqual(
          Object.keys(workspace.registrations[0]).sort(),
          ["id", "eventId", "athleteId", "player", "status", "sessions"].sort(),
        );
        assert.ok(workspace.services.every((s) => s.id !== "withheld-service"));
        assert.deepEqual(await organizationCatalog(sql, "steve"), workspace);
        const grant = f.trace.find((r) => /from owner_grants g join profiles/.test(r.statement));
        assert.ok(grant?.transaction);
        assert.match(grant.statement, /revoked_at is null.*for share/s);
        assert.ok(f.trace.every((r) => r.transaction));
        assert.ok(
          f.trace.findIndex((r) => /from owner_grants g join profiles/.test(r.statement)) <
            f.trace.findIndex((r) => /from club_services/.test(r.statement)),
        );
      },
    );
    await t.test(
      "public-copy saves preserve financial bytes and pending event payment validation",
      async () => {
        const before = await financialSnapshot(sql);
        const workspace = await organizationCatalog(sql, "steve");
        const [pending] =
          await sql<SquareOrder>`select * from commerce_orders where id='pending-order'`;
        await sql.transaction((tx) =>
          validateEventPayment(tx, pending, { billingHouseholdIds: ["family"] }),
        );
        for (const id of ["s2", "m1", "individual", "prospect"]) {
          const service = workspace.services.find((s) => s.id === id)!;
          f.capture(true);
          await saveOrganizationServiceMetadata(sql, "steve", {
            ...serviceInput(service),
            purpose: `Updated public ${id} summary.`,
            detail: `Updated public ${id} description.`,
            featured: !service.featured,
            sortOrder: service.sortOrder + 1,
          });
          f.capture(false);
          assertPrivate(f.trace.map((r) => r.rows));
          assert.ok(f.trace.every((r) => r.transaction));
        }
        for (const event of workspace.events) {
          f.capture(true);
          const saved = await saveOrganizationTrainingEventMetadata(sql, "steve", {
            ...eventInput(event),
            name: `Updated ${event.sport} camp`,
            description: `Updated ${event.sport} public event description.`,
          });
          f.capture(false);
          assert.equal(
            saved.revision,
            event.revision,
            "commerce revision must not change for marketing copy",
          );
          assert.notEqual(saved.editToken, event.editToken);
          assertPrivate(f.trace.map((r) => r.rows));
          assert.ok(f.trace.every((r) => r.transaction));
        }
        await sql.transaction((tx) =>
          validateEventPayment(tx, pending, { billingHouseholdIds: ["family"] }),
        );
        assert.deepEqual(await financialSnapshot(sql), before);
        const [event] = await sql<{
          payload: TrainingEvent;
        }>`select payload from training_events where id=${events[0].id}`;
        assert.equal(campPurchase(event.payload).totalCents, AMOUNT);
        assert.equal(
          campPurchase(event.payload, { option: "days", dates: ["2030-06-01"] }).totalCents,
          12345,
        );
      },
    );
    await t.test(
      "lesson and cage-plan renames cannot change compensation or existing link resolution",
      async () => {
        const before = await financialSnapshot(sql);
        const workspace = await organizationCatalog(sql, "steve");
        const rows = await sql<{
          id: string;
          kind: string;
          name: string;
          group_session: boolean;
          entry: boolean;
        }>`select id,kind,name,group_session,entry from club_services order by id`;
        const splits = rows.map((row) => [row.id, defaultCoachSplit(row)]);
        for (const service of workspace.services.filter(
          (s) => s.kind === "lesson" || s.kind === "cage_plan",
        )) {
          assert.equal(service.nameEditable, false);
          for (const name of [
            "Remote specialist",
            "Group session",
            "Assessment lab",
            "Private coaching",
            "New name",
          ])
            await assert.rejects(
              () =>
                saveOrganizationServiceMetadata(sql, "steve", { ...serviceInput(service), name }),
              /owner review/,
            );
        }
        const after = await sql<{
          id: string;
          kind: string;
          name: string;
          group_session: boolean;
          entry: boolean;
        }>`select id,kind,name,group_session,entry from club_services order by id`;
        assert.deepEqual(
          after.map((row) => [row.id, defaultCoachSplit(row)]),
          splits,
        );
        assert.deepEqual(await financialSnapshot(sql), before);
      },
    );
    await t.test(
      "permitted names update only customer-facing metadata and stale writes are rejected",
      async () => {
        const before = await financialSnapshot(sql);
        let workspace = await organizationCatalog(sql, "steve");
        const service = workspace.services.find((s) => s.id === "m1")!;
        assert.equal(service.nameEditable, true);
        const input = { ...serviceInput(service), name: "Development program" };
        await saveOrganizationServiceMetadata(sql, "steve", input);
        await assert.rejects(() => saveOrganizationServiceMetadata(sql, "steve", input), /changed/);
        const event = workspace.events[0];
        const change = {
          ...eventInput(event),
          description: "New public description with safe concurrency.",
        };
        await saveOrganizationTrainingEventMetadata(sql, "steve", change);
        await assert.rejects(
          () => saveOrganizationTrainingEventMetadata(sql, "steve", change),
          /changed/,
        );
        workspace = await organizationCatalog(sql, "steve");
        const ownerEvent = workspace.events[0];
        await sql`update training_events set revision=revision+1,payload=jsonb_set(payload,'{revision}',to_jsonb(revision+1)) where id=${ownerEvent.id}`;
        await assert.rejects(
          () => saveOrganizationTrainingEventMetadata(sql, "steve", eventInput(ownerEvent)),
          /changed/,
        );
        // Undo only the synthetic owner revision so the operational byte-comparison stays meaningful.
        await sql`update training_events set revision=revision-1,payload=jsonb_set(payload,'{revision}',to_jsonb(revision-1)) where id=${ownerEvent.id}`;
        assert.deepEqual(await financialSnapshot(sql), before);
      },
    );
    await t.test(
      "strict mutation schemas reject financial, state, schedule, privilege and unknown inputs",
      async () => {
        const before = await financialSnapshot(sql);
        const workspace = await organizationCatalog(sql, "steve");
        const service = serviceInput(workspace.services[0]);
        const event = eventInput(workspace.events[0]);
        for (const key of [
          "price",
          "priceCents",
          "pricingMode",
          "dayPriceCents",
          "profit_split",
          "credits",
          "minutes",
          "hours",
          "remote",
          "expires_days",
          "active",
          "kind",
          "discipline",
          "includes",
          "extra_json",
          "entry",
          "group_session",
          "requires_assessment",
          "futureFinancialField",
          "role",
          "userId",
        ]) {
          const invalid = { ...service, [key]: SECRET };
          assert.equal(organizationServiceMetadataInput.safeParse(invalid).success, false);
          await assert.rejects(() => saveOrganizationServiceMetadata(sql, "steve", invalid));
        }
        for (const key of [
          "priceCents",
          "pricingMode",
          "dayPriceCents",
          "policy",
          "sessions",
          "coachIds",
          "capacity",
          "status",
          "sport",
          "type",
          "minAge",
          "maxAge",
          "location",
          "registrations",
          "order_id",
          "futureFinancialField",
          "role",
          "userId",
        ]) {
          const invalid = { ...event, [key]: SECRET };
          assert.equal(organizationTrainingEventMetadataInput.safeParse(invalid).success, false);
          await assert.rejects(() => saveOrganizationTrainingEventMetadata(sql, "steve", invalid));
        }
        await assert.rejects(() =>
          saveOrganizationServiceMetadata(sql, "steve", { ...service, id: "withheld-service" }),
        );
        for (const hidden of events.slice(2))
          await assert.rejects(() =>
            saveOrganizationTrainingEventMetadata(sql, "steve", { ...event, id: hidden.id }),
          );
        await assert.rejects(() =>
          saveOrganizationTrainingEventMetadata(sql, "steve", { ...event, id: randomUUID() }),
        );
        assert.deepEqual(await financialSnapshot(sql), before);
      },
    );
    await t.test(
      "nested historical JSON cannot serialize into otherwise allowed scalar fields",
      async () => {
        const [original] = await sql<{
          payload: Json;
        }>`select payload from training_events where id=${events[0].id}`;
        await sql`update training_events set payload=payload || ${JSON.stringify({
          name: { memo: SECRET },
          description: { price: AMOUNT },
          location: { memo: SECRET },
          sessions: [
            { date: { memo: SECRET }, start: "09:00", end: "12:00" },
            { date: "2030-06-01", start: "09:00", end: "12:00", future: SECRET },
          ],
        })}::jsonb where id=${events[0].id}`;
        f.capture(true);
        const workspace = await organizationCatalog(sql, "steve");
        f.capture(false);
        assertPrivate(workspace);
        assertPrivate(f.trace.map((r) => r.rows));
        const event = workspace.events.find((e) => e.id === events[0].id)!;
        assert.equal(event.name, "");
        assert.equal(event.description, "");
        assert.equal(event.location, "");
        assert.deepEqual(event.sessions, [{ date: "2030-06-01", start: "09:00", end: "12:00" }]);
        await sql`update training_events set payload=${JSON.stringify(original.payload)}::jsonb where id=${events[0].id}`;
      },
    );
    await t.test(
      "revocation, disabled/unverified accounts and false admin profiles fail closed",
      async () => {
        const workspace = await organizationCatalog(sql, "steve");
        const service = serviceInput(workspace.services[0]),
          event = eventInput(workspace.events[0]);
        const denied = async (id: string) => {
          await assert.rejects(() => organizationCatalog(sql, id));
          await assert.rejects(() => saveOrganizationServiceMetadata(sql, id, service));
          await assert.rejects(() => saveOrganizationTrainingEventMetadata(sql, id, event));
        };
        for (const id of ["parent", "coach", "fake-owner", "missing"]) await denied(id);
        for (const status of ["active", "suspended", "removed"]) {
          await sql`update organization_operational_access set status=${status} where user_id='sara'`;
          await denied("sara");
        }
        await sql`update organization_operational_access set status='active' where user_id='sara'`;
        await sql`update "user" set "disabledAt"=now() where id='sara'`;
        await denied("sara");
        await sql`update "user" set "disabledAt"=null,"emailVerified"=false where id='sara'`;
        await denied("sara");
        await sql`update "user" set "emailVerified"=true where id='sara'`;
        await sql`update owner_grants set revoked_at=now() where user_id='steve'`;
        await denied("steve");
        await sql`update owner_grants set revoked_at=null where user_id='steve'`;
        await denied("sara");
        assert.ok((await organizationCatalog(sql, "steve")).services.length > 0);
      },
    );
  } finally {
    f.capture(false);
    await db.close();
  }
});

test("catalog endpoints opt into operational middleware and do not reuse financial legacy handlers", async () => {
  const api = await readFile("src/lib/coordinator/organization-catalog-api.ts", "utf8");
  const server = await readFile("src/lib/coordinator/organization-catalog.server.ts", "utf8");
  const ui = await readFile("src/components/coordinator/organization-catalog.tsx", "utf8");
  assert.equal((api.match(/middleware\(\[operationalAuthMiddleware\]\)/g) || []).length, 3);
  assert.equal(
    (server.match(/await requireOrganizationOperations\(tx, userId\)/g) || []).length,
    3,
  );
  assert.doesNotMatch(
    server,
    /select\s+\*|select\s+payload\s*[, ]|select\s+e\.payload\s*[, ]|select\s+o\.snapshot|from commerce_orders/i,
  );
  assert.doesNotMatch(
    ui,
    /getAdminServices|saveService\(|getEventOffice|saveEvent\(|formatMoney|priceCents|total_cents/,
  );
});
