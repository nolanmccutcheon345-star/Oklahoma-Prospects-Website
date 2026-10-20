import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { defaultBudget } from "../teams/fee-model";
import { withFinancialContext } from "./context.server";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "./basis.server";
import { sourceData } from "./sources.server";
import { facilityPayables } from "./facility.server";
import {
  financeWorkspace,
  financeWorkspaceInTransaction,
  mutateFinance,
  records,
} from "./store.server";
import { myFinance, myPreference } from "./self.server";
import { resolveIdentity } from "../identity.server";
import { completeSessionInTransaction } from "../commerce/portal.server";
import { lockFinancialExecution } from "./execution.server";

const db = new PGlite();
after(() => db.close());
const asOf = "2026-10-15";
async function fixture() {
  await db.exec("drop schema public cascade; create schema public");
  let transactionDepth = 0;
  const wrap = (query: PGlite["query"], outer = false): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = outer
      ? (fn) =>
          db.transaction(async (tx) => {
            transactionDepth++;
            try {
              return await fn(wrap(tx.query.bind(tx) as PGlite["query"]));
            } finally {
              transactionDepth--;
            }
          })
      : async () => {
          throw Error("Nested transaction forbidden");
        };
    return sql;
  };
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db), true);
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["replacement", "coach"],
    ["operations", "admin"],
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
  return { sql, club, file, payee, transactionDepth: () => transactionDepth };
}
async function activateFutureSchema(sql: Sql) {
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Explicit disposable test capture",
  });
  // Future-schema fixture only: shipped migrations still prohibit activation.
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_activation_state_check",
  );
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_active_version_check",
  );
  await sql`update financial_basis_state set activation_state='active',active_version=current_version`;
}
async function projection(sql: Sql) {
  return withFinancialContext(sql, "owner", "owner", async (tx, context) => {
    const rs = await records(tx);
    return {
      sources: await sourceData(tx, asOf, rs, context),
      facility: await facilityPayables(tx, asOf, rs, context),
    };
  });
}

test("fixed-as-of legacy, captured and active financial sources remain equal, including absent publication cash protection", async () => {
  const { sql, club } = await fixture();
  const before = await projection(sql);
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Explicit disposable test capture",
  });
  assert.deepEqual(await projection(sql), before);
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_activation_state_check",
  );
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_active_version_check",
  );
  await sql`update financial_basis_state set activation_state='active',active_version=current_version`;
  assert.deepEqual(await projection(sql), before);
  assert.equal(before.sources.teams.find((t) => t.id === club.teams[1].id)?.protectedDirect, 10000);
  assert.equal(
    before.sources.candidates.find((p) => p.id === "lesson:lesson")?.payeeId,
    "coach-payee",
  );
});

test("operational coach/contact/staff/booking changes cannot reattribute financial lessons, seasons or payroll", async () => {
  const { sql, club, file } = await fixture();
  await activateFutureSchema(sql);
  const before = await projection(sql),
    mine = await myFinance(sql, "coach");
  club.teams[0].coachEmail = "replacement@example.invalid";
  club.teams[0].headCoach = "Replacement";
  club.teams[0].staff = [];
  club.teams[0].roster[0].name = "Operational rename";
  await sql`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=rev+1`;
  file.coaches[0].email = "replacement@example.invalid";
  file.coachPayouts[0].splitPct = 99;
  await sql`update pd_working_file set payload=${JSON.stringify(file)} where id='club'`;
  await sql`update club_staff set email='replacement@example.invalid',name='Replacement'`;
  await sql`update club_staff_services set profit_split=99`;
  await sql`update booking_records set coach_id='replacement-id',ends_at='2026-10-01 14:30Z' where id='lesson'`;
  await sql`update "user" set email='renamed@example.invalid',name='Operational rename' where id='coach'`;
  assert.deepEqual(await projection(sql), before);
  assert.deepEqual(await myFinance(sql, "coach"), mine);
  await sql`insert into "user"(id,email,name,"emailVerified") values('new','coach@example.invalid','New account',true)`;
  await sql`insert into profiles(user_id,email,name,role,family_id) values('new','coach@example.invalid','New account','coach','fam-new')`;
  assert.equal((await myFinance(sql, "new")).rows.length, 0);
  await assert.rejects(
    myPreference(sql, "new", { method: "check", reference: "Other" }),
    /link your financial profile/,
  );
  await myPreference(sql, "coach", {
    method: "check",
    reference: "Mail check; account ending 1234",
  });
  assert.equal(
    (await myFinance(sql, "coach")).profile?.reference,
    "Mail check; account ending 1234",
  );
});

test("earned instructor identity survives legacy operational reassignment; active provider refund and paid ledgers remain live", async () => {
  const { sql } = await fixture();
  await sql`update booking_records set coach_id='replacement-id' where id='lesson'`;
  assert.equal(
    (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson")?.payeeId,
    "coach-payee",
  );
  await activateFutureSchema(sql);
  await sql`insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason,square_payment_id) values('partial','order','lesson','owner',5000,'completed','Partial refund','payment')`;
  await sql`update square_payments set refunded_cents=5000 where id='payment'`;
  const refunded = (await projection(sql)).sources.candidates.find(
    (p) => p.id === "lesson:lesson",
  )!;
  assert.equal(refunded.amount, 4100);
  assert.equal(refunded.earned, 2050);
  await sql`update contractor_earnings set status='paid' where booking_id='lesson'`;
  assert.equal(
    (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson")?.paid,
    4100,
  );
});

test("financial owner writes require current grant/security and commit payee changes to the same active version", async () => {
  const { sql, payee } = await fixture();
  await activateFutureSchema(sql);
  await assert.rejects(financeWorkspace(sql, "operations"), /financial account|owner/i);
  const view = await financeWorkspace(sql, "owner");
  await assert.rejects(
    mutateFinance(sql, "owner", {
      action: "payee",
      value: { ...payee, name: "Financial name" },
      revision: view.revision,
      reason: "Explicit financial update",
    }),
    /Financial basis changed/,
  );
  await mutateFinance(sql, "owner", {
    action: "payee",
    value: { ...payee, name: "Financial name" },
    revision: view.revision,
    basisVersion: view.basisVersion,
    reason: "Explicit financial update",
  });
  const next = await financeWorkspace(sql, "owner");
  assert.equal(next.basisVersion, view.basisVersion! + 1);
  assert.equal((await myFinance(sql, "coach")).profile?.name, "Financial name");
  await mutateFinance(sql, "owner", {
    action: "rule",
    value: {
      id: "new-rule",
      payeeId: "coach-payee",
      serviceId: "lesson-service",
      effectiveFrom: "2026-09-01",
      mode: "fixed",
      value: 1234,
    },
    revision: next.revision,
    basisVersion: next.basisVersion,
    reason: "Explicit reviewed compensation change",
  });
  assert.equal(
    (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson")?.amount,
    1234,
  );
  for (const column of ['"emailVerified"', '"disabledAt"']) {
    await sql.query(
      `update "user" set ${column}=${column === '"emailVerified"' ? "false" : "now()"} where id='coach'`,
    );
    await assert.rejects(myFinance(sql, "coach"), /financial account/i);
    await assert.rejects(
      myPreference(sql, "coach", { method: "check", reference: "Check" }),
      /financial account/i,
    );
    await sql.query(
      `update "user" set ${column}=${column === '"emailVerified"' ? "true" : "null"} where id='coach'`,
    );
  }
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('coach','suspended','owner')`;
  await assert.rejects(myFinance(sql, "coach"), /financial account/i);
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(financeWorkspace(sql, "owner"), /owner/);
});

test("external refund verification releases SQL locks and rechecks current owner access before committing", async () => {
  const f = await fixture();
  await activateFutureSchema(f.sql);
  await f.sql`insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason,square_payment_id,square_refund_id) values('failed','order','lesson','owner',5000,'failed','Provider failure','payment','provider-refund')`;
  const view = await financeWorkspace(f.sql, "owner");
  const provider = {
    refund: async () => {
      assert.equal(f.transactionDepth(), 0);
      await f.sql`update owner_grants set revoked_at=now() where user_id='owner'`;
      return {
        refund: {
          id: "provider-refund",
          paymentId: "payment",
          amountMoney: { currency: "USD", amount: 5000n },
          status: "FAILED",
        },
      };
    },
    payment: async () => {
      assert.equal(f.transactionDepth(), 0);
      return { payment: { id: "payment", amountMoney: { currency: "USD", amount: 10001n } } };
    },
  };
  await assert.rejects(
    mutateFinance(
      f.sql,
      "owner",
      {
        action: "externalRefund",
        refundId: "failed",
        payeeId: "coach-payee",
        due: asOf,
        providerFailureConfirmed: true,
        revision: view.revision,
        basisVersion: view.basisVersion,
        reason: "Confirmed provider failure",
      },
      provider,
    ),
    /owner/,
  );
  const [refund] = await f.sql<any>`select external_status from commerce_refunds where id='failed'`;
  assert.equal(refund.external_status, null);
  assert.equal((await f.sql`select id from finance_records where id='refund:failed'`).length, 0);
});

test("new ordinary lessons bind approved compensation once and completion ignores operational reassignment and current split edits", async () => {
  const { sql, file } = await fixture();
  await activateFutureSchema(sql);
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('new-lesson','order','coach-id','lesson-service','2026-10-02 12:00Z','2026-10-02 13:15Z','[]'::jsonb,'confirmed')`;
  });
  assert.equal(
    (await sql`select booking_id from financial_lesson_bindings where booking_id='new-lesson'`)
      .length,
    1,
  );
  await assert.rejects(
    sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('unknown-lesson','order','unknown','lesson-service','2026-10-03 12:00Z','2026-10-03 13:15Z','[]'::jsonb,'confirmed')`;
    }),
    /financial.*(coach|admission|approved)|approved.*coach/i,
  );
  file.coachPayouts[0].splitPct = 99;
  await sql`update pd_working_file set payload=${JSON.stringify(file)} where id='club'`;
  await sql`update club_staff_services set profit_split=99`;
  await sql`update booking_records set coach_id='replacement-id',ends_at='2026-10-02 14:30Z' where id='new-lesson'`;
  const instructor = await resolveIdentity(sql, "replacement");
  for (let i = 0; i < 2; i++)
    await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await completeSessionInTransaction(
        tx,
        instructor,
        file as any,
        "new-lesson",
        "Completed the approved lesson",
        "hitting",
      );
    });
  const earnings =
    await sql<any>`select coach_id,split_pct,amount_cents from contractor_earnings where booking_id='new-lesson'`;
  assert.equal(earnings.length, 1);
  assert.equal(earnings[0].coach_id, "coach-id");
  assert.equal(Number(earnings[0].split_pct), 41);
  assert.equal(earnings[0].amount_cents, 4100);
  const payable = (await projection(sql)).sources.candidates.find(
    (p) => p.id === "lesson:new-lesson",
  );
  assert.equal(payable?.payeeId, "coach-payee");
  assert.equal(payable?.amount, 4100);
  assert.equal(payable?.due, "2026-10-02");
});

test("operational attendance leaves every financial ledger, payable and refund eligibility unchanged until explicit owner recognition", async () => {
  const { operationalLessonCompletions, recordOperationalLessonCompletion } =
    await import("../pd/operational-lesson.server");
  const { standaloneRefundFunding } = await import("../commerce/refund-funding.server");
  const { parentCancellationRefund } = await import("../commerce/booking-change-policy.server");
  const { sql } = await fixture();
  await sql`update commerce_orders set square_payment_id='payment' where id='order'`;
  await activateFutureSchema(sql);
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('observed-lesson','order','coach-id','lesson-service','2026-10-02 12:00Z','2026-10-02 13:15Z','[]'::jsonb,'confirmed')`;
  });
  const ledgerTables = [
    "commerce_orders",
    "booking_records",
    "contractor_earnings",
    "square_payments",
    "commerce_refunds",
    "credit_grants",
    "credit_uses",
    "finance_state",
    "finance_records",
    "finance_audit",
    "financial_basis_state",
    "financial_basis_versions",
    "financial_lesson_recognitions",
  ];
  const financialSnapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        ledgerTables.map(async (table) => [
          table,
          await sql.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`),
        ]),
      ),
    );
  const refundPreview = async () => {
    const [order] = await sql<any>`select * from commerce_orders where id='order'`;
    const [booking] =
      await sql<any>`select status,starts_at,ends_at,checked_in_at from booking_records where id='observed-lesson'`;
    return {
      booking,
      funding: await standaloneRefundFunding(sql, order, 0.5),
      cancellation: parentCancellationRefund(
        order.total_cents,
        new Date(booking.starts_at),
        true,
        new Date("2026-10-02T01:00:00Z"),
      ),
    };
  };
  const before = await financialSnapshot(),
    refunds = await refundPreview(),
    finance = await financeWorkspace(sql, "owner");
  const list = await operationalLessonCompletions(sql, "operations");
  assert.equal(list.canRecord, true);
  const selected = list.lessons.find((r) => r.id === "observed-lesson")!;
  assert.ok(selected);
  const request = {
    bookingId: selected.id,
    expectedEndsAt: selected.endsAt,
    attendance: "present" as const,
    recap: "Verified attendance and reviewed the completed hitting lesson.",
    qualifiedReview: true as const,
  };
  await recordOperationalLessonCompletion(sql, "operations", request);
  await recordOperationalLessonCompletion(sql, "operations", request);
  assert.deepEqual(await financialSnapshot(), before);
  assert.deepEqual(await refundPreview(), refunds);
  assert.deepEqual((await financeWorkspace(sql, "owner")).summary, finance.summary);
  assert.equal((await sql`select booking_id from operational_lesson_completions`).length, 1);
  await assert.rejects(
    recordOperationalLessonCompletion(sql, "operations", { ...request, amount: 5000 } as any),
    /Unrecognized key/,
  );
  await assert.rejects(
    mutateFinance(sql, "operations", {
      action: "recognizeLesson",
      bookingId: selected.id,
      revision: finance.revision,
      basisVersion: finance.basisVersion,
      reason: "Forbidden financial recognition",
    }),
    /financial account|owner/i,
  );
  await sql`update square_payments set refunded_cents=10001 where id='payment'`;
  await assert.rejects(
    mutateFinance(sql, "owner", {
      action: "recognizeLesson",
      bookingId: selected.id,
      revision: finance.revision,
      basisVersion: finance.basisVersion,
      reason: "Review already returned funding",
    }),
    /paid funding/,
  );
  assert.equal((await sql`select booking_id from financial_lesson_recognitions`).length, 0);
  await sql`update square_payments set refunded_cents=0 where id='payment'`;
  await sql`update booking_records set coach_id='replacement-id' where id=${selected.id}`;
  await mutateFinance(sql, "owner", {
    action: "recognizeLesson",
    bookingId: selected.id,
    revision: finance.revision,
    basisVersion: finance.basisVersion,
    reason: "Owner reviewed attendance and current verified funding",
  });
  const [earning] =
    await sql<any>`select coach_id,amount_cents from contractor_earnings where booking_id=${selected.id}`;
  assert.equal(earning.coach_id, "coach-id");
  assert.equal(earning.amount_cents, 4100);
  assert.equal((await sql`select booking_id from financial_lesson_recognitions`).length, 1);
  const after = await financeWorkspace(sql, "owner"),
    once = await financialSnapshot();
  await mutateFinance(sql, "owner", {
    action: "recognizeLesson",
    bookingId: selected.id,
    revision: after.revision,
    basisVersion: after.basisVersion,
    reason: "Idempotent reviewed recognition retry",
  });
  assert.deepEqual(await financialSnapshot(), once);
  await sql`update organization_operational_access set status='suspended' where user_id='operations'`;
  await assert.rejects(
    recordOperationalLessonCompletion(sql, "operations", request),
    /not authorized/,
  );
});

test("existing owner service/staff/person writers approve only future terms with version checks and original booking compensation intact", async () => {
  const { saveServiceFor, saveStaffFor, deleteStaffFor, deleteServiceFor } =
    await import("../ops-owner.server");
  const { loadServices } = await import("../ops");
  const { personFor, savePersonFor } = await import("../person.server");
  const { loadFinancialLessonsInTransaction } = await import("./context.server");
  const { sql } = await fixture();
  await sql`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('captured-unfinished','order','coach-id','lesson-service','2026-10-03 12:00Z','2026-10-03 13:15Z','[]'::jsonb,'confirmed')`;
  await activateFutureSchema(sql);
  const original = (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson");
  const version = async () =>
    (await sql<{ current_version: number }>`select current_version from financial_basis_state`)[0]
      .current_version;
  const staff = {
    id: "staff",
    name: "coach",
    email: "coach@example.invalid",
    phone: "",
    role: "coach" as const,
    access_notes: "",
    active: true,
    offerings: [{ serviceId: "lesson-service", profitSplit: 62 }],
  };
  await assert.rejects(saveStaffFor(sql, "owner", staff), /version|reload|changed/i);
  await assert.rejects(
    saveStaffFor(sql, "operations", { ...staff, basisVersion: await version() }),
    /financial account|owner/i,
  );
  assert.equal(
    Number(
      (await sql<any>`select profit_split from club_staff_services where staff_id='staff'`)[0]
        .profit_split,
    ),
    41,
  );
  await saveStaffFor(sql, "owner", { ...staff, basisVersion: await version() });
  assert.equal(await version(), 2);
  assert.deepEqual(
    (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson"),
    original,
  );
  await assert.rejects(
    saveStaffFor(sql, "owner", {
      ...staff,
      basisVersion: 1,
      offerings: [{ serviceId: "lesson-service", profitSplit: 99 }],
    }),
    /version|reload|changed/i,
  );
  assert.equal(
    Number(
      (await sql<any>`select profit_split from club_staff_services where staff_id='staff'`)[0]
        .profit_split,
    ),
    62,
  );
  const addBooking = async (id: string) =>
    sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${id},'order','coach-id','lesson-service','2026-10-04 12:00Z','2026-10-04 13:15Z','[]'::jsonb,'confirmed')`;
    });
  await addBooking("after-staff");
  assert.equal(
    (
      await sql<any>`select approved_terms from financial_lesson_bindings where booking_id='after-staff'`
    )[0].approved_terms.splitPct,
    62,
  );
  await withFinancialContext(sql, "owner", "owner", async (tx, ctx) => {
    const lessons = await loadFinancialLessonsInTransaction(
      tx,
      ["captured-unfinished", "after-staff"],
      ctx,
    );
    const old = lessons.get("captured-unfinished")!;
    assert.equal(old.mode, "basis");
    if (old.mode === "basis")
      assert.equal(
        old.compensation.staffServices.find((s) => s.staff_id === "staff")?.profit_split,
        41,
      );
  });
  const person = (await personFor(sql, "coach")).value;
  await savePersonFor(sql, "owner", {
    ...person,
    basisVersion: await version(),
    reviewedSources: true,
    publishCoach: false,
    publishInstructor: false,
    instructor: true,
    offerings: [{ serviceId: "lesson-service", profitSplit: 73 }],
  });
  await addBooking("after-person");
  assert.equal(
    (
      await sql<any>`select approved_terms from financial_lesson_bindings where booking_id='after-person'`
    )[0].approved_terms.splitPct,
    73,
  );
  assert.equal(
    (
      await sql<any>`select approved_terms from financial_lesson_bindings where booking_id='after-staff'`
    )[0].approved_terms.splitPct,
    62,
  );
  const service = (await loadServices(sql)).find((s) => s.id === "lesson-service")!;
  await saveServiceFor(sql, "owner", {
    ...service,
    price: 125,
    minutes: 90,
    basisVersion: await version(),
  });
  assert.equal(
    Number(
      (await sql<any>`select total_cents from commerce_orders where id='order'`)[0].total_cents,
    ),
    10001,
  );
  await saveServiceFor(sql, "owner", {
    ...service,
    price: 125,
    active: false,
    basisVersion: await version(),
  });
  await assert.rejects(addBooking("archived-service"), /service|approved|inactive/i);
  await saveServiceFor(sql, "owner", {
    ...service,
    price: 125,
    active: true,
    basisVersion: await version(),
  });
  await deleteStaffFor(sql, "owner", { id: "staff", basisVersion: await version() });
  await assert.rejects(addBooking("inactive-staff"), /instructor|approved|inactive/i);
  await deleteServiceFor(sql, "owner", { id: "lesson-service", basisVersion: await version() });
  assert.equal((await sql`select id from club_services where id='lesson-service'`).length, 0);
  assert.equal(
    (await sql`select booking_id from financial_lesson_bindings where booking_id='after-person'`)
      .length,
    1,
  );
  assert.deepEqual(
    (await projection(sql)).sources.candidates.find((p) => p.id === "lesson:lesson"),
    original,
  );
});

test("transaction finance reads match public projections at a fixed asOf without accrual writes", async (t) => {
  const { sql, transactionDepth } = await fixture();
  t.mock.timers.enable({ apis: ["Date"], now: new Date(asOf + "T12:00:00Z") });
  for (const mode of ["legacy", "captured", "basis"] as const) {
    if (mode === "captured") {
      const preview = await previewFinancialBasisInitialization(sql, "owner");
      await initializeFinancialBasisForOwner(sql, "owner", {
        ...preview,
        reason: "Fixed date adapter fixture",
      });
    }
    if (mode === "basis") {
      await sql.query(
        "alter table financial_basis_state drop constraint financial_basis_state_activation_state_check, drop constraint financial_basis_state_active_version_check",
      );
      await sql`update financial_basis_state set activation_state='active',active_version=current_version`;
    }
    t.mock.timers.setTime(new Date(asOf + "T12:00:00Z").valueOf());
    const expected = await financeWorkspace(sql, "owner");
    const before = await records(sql);
    const beforeEarnings = await sql`select * from contractor_earnings order by booking_id`;
    await withFinancialContext(sql, "owner", "owner", async (tx, context) => {
      const original = structuredClone(context);
      assert.equal(transactionDepth(), 1);
      assert.deepEqual(await financeWorkspaceInTransaction(tx, context, asOf), expected);
      t.mock.timers.setTime(new Date("2026-11-02T12:00:00Z").valueOf());
      assert.deepEqual(await financeWorkspaceInTransaction(tx, context, asOf), expected);
      assert.deepEqual(context, original);
      assert.deepEqual(await records(tx), before);
      assert.deepEqual(
        await tx`select * from contractor_earnings order by booking_id`,
        beforeEarnings,
      );
      context.principal.owner = false;
      context.club.teams = [];
      context.feePlans = [];
      assert.deepEqual(
        await financeWorkspaceInTransaction(tx, context, asOf),
        expected,
        "Projection uses the issued original source",
      );
      assert.equal(transactionDepth(), 1);
    });
    assert.notDeepEqual(
      await financeWorkspace(sql, "owner"),
      expected,
      mode + " fixture exercises date-sensitive accruals",
    );
  }
});

test("transaction finance reads cannot elevate read-only or forged contexts", async () => {
  const { sql } = await fixture();
  for (const basis of [false, true]) {
    if (basis) await activateFutureSchema(sql);
    await withFinancialContext(sql, "owner", "owner", async (tx, context) => {
      await assert.rejects(
        () => financeWorkspaceInTransaction(tx, structuredClone(context), asOf),
        /context from this transaction/,
      );
      await assert.rejects(
        () => financeWorkspaceInTransaction(sql, context, asOf),
        /context from this transaction/,
      );
      await assert.rejects(
        () => financeWorkspaceInTransaction(tx, context, "2026-02-30"),
        /valid date/,
      );
      await tx`update owner_grants set revoked_at=now() where user_id='owner'`;
      await assert.rejects(() => financeWorkspaceInTransaction(tx, context, asOf), /owner access/);
      await tx`update owner_grants set revoked_at=null where user_id='owner'`;
    });
    await withFinancialContext(sql, "coach", "read", async (tx, context) => {
      context.principal.owner = true;
      context.principal.role = "admin";
      await assert.rejects(() => financeWorkspaceInTransaction(tx, context, asOf), /owner access/);
    });
  }
});
