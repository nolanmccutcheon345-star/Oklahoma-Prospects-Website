/**
 * Real PostgreSQL 17 concurrency checks, for an EMPTY disposable CI database only.
 * Never uses the application's database configuration, starts a server, resets a
 * schema, or contacts a payment provider. The workflow owns/discards its service.
 * The payment provider objects below are synthetic inputs to dormant primitives;
 * passing this harness does not certify a provider writer or authorize cutover.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import type { Sql } from "../src/lib/db";
import {
  withFinancialContext,
  recordFinancialTeamPaymentInTransaction,
} from "../src/lib/finance/context.server";
import { applyFutureActiveSchemaForTest } from "../src/lib/finance/context.test-fixture";
import {
  previewOrganizationAccess,
  applyOrganizationAccess,
} from "../src/lib/coordinator/organization-access.server";
import { saveAssignment } from "../src/lib/coordinator/admin.server";
import type { AssignmentInput } from "../src/lib/coordinator/contracts";
import { CoordinatorDenied, requireGrant } from "../src/lib/coordinator/access.server";
import { saveOrganizationTeam } from "../src/lib/coordinator/organization.server";
import { pendingMigrations } from "./migration-plan.mjs";
import {
  addFinancialPlayerAliasForOwner,
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  readFinancialBasisForOwner,
  resolveFinancialAgreement,
  updateFinancialBasisForOwner,
} from "../src/lib/finance/basis.server";
import {
  planFinancialTeamCheckout,
  transformFinancialTeamPaymentLedger,
  type FinancialTeamOrder,
  type LiveSquareTeamPayment,
} from "../src/lib/teams/financial-payment-adapter.server";
import { DEFAULT_SETTINGS, type ClubRecord, type Player, type Team } from "../src/lib/teams/types";
import { defaultBudget } from "../src/lib/teams/fee-model";
import type { FeePlan } from "../src/lib/teams/fee-contracts";

const databaseName = "prospects_financial_basis_test";
const databaseUser = "financial_basis_test";
const testPassword = "synthetic-ci-only"; // Literal nonsecret for the disposable service only.
const owner = "synthetic-owner";
const operations = "synthetic-operations";
const futureOwner = "synthetic-future-owner";
const parent = "synthetic-parent";
const basisId = "oklahoma-prospects";
const now = new Date("2026-10-20T12:00:00.000Z");
const financialTables = [
  "financial_basis_state",
  "financial_basis_versions",
  "financial_team_seasons",
  "financial_player_agreements",
  "financial_team_aliases",
  "financial_player_aliases",
] as const;

function isolatedConfiguration(): pg.ClientConfig {
  assert.equal(process.env.CI, "true", "Refusing to run outside explicit CI.");
  assert.equal(
    process.env.FINANCIAL_BASIS_POSTGRES_CI,
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
  const raw = process.env.FINANCIAL_BASIS_TEST_DATABASE_URL;
  assert.ok(raw, "Explicit FINANCIAL_BASIS_TEST_DATABASE_URL is required.");
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

function syntheticClub(): ClubRecord {
  const player: Player = {
    id: "synthetic-player",
    teamId: "synthetic-team",
    familyId: "synthetic-household",
    name: "Synthetic Player",
    number: "",
    positions: [],
    bats: "",
    throws: "",
    gradYear: "",
    school: "",
    height: "",
    weight: "",
    email: "",
    parents: [
      { name: "Synthetic Parent", rel: "parent", phone: "", email: `${parent}@example.invalid` },
    ],
    roleType: "full",
    coachChild: false,
    joinedOn: "2026-09-01",
    withdrawn: false,
    agreement: { version: "synthetic-v1", signedBy: "Synthetic Parent", signedAt: "2026-09-01" },
    feeLock: {
      amount: 1000,
      lockedAt: "2026-09-01",
      policyVersion: "synthetic-v1",
      components: {},
    },
    planLock: {
      dep: 400,
      deadline: "2027-01-01",
      planType: "split",
      rows: [
        { date: "2026-10-01", amount: 400 },
        { date: "2027-01-01", amount: 600 },
      ],
    },
    credits: [],
    payments: [],
    cards: [],
    planType: "split",
    depositPaid: false,
    uniformWaived: false,
    order: { number: "", sizes: {}, submitted: false },
    docs: { waiver: false, birthCert: false, insurance: false, physical: false },
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    publicProfile: { enabled: false, bio: "", slug: "" },
    prefs: { email: false, sms: false },
    reenroll: false,
    cageOverage: 0,
    stats: {},
    rsvp: {},
  };
  const team: Team = {
    id: player.teamId,
    name: "Synthetic Team",
    sport: "baseball",
    age: "",
    level: "",
    seasonLabel: "Synthetic season",
    seasonStart: "2026-09-01",
    seasonEnd: "2027-01-01",
    months: 4,
    headCoach: "",
    coachEmail: "",
    staff: [],
    uniformPackageId: "",
    uniformDeadline: "",
    orgFee: 0,
    coachMonthly: 0,
    eventBudget: 0,
    tournamentIds: [],
    otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
    teamCageHoursPerWeek: 0,
    playerCageHoursPerWeek: 0,
    record: { w: 0, l: 0, t: 0 },
    roster: [player],
    practices: [],
    messages: [],
    announcements: [],
    attendance: {},
    pitchLog: [],
    closed: false,
    notes: "",
  };
  return {
    settings: { ...DEFAULT_SETTINGS },
    teams: [team],
    catalog: [],
    uniforms: [],
    leads: [],
    alumni: [],
    notifications: [],
    audit: [],
    onboarding: { started: false },
    _rev: 1,
    _savedAt: now.toISOString(),
    _demo: false,
  };
}

async function seed(sql: Sql) {
  for (const [id, role] of [
    [owner, "admin"],
    [operations, "admin"],
    [futureOwner, "admin"],
    [parent, "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${`${id}@example.invalid`},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${`${id}@example.invalid`},${id},${role},'synthetic-household')`;
  }
  for (const id of [owner, operations, futureOwner])
    await sql`insert into owner_grants(email,user_id) values(${`${id}@example.invalid`},${id})`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values(${operations},'active',${owner})`;
  await sql`insert into club_households(id,primary_email) values('synthetic-household',${`${parent}@example.invalid`})`;
  const club = syntheticClub();
  await sql`insert into club_state(id,payload,rev,demo) values(${basisId},${JSON.stringify(club)}::jsonb,1,false)`;
  return club;
}

async function financialCounts(sql: Sql) {
  return Promise.all(
    financialTables.map(
      async (table) =>
        (await sql.query<{ count: number }>(`select count(*)::integer as count from ${table}`))[0]
          .count,
    ),
  );
}

async function verifyCaptureLocks(
  observer: pg.Client,
  capture: pg.Client,
  insert: pg.Client,
  update: pg.Client,
  restrict: pg.Client,
) {
  const sql = sqlFor(observer);
  const before = await previewFinancialBasisInitialization(sql, owner);
  const reached = deferred(),
    release = deferred();
  const capturePid = await pid(capture);
  const waiterPids = await Promise.all([insert, update, restrict].map(pid));
  const captureResult = previewFinancialBasisInitialization(
    sqlFor(capture, async (text) => {
      if (text.startsWith("lock table club_state,")) {
        reached.resolve();
        await release.promise;
      }
    }),
    owner,
  );
  // Attach settlement handlers immediately so a failed query never becomes an
  // unhandled rejection while the observer is checking the other connections.
  const captureSettled = Promise.allSettled([captureResult]);
  const latePlan: FeePlan = {
    budget: defaultBudget(),
    uniforms: [],
    status: "draft",
    revision: 1,
    expenses: [],
    players: {},
    history: [],
  };
  let writers: Promise<PromiseSettledResult<pg.QueryResult>[]> | undefined;
  try {
    await Promise.race([
      reached.promise,
      captureResult.then(() => {
        throw new Error("Capture lock hook was not reached.");
      }),
    ]);
    writers = Promise.allSettled([
      insert.query(
        "insert into team_fee_plans(team_id,payload,revision) values('synthetic-team',$1::jsonb,1)",
        [JSON.stringify(latePlan)],
      ),
      update.query(
        "update club_state set rev=rev+1,payload=jsonb_set(payload,'{teams,0,months}','5'::jsonb) where id=$1",
        [basisId],
      ),
      restrict.query(
        "insert into organization_operational_access(user_id,status,updated_by) values($1,'removed',$2)",
        [futureOwner, owner],
      ),
    ]);
    await Promise.all(waiterPids.map((waiter) => waitForLock(observer, waiter, capturePid)));
  } finally {
    release.resolve();
    await captureSettled;
    if (writers) await writers;
  }
  assert.ok(writers);
  for (const outcome of await writers) {
    if (outcome.status === "rejected") throw outcome.reason;
    assert.equal(outcome.value.rowCount, 1);
  }
  assert.deepEqual(await captureResult, before, "Capture must exclude concurrent source writes.");
  const after = await previewFinancialBasisInitialization(sql, owner);
  assert.equal(after.sourceClubRevision, before.sourceClubRevision + 1);
  assert.notEqual(after.sourceDigest, before.sourceDigest);
  await assert.rejects(
    readFinancialBasisForOwner(sql, futureOwner),
    /Financial owner access required/,
  );
  await assert.rejects(
    initializeFinancialBasisForOwner(sql, owner, { ...before, reason: "Synthetic stale capture" }),
    /source inputs changed/,
  );
  assert.deepEqual(await financialCounts(sql), [0, 0, 0, 0, 0, 0]);
  console.log(
    "PASS: actual PostgreSQL waits block source insert/update and new sticky restriction during capture.",
  );
  return after;
}

async function verifyPaymentRace(observer: pg.Client, first: pg.Client, second: pg.Client) {
  const sql = sqlFor(observer);
  const original = await readFinancialBasisForOwner(sql, owner);
  assert.ok(original);
  const player = original.inputs.club.teams[0].roster[0];
  const plan = planFinancialTeamCheckout(original, {
    request: {
      teamId: player.teamId,
      playerId: player.id,
      amount: 40000,
      consent: true,
      requestId: "00000000-0000-4000-8000-000000000001",
    },
    payer: { userId: parent, emailVerified: true, disabledAt: null, financialRestricted: false },
    environment: "production",
    orders: [],
    attempts: [],
    now,
  });
  assert.equal(plan.action, "create");
  if (plan.action !== "create") throw new Error("Synthetic quote missing.");
  // "production" here is only a primitive's ledger discriminator. No SDK,
  // provider connection, credential or genuine transaction is involved.
  const order: FinancialTeamOrder = {
    id: "synthetic-order",
    request_key: "00000000-0000-4000-8000-000000000001",
    kind: "team-fee",
    product_id: player.teamId,
    user_id: parent,
    email: `${parent}@example.invalid`,
    athlete_id: null,
    snapshot: plan.quote,
    status: "paid",
    total_cents: 40000,
    hold_until: new Date(plan.holdUntil),
    paid_at: now,
    payment_environment: "production",
    square_customer_id: null,
    square_payment_id: "synthetic-payment",
    square_fee_payment_id: null,
    subscription_id: null,
    square_card_id: null,
  };
  const payment: LiveSquareTeamPayment = {
    id: "synthetic-payment",
    order_id: order.id,
    environment: "production",
    status: "COMPLETED",
    amount_cents: 40000,
    refunded_cents: 0,
    receipt_url: "https://example.invalid/synthetic-receipt",
  };
  const input = {
    expectedVersion: original.version,
    order,
    payment,
    externalReconciledCents: 0,
    now,
  };
  const reached = deferred(),
    release = deferred();
  const firstPid = await pid(first),
    secondPid = await pid(second);
  let callbacks = 0;
  const write = (client: pg.Client, pause: boolean) =>
    updateFinancialBasisForOwner(
      sqlFor(client),
      owner,
      { expectedVersion: original.version, reason: "Synthetic payment CAS" },
      async (draft) => {
        callbacks += 1;
        const transform = transformFinancialTeamPaymentLedger(draft, input);
        assert.equal(transform.changed, true);
        if (transform.changed) draft.inputs = transform.nextInputs;
        if (pause) {
          reached.resolve();
          await release.promise;
        }
      },
    );
  const winner = write(first, true);
  const winnerSettled = Promise.allSettled([winner]);
  let results: Promise<PromiseSettledResult<Awaited<typeof winner>>[]> | undefined;
  try {
    await Promise.race([
      reached.promise,
      winner.then(() => {
        throw new Error("CAS lock hook was not reached.");
      }),
    ]);
    results = Promise.allSettled([winner, write(second, false)]);
    await waitForLock(observer, secondPid, firstPid);
  } finally {
    release.resolve();
    await winnerSettled;
    if (results) await results;
  }
  assert.ok(results);
  const outcomes = await results;
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const loser = outcomes.find((result) => result.status === "rejected");
  assert.ok(loser && loser.status === "rejected");
  assert.match(String(loser.reason), /Financial basis changed\. Refresh before saving/);
  assert.equal(callbacks, 1, "Stale CAS must fail before executing a ledger transform.");
  const saved = await readFinancialBasisForOwner(sql, owner);
  assert.ok(saved);
  assert.equal(saved.version, original.version + 1);
  const ledger = resolveFinancialAgreement(saved, { teamId: player.teamId, playerId: player.id })
    .player.payments;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].label, "Square: synthetic-payment");
  assert.equal(ledger[0].amount, 400);
  assert.deepEqual(
    transformFinancialTeamPaymentLedger(saved, { ...input, expectedVersion: saved.version }),
    {
      changed: false,
      expectedVersion: saved.version,
    },
  );
  assert.deepEqual(await financialCounts(sql), [1, 2, 1, 1, 1, 1]);
  assert.deepEqual(
    (
      await sql<{
        payload: typeof original.inputs;
      }>`select payload from financial_basis_versions where version=1`
    )[0].payload,
    original.inputs,
  );
  assert.deepEqual(
    (await sql<{ payload: ClubRecord }>`select payload from club_state where id=${basisId}`)[0]
      .payload,
    original.inputs.club,
  );
  assert.equal((await sql`select id from commerce_orders`).length, 0);
  console.log(
    "PASS: overlapping same-version payment CAS has one commit, one stale rejection and one ledger row.",
  );
  return saved;
}

/** Disposable active fixture only, after proving capture stays inactive and partial markers fail. */
async function verifyConsumerGate(observer: pg.Client, first: pg.Client, second: pg.Client) {
  const sql = sqlFor(observer);
  await applyFutureActiveSchemaForTest(sql);
  await sql`update organization_operational_access set status='active' where user_id=${operations}`;
  const baseline = await withFinancialContext(sql, owner, "owner", async (_tx, context) => ({
    version: context.version!,
    club: structuredClone(context.club),
  }));
  const [{ rev }] = await sql<{ rev: number }>`select rev from club_state where id=${basisId}`;
  // Never queue PID queries behind the blocked consumer query.
  const firstPid = await pid(first),
    secondPid = await pid(second);
  const locked = deferred(),
    release = deferred();
  let paused = false;
  const blockedSql = sqlFor(first, async (query) => {
    if (
      !paused &&
      query.startsWith("select id from financial_execution_gate") &&
      query.endsWith("for update")
    ) {
      paused = true;
      locked.resolve();
      await release.promise;
    }
  });
  const operation = saveOrganizationTeam(blockedSql, owner, {
    revision: rev,
    teamId: "synthetic-team",
    changes: { name: "Synthetic operational rename" },
  });
  const operationResult = operation.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await locked.promise;
  const financial = withFinancialContext(sqlFor(second), owner, "owner", async (tx, context) => {
    // Operational rename must not alter the financial identity or the frozen club.
    assert.deepEqual(context.club, baseline.club);
    return recordFinancialTeamPaymentInTransaction(tx, context, {
      teamId: "synthetic-team",
      playerId: "synthetic-player",
      amount: 10,
      method: "Check",
      label: "Synthetic consumer concurrency",
      expectedBasisVersion: baseline.version,
    });
  });
  const financialResult = financial.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  try {
    await waitForLock(observer, secondPid, firstPid);
  } finally {
    release.resolve();
  }
  const [op, money] = await Promise.all([operationResult, financialResult]);
  if ("error" in op) throw op.error;
  if ("error" in money) throw money.error;
  assert.equal(money.value.version, baseline.version + 1);
  const [{ payload }] = await sql<{
    payload: ClubRecord;
  }>`select payload from club_state where id=${basisId}`;
  assert.equal(payload.teams[0].name, "Synthetic operational rename");
  assert.equal(payload.teams[0].roster[0].payments.length, 0);
  await assert.rejects(
    withFinancialContext(sql, owner, "owner", (tx, context) =>
      recordFinancialTeamPaymentInTransaction(tx, context, {
        teamId: "synthetic-team",
        playerId: "synthetic-player",
        amount: 10,
        method: "Check",
        label: "Stale synthetic payment",
        expectedBasisVersion: baseline.version,
      }),
    ),
    /changed|refresh|version/i,
  );
  const current = await withFinancialContext(sql, owner, "owner", async (_tx, context) => ({
    version: context.version,
    club: structuredClone(context.club),
  }));
  await assert.rejects(
    withFinancialContext(
      sqlFor(observer, (query) => {
        if (query.startsWith("insert into finance_audit"))
          throw new Error("Synthetic audit failure");
      }),
      owner,
      "owner",
      (tx, context) =>
        recordFinancialTeamPaymentInTransaction(tx, context, {
          teamId: "synthetic-team",
          playerId: "synthetic-player",
          amount: 10,
          method: "Check",
          label: "Rollback synthetic payment",
          expectedBasisVersion: current.version!,
        }),
    ),
    /Synthetic audit failure/,
  );
  assert.deepEqual(
    await withFinancialContext(sql, owner, "owner", async (_tx, context) => ({
      version: context.version,
      club: structuredClone(context.club),
    })),
    current,
  );
  console.log(
    "PASS: real consumer execution gate serializes operations and finance; stale payments reject and failed audit rolls back basis and ledger.",
  );
}

/** Exact-account review must serialize with disabling that same existing account.
 * Reconstructed from the retained race contract; all changes stay in this fixture. */
async function verifyAccessGrantDisableRaces(
  observer: pg.Client,
  granting: pg.Client,
  disabling: pg.Client,
) {
  const sql = sqlFor(observer);
  const grantPid = await pid(granting),
    disablePid = await pid(disabling);
  const financialSnapshot = async () =>
    Promise.all(
      financialTables.map((table) =>
        sql.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`),
      ),
    );
  await sql`insert into staff_authorities(email,capability) values(${owner + "@example.invalid"},'staff_roles.manage') on conflict do nothing`;
  const zero: AssignmentInput = {
    userId: parent,
    sport: "baseball",
    revision: 0,
    status: "active",
    coverage: "sport",
    teamIds: [],
    permissions: [],
    confirm: true,
    independentRolesReviewed: false,
  };
  await saveAssignment(sql, owner, zero);
  const grantRows = () =>
    sql`select permissions,revision from coordinator_assignments where user_id=${parent} and sport='baseball'`;
  const grantAudits = () =>
    sql`select actor_id,action,target_id,result from coordinator_audit where action='staff_roles.manage' and target_id=${parent} and result='allowed' order by id`;
  const command = async (): Promise<AssignmentInput> => ({
    ...zero,
    revision: 1,
    permissions: ["recruiting.read"],
  });
  // The former blanket-grant transport stays denied even with clean active finance.
  const retired = await previewOrganizationAccess(sql, owner, { userId: parent });
  assert.equal(retired.ready, false);
  await assert.rejects(
    applyOrganizationAccess(sql, owner, {
      userId: parent,
      reviewDigest: retired.reviewDigest,
      expectedRelease: retired.release,
      expectedBasisVersion: retired.basisVersion!,
      expectedRevision: retired.revision,
      confirmed: true,
      reason: "Synthetic retirement regression",
    }),
    /retired/,
  );
  const initialGrants = await grantRows(),
    initialAudits = await grantAudits();
  const before = await financialSnapshot();
  assert.deepEqual(await grantRows(), initialGrants);
  assert.deepEqual(await grantAudits(), initialAudits);

  const firstReview = await command();
  await disabling.query("begin");
  await disabling.query('update "user" set "disabledAt"=$2 where id=$1', [parent, now]);
  const deniedGrant = Promise.allSettled([saveAssignment(sqlFor(granting), owner, firstReview)]);
  let disableCommitted = false;
  try {
    await waitForLock(observer, grantPid, disablePid);
    await disabling.query("commit");
    disableCommitted = true;
  } finally {
    if (!disableCommitted) await disabling.query("rollback");
  }
  const [denied] = await deniedGrant;
  assert.equal(denied.status, "rejected");
  if (denied.status === "rejected") assert.match(String(denied.reason), /active, verified adult/);
  assert.deepEqual(await grantRows(), initialGrants);
  assert.deepEqual(await grantAudits(), initialAudits);
  await assert.rejects(requireGrant(sql, parent, "recruiting.read", "baseball"), CoordinatorDenied);
  assert.deepEqual(await financialSnapshot(), before);
  console.log(
    "PASS: disable-first account row lock blocks exact-account grant; committed disable rejects it with no grant or audit.",
  );

  // Restore only this known synthetic account for the opposite ordering.
  await sql`update "user" set "disabledAt"=null where id=${parent}`;
  const secondReview = await command();
  const reached = deferred(),
    release = deferred();
  let paused = false;
  const granted = Promise.allSettled([
    saveAssignment(
      sqlFor(granting, async (query) => {
        if (
          !paused &&
          query.startsWith("select lower(trim(u.email))") &&
          query.endsWith("for update of u")
        ) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
      }),
      owner,
      secondReview,
    ),
  ]);
  await Promise.race([
    reached.promise,
    granted.then(() => assert.fail("Grant failed before target-account row-lock checkpoint.")),
  ]);
  const disabled = Promise.allSettled([
    (async () => {
      await disabling.query("begin");
      try {
        await disabling.query('update "user" set "disabledAt"=$2 where id=$1', [parent, now]);
        await disabling.query("commit");
      } catch (error) {
        await disabling.query("rollback");
        throw error;
      }
    })(),
  ]);
  try {
    await waitForLock(observer, disablePid, grantPid);
  } finally {
    release.resolve();
  }
  const [grantResult] = await granted,
    [disableResult] = await disabled;
  assert.equal(grantResult.status, "fulfilled");
  if (grantResult.status === "fulfilled") assert.deepEqual(grantResult.value, { ok: true });
  assert.equal(disableResult.status, "fulfilled");
  assert.deepEqual(await grantRows(), [{ permissions: ["recruiting.read"], revision: 2 }]);
  assert.equal((await grantAudits()).length, initialAudits.length + 1);
  // A persisted grant cannot override the next request's current account check.
  await assert.rejects(requireGrant(sql, parent, "recruiting.read", "baseball"), CoordinatorDenied);
  assert.deepEqual(await financialSnapshot(), before);
  console.log(
    "PASS: grant-first target FOR UPDATE blocks disable until scoped grant/audit commit; the next disabled-account request is denied and the financial basis is unchanged.",
  );
}

async function main() {
  const config = isolatedConfiguration(); // Reject unsafe inputs BEFORE any connection.
  process.env.APP_BUILD_SOURCE_COMMIT = "a".repeat(40);
  process.env.APP_BUILD_SOURCE_DIRTY = "false";
  const clients: pg.Client[] = [];
  try {
    const observer = new pg.Client({
      ...config,
      application_name: "financial-basis-synthetic-observer",
    });
    clients.push(observer);
    await observer.connect();
    await assertPristineDatabase(observer); // No writes are permitted before this passes.
    const applied = await migrateOnce(observer);
    assert.ok(applied > 0);
    assert.equal(
      await migrateOnce(observer),
      0,
      "The tracked second migration pass must execute no SQL files.",
    );
    await assert.rejects(assertPristineDatabase(observer), /Public schema is not empty/);
    const sql = sqlFor(observer);
    assert.deepEqual(
      await financialCounts(sql),
      [0, 0, 0, 0, 0, 0],
      "Migrations must not capture/backfill financial records.",
    );
    console.log(
      `PASS: ${applied} migrations applied once; tracked rerun is empty and populated-schema reuse is refused.`,
    );
    await seed(sql);
    assert.equal(await readFinancialBasisForOwner(sql, owner), null);
    const preview = await previewFinancialBasisInitialization(sql, owner);
    const failAfterAlias: AfterQuery = (text) => {
      if (text.startsWith("insert into financial_player_aliases"))
        throw new Error("Synthetic failure after alias insert");
    };
    await assert.rejects(
      initializeFinancialBasisForOwner(sqlFor(observer, failAfterAlias), owner, {
        ...preview,
        reason: "Synthetic initialization rollback",
      }),
      /Synthetic failure after alias insert/,
    );
    assert.deepEqual(await financialCounts(sql), [0, 0, 0, 0, 0, 0]);
    console.log(
      "PASS: initialization failure after real identity/alias inserts rolls back every financial table.",
    );

    for (const label of ["capture", "insert", "update", "restriction"]) {
      const client = new pg.Client({
        ...config,
        application_name: `financial-basis-synthetic-${label}`,
      });
      clients.push(client);
      await client.connect();
    }
    const [, capture, insert, update, restriction] = clients;
    assert.equal(
      new Set(await Promise.all(clients.map(pid))).size,
      5,
      "Independent backend sessions are required.",
    );
    const fresh = await verifyCaptureLocks(observer, capture, insert, update, restriction);
    const receipt = await initializeFinancialBasisForOwner(sql, owner, {
      ...fresh,
      reason: "Synthetic reviewed capture",
    });
    assert.equal(receipt.activationState, "captured");
    assert.equal(receipt.activeVersion, null);
    assert.deepEqual(await financialCounts(sql), [1, 1, 1, 1, 1, 1]);

    const saved = await verifyPaymentRace(observer, capture, insert);
    const beforeAlias = await financialCounts(sql);
    const aliasCommand = {
      expectedVersion: saved.version,
      agreementId: saved.agreements[0].id,
      teamId: "synthetic-transfer-team",
      playerId: "synthetic-transfer-player",
      reason: "Synthetic alias rollback",
    };
    await assert.rejects(
      addFinancialPlayerAliasForOwner(sqlFor(observer, failAfterAlias), owner, aliasCommand),
      /Synthetic failure after alias insert/,
    );
    assert.deepEqual(await financialCounts(sql), beforeAlias);
    assert.deepEqual(await readFinancialBasisForOwner(sql, owner), saved);
    console.log("PASS: failed alias append rolls back both the new version and alias.");

    for (const status of ["active", "suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id=${operations}`;
      await assert.rejects(
        readFinancialBasisForOwner(sql, operations),
        /Financial owner access required/,
      );
      await assert.rejects(
        previewFinancialBasisInitialization(sql, operations),
        /Financial owner access required/,
      );
      await assert.rejects(
        initializeFinancialBasisForOwner(sql, operations, {
          ...fresh,
          reason: "Denied synthetic capture",
        }),
        /Financial owner access required/,
      );
      await assert.rejects(
        updateFinancialBasisForOwner(
          sql,
          operations,
          { expectedVersion: saved.version, reason: "Denied synthetic amendment" },
          () => assert.fail("Restricted callback executed"),
        ),
        /Financial owner access required/,
      );
      await assert.rejects(
        addFinancialPlayerAliasForOwner(sql, operations, aliasCommand),
        /Financial owner access required/,
      );
    }
    await assert.rejects(
      sql`update organization_operational_access set financial_restricted=false where user_id=${operations}`,
      { code: "23514" },
    );
    await assert.rejects(
      sql`update financial_basis_state set activation_state='active' where id=${basisId}`,
      { code: "23514" },
    );
    await assert.rejects(
      sql`update financial_basis_state set active_version=current_version where id=${basisId}`,
      { code: "23514" },
    );
    assert.deepEqual(await readFinancialBasisForOwner(sql, owner), saved);
    assert.deepEqual(await financialCounts(sql), beforeAlias);
    console.log(
      "PASS: sticky operations restriction overrides even an owner grant; incomplete activation markers fail.",
    );
    await verifyConsumerGate(observer, capture, insert);
    await verifyAccessGrantDisableRaces(observer, capture, insert);
    console.log(
      "PASS: real PostgreSQL financial foundation and prospective consumer verification complete (synthetic only; no live cutover/provider coverage).",
    );
  } finally {
    // Leave the populated fixture intact. The ephemeral CI service is discarded
    // by its owner; this script must never DROP/TRUNCATE data to allow a rerun.
    await Promise.all(clients.map((client) => client.end()));
  }
}

main().catch((error: unknown) => {
  console.error(
    "FAIL: synthetic PostgreSQL financial verification:",
    error instanceof Error ? error.message : "Unknown failure",
  );
  process.exitCode = 1;
});
