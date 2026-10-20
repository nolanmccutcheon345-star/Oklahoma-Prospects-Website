/**
 * Actual owner activation on an EMPTY disposable PostgreSQL 17 CI database.
 * Never loads app DB config, resets a schema, deploys or contacts providers.
 * All accounts/data are synthetic. CI discards its dedicated service afterward.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import type { Sql } from "../src/lib/db";
import { sampleClub } from "../src/lib/teams/seed";
import { defaultBudget } from "../src/lib/teams/fee-model";
import { pendingMigrations } from "./migration-plan.mjs";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  previewFinancialBasisActivationForOwner,
  activateFinancialBasisForOwner,
} from "../src/lib/finance/basis.server";
import { financialBasisActivationInput } from "../src/lib/finance/activation-contracts";
const databaseName = "prospects_financial_activation_test";
const databaseUser = "financial_activation_test";
const testPassword = "synthetic-ci-only"; // Public literal for disposable CI only.
const owner = "owner";
const release = "a".repeat(40);
function isolatedConfiguration(): pg.ClientConfig {
  assert.equal(process.env.CI, "true", "Refusing to run outside explicit CI.");
  assert.equal(
    process.env.FINANCIAL_ACTIVATION_POSTGRES_CI,
    "isolated-synthetic",
    "Explicit synthetic PostgreSQL marker is required.",
  );
  // No ambient production/preview target or libpq override can select a server.
  for (const key of Object.keys(process.env)) {
    if (
      /^(DATABASE_URL|NETLIFY_DATABASE_URL|PREVIEW_DATABASE_URL|PG[A-Z_]+)$/.test(key) ||
      /^(SQUARE|STRIPE)_.*(TOKEN|SECRET|KEY)$/.test(key)
    )
      assert.ok(!process.env[key], `Refusing ambient database/provider configuration: ${key}.`);
  }
  assert.ok(!process.env.NETLIFY && !process.env.CONTEXT, "Hosted execution is forbidden.");
  const raw = process.env.FINANCIAL_ACTIVATION_TEST_DATABASE_URL;
  assert.ok(raw, "Explicit FINANCIAL_ACTIVATION_TEST_DATABASE_URL is required.");
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "PostgreSQL URL required.");
  assert.ok(
    ["127.0.0.1", "[::1]"].includes(url.hostname),
    "Only literal loopback hosts are allowed.",
  );
  assert.equal(url.pathname, `/${databaseName}`, "Refusing a non-synthetic database name.");
  assert.equal(url.username, databaseUser, "Dedicated synthetic database user required.");
  assert.ok(url.password === testPassword, "Only the literal disposable CI password is allowed.");
  assert.ok(!url.search, "Connection URL options are forbidden.");
  assert.ok(!url.hash, "Connection URL fragments are forbidden.");
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || "5432"),
    database: databaseName,
    user: databaseUser,
    password: testPassword,
    ssl: false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    lock_timeout: 15000,
    idle_in_transaction_session_timeout: 20000,
  };
}

async function assertPristineDatabase(client: pg.Client) {
  const {
    rows: [identity],
  } = await client.query<{
    database: string;
    username: string;
    version: number;
  }>(`select current_database() as database, current_user as username,
      current_setting('server_version_num')::integer as version`);
  assert.equal(identity.database, databaseName, "Connected database name mismatch.");
  assert.equal(identity.username, databaseUser, "Connected database user mismatch.");
  assert.ok(identity.version >= 170000 && identity.version < 180000, "PostgreSQL 17 is required.");
  const { rows: schemas } = await client.query<{ nspname: string }>(`
    select nspname from pg_namespace
    where nspname <> 'information_schema' and nspname !~ '^pg_' order by nspname`);
  assert.deepEqual(
    schemas.map((row) => row.nspname),
    ["public"],
    "Unexpected user schemas; refusing reuse.",
  );
  // Namespace dependencies cover relations, routines, types, operators and other
  // objects, including empty tables. We never erase or reuse an existing schema.
  const {
    rows: [objects],
  } = await client.query<{ count: number }>(`
    select count(*)::integer as count from pg_depend
    where refclassid='pg_namespace'::regclass
      and refobjid='public'::regnamespace`);
  assert.equal(objects.count, 0, "Public schema is not empty; refusing to migrate or reuse it.");
}

type AfterQuery = (text: string) => Promise<void> | void;
function sqlFor(client: pg.Client, afterQuery?: AfterQuery, nested = false): Sql {
  const run = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const result = await client.query(text, params);
    await afterQuery?.(text.trim().replace(/\s+/g, " ").toLowerCase());
    return result.rows as T[];
  };
  const sql = (async <T>(parts: TemplateStringsArray, ...values: unknown[]) =>
    run<T>(
      parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
      values,
    )) as Sql;
  sql.query = run;
  sql.transaction = async (work) => {
    assert.equal(nested, false, "Nested test transactions are forbidden.");
    await client.query("begin");
    try {
      const value = await work(sqlFor(client, afterQuery, true));
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  };
  return sql;
}

async function migrateOnce(client: pg.Client) {
  const names = await readdir(new URL("../migrations/", import.meta.url));
  await client.query(
    "create table if not exists _migrations(name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = (await client.query<{ name: string }>("select name from _migrations")).rows.map(
    (row) => row.name,
  );
  const pending = pendingMigrations(names, applied);
  assert.ok(
    names.includes("0069_financial_basis.sql"),
    "Financial foundation migration is missing.",
  );
  for (const { name } of pending) {
    await client.query("begin");
    try {
      await client.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
      await client.query("insert into _migrations(name) values($1)", [name]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  return pending.length;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForLock(observer: pg.Client, waiter: number, blocker: number) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const {
      rows: [row],
    } = await observer.query<{ blocked: boolean }>(
      `
      select exists(
        select 1 from pg_stat_activity a where a.pid=$1 and a.state='active'
          and a.wait_event_type='Lock' and $2=any(pg_blocking_pids(a.pid))
          and exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted)
      ) as blocked`,
      [waiter, blocker],
    );
    if (row.blocked) return;
    // This delay is only observation backoff; a real PostgreSQL wait graph is
    // the assertion. Merely letting a timer elapse never counts as a lock pass.
    await delay(20);
  }
  assert.fail("Expected concurrent PostgreSQL lock wait was not observed.");
}

async function pid(client: pg.Client) {
  return (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
}

async function seed(sql: Sql) {
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["replacement", "coach"],
    ["operations", "admin"],
    ["parent", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) {
    team.roster = team.roster.slice(0, 1);
    team.coachEmail = "coach@example.invalid";
    team.headCoach = "coach";
    team.staff = [
      {
        ...team.staff[0],
        id: "assistant",
        name: "replacement",
        email: "replacement@example.invalid",
        role: "Assistant Coach",
      },
    ];
    const player = team.roster[0];
    player.familyId = "fam-parent";
    player.parents = [
      { name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" },
    ];
    player.payments = [
      {
        date: "2026-10-01",
        amount: 100,
        fee: 0,
        charged: 100,
        method: "cash",
        label: "paid",
        receipt: "fixture",
      },
    ];
    player.credits = [];
    player.withdrawn = false;
    player.feeLock = {
      amount: 1000,
      lockedAt: "2026-09-01T00:00:00Z",
      policyVersion: "fixture",
      components: {},
    };
    player.planLock = {
      dep: 0,
      deadline: "2026-10-30",
      planType: "fixture",
      rows: [{ amount: 1000, date: "2026-10-30" }],
    };
  }
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const budget = {
    ...defaultBudget(),
    start: "2026-10-01",
    end: "2026-10-31",
    months: 1,
    costs: [
      { id: "cost-0", name: "Head coach", cents: 31001 },
      { id: "cost-1", name: "Assistant coach", cents: 101 },
    ],
  };
  for (const [index, team] of club.teams.entries()) {
    const plan = {
      budget,
      ...(index === 0 ? { publishedBudget: budget } : {}),
      status: "published",
      revision: 1,
      expenses: [],
      uniforms: [],
      players: {},
      history: [],
    };
    await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,1)`;
  }
  const [master] = await sql<any>`select payload from team_budget_master where id='master'`;
  master.payload.overheadReviewed = true;
  master.payload.payroll = [{ userId: "coach", name: "coach", monthly: 31000, active: true }];
  await sql`update team_budget_master set payload=${JSON.stringify(master.payload)}::jsonb where id='master'`;
  const file = {
    coaches: [
      { id: "coach-id", name: "coach", email: "coach@example.invalid", active: true },
      {
        id: "replacement-id",
        name: "replacement",
        email: "replacement@example.invalid",
        active: true,
      },
    ],
    coachPayouts: [{ coachId: "coach-id", serviceId: "lesson-service", splitPct: 41 }],
  };
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify(file)})`;
  await sql`insert into club_services(id,kind,name) values('lesson-service','lesson','Lesson')`;
  await sql`insert into club_staff(id,user_id,name,email,active) values('staff','coach','coach','coach@example.invalid',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','lesson-service',41)`;
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('order','order','customer@example.invalid','lesson-service','lesson','{}',10001,'paid','square','production')`;
  await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values('payment','order','production',10001,0,'COMPLETED')`;
  await sql`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('lesson','order','coach-id','lesson-service','2026-10-01 12:00Z','2026-10-01 13:15Z','[]'::jsonb,'completed')`;
  await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status) values('lesson','coach-id',10001,41,4100,'payable')`;
  const payee = {
    id: "coach-payee",
    email: "coach@example.invalid",
    name: "coach",
    role: "Instructor",
    method: "check",
    reference: "Check",
    active: true,
  } as const;
  await sql`insert into finance_records(id,kind,payload) values('coach-payee','payee',${JSON.stringify(payee)}::jsonb)`;

  await sql`update commerce_orders set snapshot=${JSON.stringify({ kind: "lesson", productId: "lesson-service", credits: 0, setupCents: 0, regularCents: 10001, bookingWindow: { start: "2026-10-01T12:00:00.000Z", end: "2026-10-01T13:15:00.000Z", coachId: "coach-id", participantCount: 1 } })}::jsonb,square_payment_id='payment',paid_at='2026-10-01 12:00Z' where id='order'`;
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('quote','quote','customer@example.invalid','lesson-service','lesson',${JSON.stringify({ kind: "lesson", productId: "lesson-service", credits: 0, setupCents: 0, bookingWindow: { start: "2026-10-25T12:00:00.000Z", end: "2026-10-25T13:15:00.000Z", coachId: "coach-id", participantCount: 1 } })}::jsonb,10001,'pending','square','production')`;
}
function command(p: Awaited<ReturnType<typeof previewFinancialBasisActivationForOwner>>) {
  return financialBasisActivationInput.parse(
    Object.fromEntries([
      ...[
        "expectedVersion",
        "expectedRelease",
        "asOf",
        "outputDigest",
        "sourceClubRevision",
        "sourceDigest",
        "readinessDigest",
        "reviewDigest",
      ].map((k) => [k, p[k as keyof typeof p]]),
      ["confirmed", true],
      ["reason", "Reviewed exact synthetic activation"],
    ]),
  );
}
async function unchanged(sql: Sql) {
  const out: Record<string, unknown> = {};
  for (const table of [
    "financial_basis_versions",
    "financial_team_seasons",
    "financial_player_agreements",
    "financial_team_aliases",
    "financial_player_aliases",
    "commerce_orders",
    "square_payment_attempts",
    "square_payments",
    "commerce_refunds",
    "booking_records",
    "credit_grants",
    "credit_uses",
    "contractor_earnings",
    "finance_records",
    "financial_lesson_recognitions",
    "organization_operational_access",
    "owner_grants",
    "profiles",
    "club_state",
    "team_fee_plans",
    "club_staff_services",
  ])
    out[table] = await sql.query(
      `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
    );
  return out;
}
async function activationRows(sql: Sql) {
  return {
    state: await sql`select * from financial_basis_state`,
    bindings: await sql`select * from financial_lesson_bindings order by booking_id`,
    audit: await sql`select * from finance_audit order by id`,
  };
}
async function rollbackWrite(client: pg.Client, text: string) {
  await client.query("begin");
  try {
    await client.query(text);
  } finally {
    await client.query("rollback");
  }
}
const sourceChange =
  "update club_state set rev=2,payload=jsonb_set(payload,'{_rev}','2'::jsonb) where id='oklahoma-prospects'";
const sourceRestore =
  "update club_state set rev=1,payload=jsonb_set(payload,'{_rev}','1'::jsonb) where id='oklahoma-prospects'";
const providerChange = "update square_payments set refunded_cents=1 where id='payment'";
const providerRestore = "update square_payments set refunded_cents=0 where id='payment'";
const restrictionChange =
  "insert into organization_operational_access(user_id,status,updated_by) values('owner','active','owner')";
async function verifyReviewLocks(observer: pg.Client, reviewing: pg.Client, writers: pg.Client[]) {
  const sql = sqlFor(observer),
    before = await unchanged(sql),
    rows = await activationRows(sql),
    reached = deferred(),
    resume = deferred();
  // PIDs are collected before any client is blocked, never queued behind its work.
  const blocker = await pid(reviewing),
    waiters = await Promise.all(writers.map(pid));
  const review = Promise.allSettled([
    previewFinancialBasisActivationForOwner(
      sqlFor(reviewing, async (text) => {
        if (text.startsWith("lock table finance_state,")) {
          reached.resolve();
          await resume.promise;
        }
      }),
      owner,
    ),
  ]);
  await Promise.race([
    reached.promise,
    review.then(() => assert.fail("Review failed before lock checkpoint.")),
  ]);
  const writes = Promise.allSettled(
    writers.map((w, i) => rollbackWrite(w, [sourceChange, providerChange, restrictionChange][i])),
  );
  try {
    await Promise.all(waiters.map((p) => waitForLock(observer, p, blocker)));
  } finally {
    resume.resolve();
  }
  const [result] = await review;
  assert.equal(result.status, "fulfilled");
  if (result.status === "fulfilled")
    assert.equal(result.value.readyForActivation, true, JSON.stringify(result.value.blockers));
  for (const r of await writes) assert.equal(r.status, "fulfilled");
  assert.deepEqual(await unchanged(sql), before);
  assert.deepEqual(await activationRows(sql), rows);
  console.log("PASS: review locks block source, provider and absent-row owner restriction writes.");
}
async function verifyWriterFirstStaleRace(
  observer: pg.Client,
  activation: pg.Client,
  writer: pg.Client,
) {
  const sql = sqlFor(observer),
    activationPid = await pid(activation),
    writerPid = await pid(writer);
  for (const [label, change, restore] of [
    ["source", sourceChange, sourceRestore],
    ["provider", providerChange, providerRestore],
  ]) {
    const review = await previewFinancialBasisActivationForOwner(sql, owner);
    assert.equal(review.readyForActivation, true, JSON.stringify(review.blockers));
    const before = await unchanged(sql),
      rows = await activationRows(sql);
    await writer.query("begin");
    await writer.query(change);
    const applying = Promise.allSettled([
      activateFinancialBasisForOwner(sqlFor(activation), owner, command(review)),
    ]);
    let committed = false;
    try {
      await waitForLock(observer, activationPid, writerPid);
      await writer.query("commit");
      committed = true;
    } finally {
      if (!committed) await writer.query("rollback");
    }
    const [result] = await applying;
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.match(String(result.reason), /changed/);
    assert.deepEqual(await activationRows(sql), rows);
    await sql.query(restore); // Restore this known synthetic fixture field only.
    assert.deepEqual(await unchanged(sql), before);
    console.log(
      `PASS: writer-first ${label} commit blocks actual activation then rejects stale receipt without partial writes.`,
    );
  }
}
async function verifyOwnerRevocation(sql: Sql) {
  const review = await previewFinancialBasisActivationForOwner(sql, owner),
    rows = await activationRows(sql);
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    activateFinancialBasisForOwner(sql, owner, command(review)),
    /Financial owner access required/,
  );
  await sql`update owner_grants set revoked_at=null where user_id='owner'`;
  assert.deepEqual(await activationRows(sql), rows);
  console.log("PASS: current owner revocation invalidates the exact review receipt.");
}
async function verifyRollback(client: pg.Client) {
  const sql = sqlFor(client),
    review = await previewFinancialBasisActivationForOwner(sql, owner);
  assert.equal(review.readyForActivation, true, JSON.stringify(review.blockers));
  const before = await unchanged(sql),
    rows = await activationRows(sql);
  for (const prefix of [
    "insert into financial_lesson_bindings",
    "update financial_basis_state set activation_state",
    "insert into finance_audit",
  ]) {
    await assert.rejects(
      activateFinancialBasisForOwner(
        sqlFor(client, (text) => {
          if (text.startsWith(prefix)) throw Error("Injected activation rollback");
        }),
        owner,
        command(review),
      ),
      /Injected activation rollback/,
    );
    assert.deepEqual(await unchanged(sql), before);
    assert.deepEqual(await activationRows(sql), rows);
  }
  const [{ revision }] = await sql<{
    revision: number;
  }>`select revision from finance_state where id='organization'`;
  await assert.rejects(
    activateFinancialBasisForOwner(
      sqlFor(client, async (text) => {
        if (text.startsWith("insert into financial_lesson_bindings"))
          await client.query(
            "update finance_state set revision=revision+1 where id='organization'",
          );
      }),
      owner,
      command(review),
    ),
    /Financial outputs differ/,
  );
  assert.equal(
    (await sql<{ revision: number }>`select revision from finance_state where id='organization'`)[0]
      .revision,
    revision,
  );
  assert.deepEqual(await unchanged(sql), before);
  assert.deepEqual(await activationRows(sql), rows);
  console.log(
    "PASS: binding, pointer, audit and actual projection-drift failures roll back all writes.",
  );
}
async function verifyActivationRace(
  observer: pg.Client,
  first: pg.Client,
  second: pg.Client,
  writers: pg.Client[],
) {
  const sql = sqlFor(observer),
    review = await previewFinancialBasisActivationForOwner(sql, owner);
  assert.equal(review.readyForActivation, true, JSON.stringify(review.blockers));
  assert.deepEqual(
    review.bindingPlan.map((b) => b.bookingId),
    ["lesson"],
  );
  assert.deepEqual(review.untouchedQuoteIds, ["quote"]);
  const before = await unchanged(sql),
    rows = await activationRows(sql),
    reached = deferred(),
    resume = deferred();
  const blocker = await pid(first),
    waiters = await Promise.all([second, ...writers].map(pid));
  const winner = Promise.allSettled([
    activateFinancialBasisForOwner(
      sqlFor(first, async (text) => {
        if (text.startsWith("update financial_basis_state set activation_state")) {
          reached.resolve();
          await resume.promise;
        }
      }),
      owner,
      command(review),
    ),
  ]);
  await Promise.race([
    reached.promise,
    winner.then(() => assert.fail("Activation failed before pointer checkpoint.")),
  ]);
  const loser = Promise.allSettled([
    activateFinancialBasisForOwner(sqlFor(second), owner, command(review)),
  ]);
  const writes = Promise.allSettled(
    writers.map((w, i) =>
      rollbackWrite(
        w,
        [
          "update team_budget_master set revision=revision+1 where id='master'",
          providerChange,
          restrictionChange,
        ][i],
      ),
    ),
  );
  try {
    await Promise.all(waiters.map((p) => waitForLock(observer, p, blocker)));
  } finally {
    resume.resolve();
  }
  const [won] = await winner,
    [lost] = await loser;
  assert.equal(won.status, "fulfilled");
  if (won.status === "fulfilled") {
    assert.equal(won.value.activationState, "active");
    assert.deepEqual(won.value.appliedBookingIds, ["lesson"]);
    assert.equal(won.value.outputDigest, review.outputDigest);
  }
  assert.equal(lost.status, "rejected");
  if (lost.status === "rejected") assert.match(String(lost.reason), /captured, inactive/);
  for (const r of await writes) assert.equal(r.status, "fulfilled");
  assert.deepEqual(await unchanged(sql), before);
  const after = await activationRows(sql);
  assert.equal(after.state[0].activation_state, "active");
  assert.equal(after.state[0].active_version, after.state[0].current_version);
  assert.deepEqual(
    after.bindings.map((b) => b.booking_id),
    ["lesson"],
  );
  assert.equal(after.audit.length, rows.audit.length + 1);
  assert.equal(after.audit.at(-1)?.action, "Activate reviewed financial basis");
  console.log(
    "PASS: simultaneous actual activation has exactly one winner/binding/audit; all concurrent source/provider/restriction writers wait; original paid/prepared orders and ledgers remain identical.",
  );
}
async function main() {
  const config = isolatedConfiguration(); // Guard BEFORE connection, never app configuration.
  pg.types.setTypeParser(20, Number);
  pg.types.setTypeParser(1082, (v) => v);
  pg.types.setTypeParser(1186, (v) => v);
  const clients: pg.Client[] = [];
  process.env.APP_BUILD_SOURCE_COMMIT = release;
  process.env.APP_BUILD_SOURCE_DIRTY = "false";
  try {
    const observer = new pg.Client({
      ...config,
      application_name: "financial-activation-synthetic-observer",
    });
    clients.push(observer);
    await observer.connect();
    await assertPristineDatabase(observer);
    assert.ok((await migrateOnce(observer)) > 0);
    assert.equal(await migrateOnce(observer), 0);
    await assert.rejects(assertPristineDatabase(observer), /Public schema is not empty/);
    const sql = sqlFor(observer);
    assert.deepEqual(await activationRows(sql), { state: [], bindings: [], audit: [] });
    await seed(sql);
    const initial = await previewFinancialBasisInitialization(sql, owner);
    await initializeFinancialBasisForOwner(sql, owner, {
      ...initial,
      reason: "Synthetic exact capture for activation verification",
    });
    assert.equal((await activationRows(sql)).state[0].activation_state, "captured");
    assert.equal((await activationRows(sql)).state[0].active_version, null);
    for (const label of ["first", "second", "source", "provider", "restriction"]) {
      const c = new pg.Client({
        ...config,
        application_name: "financial-activation-synthetic-" + label,
      });
      clients.push(c);
      await c.connect();
    }
    assert.equal(new Set(await Promise.all(clients.map(pid))).size, 6);
    const [, first, second, ...writers] = clients;
    await verifyReviewLocks(observer, first, writers);
    await verifyWriterFirstStaleRace(observer, first, writers[0]);
    await verifyOwnerRevocation(sql);
    await verifyRollback(observer);
    await verifyActivationRace(observer, first, second, writers);
    console.log(
      "PASS: actual owner activation verification complete on disposable synthetic PostgreSQL 17 only.",
    );
  } finally {
    await Promise.all(clients.map((c) => c.end()));
  } // Never DROP/TRUNCATE/reset to permit reuse.
}
main().catch((error: unknown) => {
  console.error(
    "FAIL: synthetic PostgreSQL activation verification:",
    error instanceof Error ? error.message : "Unknown failure",
  );
  process.exitCode = 1;
});
