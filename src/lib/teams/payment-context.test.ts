import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import type { ClubRecord } from "./types";
import { prepareTeamCheckout, syncTeamPayment, validateTeamPayment } from "./payment.server";
import { fulfillSquarePayment, type SquareOrder } from "../commerce/square-payments.server";
import {
  addFinancialPlayerAliasForOwner,
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  readFinancialBasisForOwner,
  resolveFinancialAgreement,
} from "../finance/basis.server";
import {
  assertApprovedFinancialLessonInTransaction,
  commitFinancialClubTermsInTransaction,
  loadFinancialContextInTransaction,
  lockFinancialExecution,
} from "../finance/context.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import { secured, CoordinatorDenied } from "../coordinator/access.server";

// One disposable WASM database; no deployed database or provider client is used.
const db = new PGlite();
after(() => db.close());
const wrap = (query: PGlite["query"], transaction?: Sql["transaction"]): Sql => {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (text: string, values: unknown[] = []) =>
    (await query(text, values)).rows) as Sql["query"];
  sql.transaction =
    transaction ||
    (async () => {
      throw new Error("Nested transactions are forbidden in this fixture.");
    });
  return sql;
};
const sql = wrap(db.query.bind(db), (work) =>
  db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"]))),
);

async function fixture() {
  await db.exec("drop schema public cascade; create schema public");
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  for (const [id, role] of [
    ["owner", "admin"],
    ["parent", "parent"],
    ["outsider", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  const club = sampleClub();
  club._demo = false;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) {
    team.closed = false;
    team.roster = team.roster.slice(0, 1);
    const p = team.roster[0];
    p.familyId = "financial-home";
    p.withdrawn = false;
    p.roleType = "po";
    p.parents = [{ name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" }];
    p.payments = [];
    p.credits = [];
    p.depositPaid = false;
    p.feeLock = { amount: 1000, lockedAt: "2026-01-01", policyVersion: "v1", components: {} };
    p.planLock = {
      dep: 400,
      deadline: "2027-01-01",
      planType: "split",
      rows: [
        { date: "2026-01-01", amount: 400 },
        { date: "2027-01-01", amount: 600 },
      ],
    };
    p.agreement = { signedAt: "2026-01-01", signedBy: "Parent", version: "v1" };
  }
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
  await sql`insert into club_households(id,primary_email) values('financial-home','parent@example.invalid')`;
  await sql`insert into household_members(household_id,user_id) values('financial-home','parent')`;
  const team = club.teams[0],
    player = team.roster[0];
  const request = {
    teamId: team.id,
    playerId: player.id,
    amount: 40000,
    requestId: randomUUID(),
    consent: true as const,
  };
  const capture = async (active = true) => {
    const preview = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      ...preview,
      reason: "Explicit synthetic payment cutover fixture",
    });
    const basis = (await readFinancialBasisForOwner(sql, "owner"))!;
    const agreementId = resolveFinancialAgreement(basis, request).identity.id;
    await addFinancialPlayerAliasForOwner(sql, "owner", {
      expectedVersion: basis.version,
      reason: "Synthetic operational-transfer alias",
      agreementId,
      teamId: club.teams[1].id,
      playerId: player.id,
    });
    if (active) await applyFutureActiveSchemaForTest(sql);
    return agreementId;
  };
  const move = async () => {
    const operational = structuredClone(club);
    const moved = operational.teams[0].roster.shift()!;
    moved.teamId = operational.teams[1].id;
    moved.roleType = "full";
    moved.withdrawn = true;
    moved.familyId = "new-operational-home";
    moved.parents[0].email = "outsider@example.invalid";
    operational.teams[1].roster.push(moved);
    operational.teams[0].closed = true;
    operational.teams[0].name = "Changed operational name";
    await sql`update club_state set payload=${JSON.stringify(operational)}::jsonb,rev=rev+1`;
    await sql`delete from household_members where user_id='parent'`;
    await sql`insert into household_members(household_id,user_id) values('financial-home','outsider')`;
    await sql`update "user" set email='changed-parent@example.invalid' where id='parent'`;
    return operational;
  };
  const context = () =>
    sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      return loadFinancialContextInTransaction(tx, "owner", "owner");
    });
  const getOrder = async (id: string) =>
    (await sql<SquareOrder>`select * from commerce_orders where id=${id}`)[0];
  const attachCustomer = async (id: string) => {
    await sql`update commerce_orders set square_customer_id='customer' where id=${id}`;
    return getOrder(id);
  };
  const fulfill = async (id: string, refunded = 0, environment = "production") => {
    const order = await getOrder(id);
    return sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        {
          id: "pay-" + id,
          referenceId: id,
          status: "COMPLETED",
          sourceType: "CARD",
          locationId: "location",
          customerId: "customer",
          amountMoney: { amount: BigInt(order.total_cents), currency: "USD" },
          totalMoney: { amount: BigInt(order.total_cents), currency: "USD" },
          refundedMoney: { amount: BigInt(refunded), currency: "USD" },
          createdAt: "2026-10-20T00:00:00.000Z",
        },
        { environment, locationId: "location" },
      ),
    );
  };
  return { club, team, player, request, capture, move, context, getOrder, attachCustomer, fulfill };
}

test("captured production schema stays on real legacy payment behavior and rejects partial activation", async () => {
  const f = await fixture();
  await f.capture(false);
  await assert.rejects(
    sql`update financial_basis_state set activation_state='active'`,
    /check constraint/,
  );
  f.player.feeLock!.amount = 1200;
  await sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
  const ready = await prepareTeamCheckout(
    sql,
    "parent",
    { ...f.request, amount: 110000 },
    "production",
  );
  const order = await f.attachCustomer(ready.orderId);
  assert.equal((await f.context()).mode, "legacy");
  assert.deepEqual(order.snapshot.teamFee, {
    teamId: f.team.id,
    playerId: f.player.id,
    lockedAt: "2026-01-01",
    role: "po",
  });
  await f.fulfill(order.id);
  const [live] = await sql<{ payload: ClubRecord }>`select payload from club_state`;
  assert.equal(live.payload.teams[0].roster[0].payments[0].amount, 1100);
  assert.equal(
    (await readFinancialBasisForOwner(sql, "owner"))!.inputs.club.teams[0].roster[0].payments
      .length,
    0,
  );
  assert.equal(
    (await sql`select * from financial_basis_versions where actor_kind='provider'`).length,
    0,
  );
});

test("real pre-cutover pending order survives transfer; completion/refunds remain exactly once after payer disablement", async () => {
  const f = await fixture();
  const ready = await prepareTeamCheckout(sql, "parent", f.request, "production");
  await f.attachCustomer(ready.orderId);
  const agreementId = await f.capture();
  const operational = await f.move();
  const retry = await prepareTeamCheckout(sql, "parent", f.request, "production");
  assert.equal(retry.orderId, ready.orderId);
  const order = await f.getOrder(ready.orderId);
  assert.equal(
    order.snapshot.teamFee!.financialAgreementId,
    undefined,
    "historical order snapshot is not rewritten",
  );
  await sql.transaction((tx) => validateTeamPayment(tx, order));
  await assert.rejects(
    prepareTeamCheckout(sql, "outsider", { ...f.request, requestId: randomUUID() }, "production"),
    /authorized parent or guardian/,
  );
  await sql`update "user" set "disabledAt"=now() where id='parent'`;
  await f.fulfill(order.id);
  await f.fulfill(order.id);
  let context = await f.context();
  assert.equal(context.version, 3);
  let player = resolveFinancialAgreement(context.basis!, { agreementId }).player;
  assert.equal(player.payments.length, 1);
  assert.equal(player.payments[0].amount, 400);
  assert.equal(player.depositPaid, true);
  await f.fulfill(order.id, 10000);
  await f.fulfill(order.id, 0);
  context = await f.context();
  assert.equal(context.version, 4);
  player = resolveFinancialAgreement(context.basis!, { agreementId }).player;
  assert.equal(player.payments[0].amount, 300);
  assert.equal(player.payments[0].charged, 400);
  assert.equal(player.depositPaid, false);
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,reason,square_payment_id,external_status,external_reference) values('external-refund',${order.id},'owner',5000,'completed','Synthetic bank-reconciled refund',${"pay-" + order.id},'reconciled','synthetic-bank')`;
    await syncTeamPayment(tx, order.id);
  });
  await sql.transaction((tx) => syncTeamPayment(tx, order.id));
  context = await f.context();
  assert.equal(context.version, 5);
  assert.equal(
    resolveFinancialAgreement(context.basis!, { agreementId }).player.payments[0].amount,
    250,
  );
  assert.deepEqual(
    (await sql<{ payload: ClubRecord }>`select payload from club_state`)[0].payload,
    operational,
  );
  const actors = await sql<{
    actor_kind: string;
    changed_by: string | null;
    provider_order_id: string;
  }>`select actor_kind,changed_by,provider_order_id from financial_basis_versions where actor_kind='provider'`;
  assert.equal(actors.length, 3);
  assert.ok(actors.every((r) => r.changed_by === null && r.provider_order_id === order.id));
  assert.equal(
    (await sql`select * from payment_notifications where id=${"receipt:" + order.id}`).length,
    1,
  );
});

test("active preparation resolves both aliases, rejects changed current security and serializes ambiguous attempts", async () => {
  const f = await fixture();
  const agreementId = await f.capture();
  await f.move();
  await sql`update profiles set role='player' where user_id='parent'`;
  const movedRequest = { ...f.request, teamId: f.club.teams[1].id, requestId: randomUUID() };
  const ready = await prepareTeamCheckout(sql, "parent", movedRequest, "production");
  const order = await f.attachCustomer(ready.orderId);
  assert.equal(order.snapshot.teamFee!.financialAgreementId, agreementId);
  assert.equal(order.snapshot.teamFee!.teamId, movedRequest.teamId);
  assert.equal(order.snapshot.teamFee!.role, "po");
  assert.equal(order.product_id, f.team.id);
  await sql.transaction((tx) => validateTeamPayment(tx, order));
  await sql`update commerce_orders set status='expired',hold_until=now()-interval '1 day' where id=${order.id}`;
  await sql`insert into square_payment_attempts(id,order_id,token_hash,status) values('ambiguous',${order.id},'synthetic-hash','unknown')`;
  await assert.rejects(
    prepareTeamCheckout(sql, "parent", { ...f.request, requestId: randomUUID() }, "production"),
    /already awaiting/,
  );
  const sandbox = await prepareTeamCheckout(
    sql,
    "parent",
    { ...f.request, requestId: randomUUID() },
    "sandbox",
  );
  assert.ok(sandbox.orderId);
  await sql`update square_payment_attempts set status='declined' where id='ambiguous'`;
  const concurrent = await Promise.allSettled([
    prepareTeamCheckout(sql, "parent", { ...f.request, requestId: randomUUID() }, "production"),
    prepareTeamCheckout(sql, "parent", { ...movedRequest, requestId: randomUUID() }, "production"),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((r) => r.status === "rejected").length, 1);
  for (const change of [
    `update "user" set "emailVerified"=false where id='parent'`,
    `update "user" set "emailVerified"=true,"disabledAt"=now() where id='parent'`,
  ]) {
    await sql.query(change);
    await assert.rejects(prepareTeamCheckout(sql, "parent", movedRequest, "production"));
    await assert.rejects(
      sql.transaction((tx) => validateTeamPayment(tx, order)),
      /Current financial account/,
    );
  }
  await sql`update "user" set "disabledAt"=null where id='parent'`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('parent','suspended','owner')`;
  await assert.rejects(prepareTeamCheckout(sql, "parent", movedRequest, "production"));
  await assert.rejects(
    sql.transaction((tx) => validateTeamPayment(tx, order)),
    /Current financial account/,
  );
});

test("active sandbox completion uses frozen terms after transfer without writing a financial receipt", async () => {
  const f = await fixture();
  const agreementId = await f.capture();
  const ready = await prepareTeamCheckout(sql, "parent", f.request, "sandbox");
  await f.attachCustomer(ready.orderId);
  const operational = await f.move();
  await f.fulfill(ready.orderId, 0, "sandbox");
  const context = await f.context();
  assert.equal((await f.getOrder(ready.orderId)).status, "paid");
  assert.equal(context.version, 2);
  assert.equal(
    resolveFinancialAgreement(context.basis!, { agreementId }).player.payments.length,
    0,
  );
  assert.deepEqual(
    (await sql<{ payload: ClubRecord }>`select payload from club_state`)[0].payload,
    operational,
  );
});

test("initial refunded observations preserve review/refund behavior without creating a financial payment row", async () => {
  const f = await fixture();
  const agreementId = await f.capture();
  const ready = await prepareTeamCheckout(sql, "parent", f.request, "production");
  await f.attachCustomer(ready.orderId);
  await f.move();
  await f.fulfill(ready.orderId, 10000);
  await f.fulfill(ready.orderId, 10000);
  assert.equal((await f.getOrder(ready.orderId)).status, "payment_review");
  const context = await f.context();
  assert.equal(context.version, 2);
  assert.equal(
    resolveFinancialAgreement(context.basis!, { agreementId }).player.payments.length,
    0,
  );
  const refunds = await sql<{
    amount_cents: number;
  }>`select amount_cents from commerce_refunds where order_id=${ready.orderId}`;
  assert.deepEqual(
    refunds.map((r) => r.amount_cents),
    [30000],
  );
  assert.equal(
    (await sql`select * from payment_notifications where id=${"receipt:" + ready.orderId}`).length,
    0,
  );
});

test("active validation rejects mismatched stable IDs and provider ledger cross-links", async () => {
  const f = await fixture();
  await f.capture();
  const ready = await prepareTeamCheckout(sql, "parent", f.request, "production");
  const order = await f.attachCustomer(ready.orderId);
  const forged = structuredClone(order);
  forged.snapshot.teamFee!.financialAgreementId = randomUUID();
  await assert.rejects(
    sql.transaction((tx) => validateTeamPayment(tx, forged)),
    /identity changed/,
  );
  await f.fulfill(order.id);
  await sql`update square_payments set environment='sandbox' where id=${"pay-" + order.id}`;
  await assert.rejects(
    sql.transaction((tx) => syncTeamPayment(tx, order.id)),
    /ledger identity mismatch/,
  );
  assert.equal((await f.context()).version, 3);
  await assert.rejects(
    prepareTeamCheckout(
      sql,
      "parent",
      {
        ...f.request,
        requestId: randomUUID(),
        financialAgreementId: "browser-cannot-supply",
      } as typeof f.request,
      "production",
    ),
  );
});

test("coordinator booking gate precedes verified-account lock and denied actors never reach domain writes", async () => {
  await fixture();
  const statements: string[] = [];
  const tracked = wrap(db.query.bind(db), (work) =>
    db.transaction((tx) => {
      const query = (async (text: string, values: unknown[]) => {
        statements.push(text);
        return tx.query(text, values);
      }) as PGlite["query"];
      return work(wrap(query));
    }),
  );
  await secured(
    tracked,
    "parent",
    "synthetic.gate",
    async (tx) => {
      await tx`insert into commerce_policy(id,value,updated_by) values('gate-allowed','{}'::jsonb,'parent')`;
    },
    lockFinancialExecution,
  );
  assert.match(statements[0], /financial_execution_gate.*for update/);
  assert.match(statements[1], /from "user".*for share/);
  await sql`update "user" set "disabledAt"=now() where id='parent'`;
  statements.length = 0;
  let called = false;
  await assert.rejects(
    secured(
      tracked,
      "parent",
      "synthetic.gate",
      async (tx) => {
        called = true;
        await tx`insert into commerce_policy(id,value,updated_by) values('gate-denied','{}'::jsonb,'parent')`;
      },
      lockFinancialExecution,
    ),
    CoordinatorDenied,
  );
  assert.equal(called, false);
  assert.match(statements[0], /financial_execution_gate.*for update/);
  assert.match(statements[1], /from "user".*for share/);
  assert.equal((await sql`select * from commerce_policy where id='gate-denied'`).length, 0);
  let arbitraryCallback = false;
  await assert.rejects(
    secured(
      tracked,
      "owner",
      "synthetic.gate",
      async () => {},
      async () => {
        arbitraryCallback = true;
      },
    ),
    /Invalid execution gate/,
  );
  assert.equal(arbitraryCallback, false);
});

test("paid lesson slot conflict rolls back immutable binding and booking together before one review refund", async () => {
  const f = await fixture();
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify({
    coaches: [
      { id: "coach-approved", name: "Approved", email: "coach@example.invalid", active: true },
    ],
    coachPayouts: [{ coachId: "coach-approved", serviceId: "s3", splitPct: 41 }],
  })}::jsonb)`;
  await f.capture();
  const startsAt = "2027-01-01T12:00:00.000Z",
    endsAt = "2027-01-01T13:00:00.000Z";
  await assert.rejects(
    sql.transaction((tx) =>
      assertApprovedFinancialLessonInTransaction(tx, {
        coachId: "operational-only-coach",
        productId: "s3",
        startsAt,
        endsAt,
      }),
    ),
    /Financial instructor admission/,
  );
  assert.equal((await sql`select * from square_payments`).length, 0);
  for (const id of ["lesson-one", "lesson-conflict"]) {
    await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      const admission = await assertApprovedFinancialLessonInTransaction(tx, {
        coachId: "coach-approved",
        productId: "s3",
        startsAt,
        endsAt,
      });
      const snapshot: SquareOrder["snapshot"] = {
        productId: "s3",
        kind: "lesson",
        title: "Synthetic approved lesson",
        totalCents: 10000,
        regularCents: 10000,
        setupCents: 0,
        recurring: false,
        assessment: false,
        duration: 60,
        sessionMinutes: 60,
        credits: 0,
        remote: 0,
        expiresDays: 30,
        discipline: "Pitching",
        resources: ["coach:coach-approved", "lane:fixture"],
        lines: [{ label: "Lesson", cents: 10000 }],
        teamRate: false,
        needsSlot: true,
        bookingWindow: {
          start: startsAt,
          end: endsAt,
          coachId: "coach-approved",
          participantCount: 1,
        },
        financialLessonAdmission: admission,
      };
      await tx`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id)
        values(${id},${id},'parent','parent@example.invalid','s3','lesson',${JSON.stringify(snapshot)}::jsonb,10000,'2027-01-01','square','production','customer')`;
    });
  }
  // A genuine owner-approved terms command advances the financial version after
  // reservation; fulfillment must keep the original admission version.
  const before = await f.context();
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const context = await loadFinancialContextInTransaction(tx, "owner", "owner");
    await commitFinancialClubTermsInTransaction(tx, context, {
      expectedBasisVersion: context.version!,
      reason: "Synthetic owner amendment after charge reservation",
      settings: { membershipMonthly: 2 },
    });
  });
  await f.fulfill("lesson-one");
  await f.fulfill("lesson-conflict");
  await f.fulfill("lesson-conflict");
  assert.equal((await f.getOrder("lesson-one")).status, "paid");
  assert.equal((await f.getOrder("lesson-conflict")).status, "payment_review");
  const bindings = await sql<{
    order_id: string;
    basis_version: number;
  }>`select order_id,basis_version from financial_lesson_bindings`;
  assert.deepEqual(bindings, [{ order_id: "lesson-one", basis_version: before.version }]);
  assert.equal((await sql`select * from booking_records`).length, 1);
  assert.equal(
    (await sql`select * from booking_records where order_id='lesson-conflict'`).length,
    0,
  );
  assert.equal(
    (await sql`select * from commerce_refunds where order_id='lesson-conflict'`).length,
    1,
  );
  assert.equal(
    (await sql`select * from payment_notifications where id='owner-review:lesson-conflict'`).length,
    1,
  );
  await assert.rejects(
    sql`update commerce_orders set snapshot=snapshot-'financialLessonAdmission' where id='lesson-one'`,
    /immutable|cannot|original|admission/i,
  );
  await assert.rejects(
    sql`update commerce_orders set snapshot=jsonb_set(snapshot,'{financialLessonAdmission,basisVersion}','3'::jsonb) where id='lesson-one'`,
    /immutable|cannot|original|admission/i,
  );
  // Unpaid operational occupancy must never synthesize a paid financial binding.
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status)
      values('tryout-occupancy',null,'parent','operational-only-coach','tryout',${startsAt},${endsAt},'[]'::jsonb,'confirmed')`;
  });
  assert.equal((await sql`select * from financial_lesson_bindings`).length, 1);
});
