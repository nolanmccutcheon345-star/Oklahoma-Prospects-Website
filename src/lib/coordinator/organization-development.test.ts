import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { chicagoDate } from "../scheduling";
import { trainingDrills } from "../pd/training-catalog";
import { dayInput } from "../coaching-contracts";
import {
  organizationDevelopment,
  saveOrganizationDevelopmentProfile,
  saveOrganizationDevelopmentMetric,
  assignOrganizationDevelopmentDay,
  reviewOrganizationDevelopmentCurriculum,
} from "./organization-development.server";
import {
  organizationDevelopmentProfileInput,
  organizationDevelopmentMetricInput,
  organizationDevelopmentDayInput,
  organizationDevelopmentCurriculumInput,
  type OrganizationDevelopmentProfileInput,
  type OrganizationDevelopmentMetricInput,
  type OrganizationDevelopmentDayInput,
  type OrganizationDevelopmentCurriculumInput,
} from "./organization-development-contracts";

const SECRET = "WITHHELD-FINANCE-MEDICAL-COACH-NARRATIVE";
const AMOUNT = 918273;
type Trace = { statement: string; rows: unknown; transaction: boolean };
async function fixture() {
  const db = new PGlite();
  for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${f}`, "utf8"));
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
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )) as Sql;
    sql.query = execute as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"], true)));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const id of ["sara", "steve", "parent", "fake-owner"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id.includes("owner") || id === "steve" ? "admin" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  for (const [id, sport] of [
    ["base", "baseball"],
    ["soft", "softball"],
    ["no-file", "baseball"],
    ["young", "baseball"],
    ["no-age", "baseball"],
  ])
    await sql`insert into club_athletes(id,name,user_id,household_email,birth_date,coach_ids,profile) values(${id},${"Synthetic " + id},'parent',${SECRET + "@example.invalid"},${id === "no-age" ? null : id === "young" ? "2024-01-01" : "2010-01-01"}::date,'["private-instructor"]'::jsonb,${JSON.stringify({ sport, privateFinancialFuture: SECRET })}::jsonb)`;
  const athletes = ["base", "soft"].map((id) => ({
    id,
    firstName: "Synthetic",
    lastName: id,
    sport: id === "base" ? "baseball" : "softball",
    position: "P",
    throws: "R",
    bats: "R",
    graduationYear: 2029,
    school: "Synthetic School",
    city: "Tulsa",
    familyId: SECRET,
    coachIds: [SECRET],
    notes: SECRET,
    frame: { health: SECRET },
    financialFuture: { amount: AMOUNT, memo: SECRET },
  }));
  const file = {
    revision: 3,
    athletes,
    velocity: [
      {
        id: "velocity-base",
        athleteId: "base",
        date: "2026-01-02",
        mph: 70,
        privateFinancialFuture: SECRET,
      },
    ],
    metrics: [
      {
        id: "spin-base",
        athleteId: "base",
        name: "Spin",
        value: "1800 rpm",
        date: "2026-01-02",
        notes: SECRET,
      },
      { id: "secret-metric", athleteId: "base", name: SECRET, value: SECRET, date: "2026-01-02" },
      { id: "secret-value", athleteId: "soft", name: "Spin", value: SECRET, date: "2026-01-02" },
    ],
    families: [{ id: SECRET, plan: { price: AMOUNT } }],
    packages: [{ price: AMOUNT }],
    bookings: [{ payout: SECRET, price: AMOUNT }],
    coachPayouts: [{ split: AMOUNT }],
    settings: { price: AMOUNT },
    intake: [{ athleteId: "base", health: SECRET }],
    documents: [{ athleteId: "base", name: SECRET }],
    messages: [{ body: SECRET }],
    outings: [],
  };
  await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},3)`;
  await sql`insert into athlete_session_metrics(id,athlete_id,user_id,track,day,successes,attempts,notes,verified) values('session-base','base','steve','Pitching','2026-01-02',8,10,${SECRET},true)`;
  await sql`insert into athlete_training_days(athlete_id,day,coach_user_id,focus,game_notes,items) values('base','2026-01-02','steve',${SECRET},${SECRET},${JSON.stringify([{ id: "historic-item", name: SECRET, track: "Hitting", sets: 2, reps: "10", instructions: SECRET, videoUrl: SECRET, privateFinancialFuture: { amount: AMOUNT } }])}::jsonb)`;
  await sql`insert into training_assignments(id,athlete_id,created_by,status,document) values('historical-home','base','steve','active',${JSON.stringify({ sport: "baseball", discipline: "Hitting", startDate: "2026-01-02", reviewDate: "2026-01-10", phase: 0, title: SECRET, goal: SECRET, evidence: [{ text: SECRET }], workloadSnapshot: { health: SECRET }, program: { price: AMOUNT }, tasks: [{ id: "task-1", drillId: "training-hitting-1", date: "2026-01-02", phase: 0, dose: SECRET, rest: SECRET, target: SECRET, financialFuture: AMOUNT }] })}::jsonb)`;
  await sql`insert into athlete_assessments(id,athlete_id,discipline,coach_user_id,completed_at,notes) values('gated-assessment','base','Pitching','steve',now(),${SECRET})`;
  await sql`insert into finance_records(id,kind,payload) values('development-finance','expense',${JSON.stringify({ amount: AMOUNT, memo: SECRET })}::jsonb)`;
  return {
    db,
    sql,
    trace,
    capture: (value: boolean) => {
      capture = value;
      if (value) trace.length = 0;
    },
  };
}
function privateAbsent(value: unknown) {
  assert.doesNotMatch(
    JSON.stringify(value),
    new RegExp(
      `${SECRET}|${AMOUNT}|"(?:household_email|coach_ids|familyId|coachIds|financialFuture|privateFinancialFuture|evidence|workloadSnapshot|notes|game_notes|review_note|price|payout|credits|packages|settings)"`,
    ),
  );
}
async function protectedSnapshot(sql: Sql) {
  const out: Record<string, unknown> = {};
  const tables = await sql<{
    tablename: string;
  }>`select tablename from pg_tables where schemaname='public' order by tablename`;
  for (const { tablename } of tables.filter((t) =>
    /^(commerce_|finance_|financial_|team_fee_|team_budget_|billing_|club_subscription|customer_payment_|fundraising_|square_|credit_|booking_|club_staff_services|service_resources|athlete_assessments|guided_lesson_sessions|contractor_earnings)/.test(
      t.tablename,
    ),
  )) {
    assert.match(tablename, /^[a-z_]+$/);
    out[tablename] = await sql.query(
      `select to_jsonb(t)::text as row from "${tablename}" t order by to_jsonb(t)::text`,
    );
  }
  out.athletes = await sql`select to_jsonb(a)::text as row from club_athletes a order by id`;
  out.club = await sql`select to_jsonb(c)::text as row from club_state c order by id`;
  out.catalog = await sql`select to_jsonb(s)::text as row from club_services s order by id`;
  out.staff = await sql`select to_jsonb(s)::text as row from club_staff s order by id`;
  out.households = await sql`select to_jsonb(h)::text as row from club_households h order by id`;
  out.access = await sql`select to_jsonb(p)::text as row from profiles p order by user_id`;
  out.owners = await sql`select to_jsonb(g)::text as row from owner_grants g order by email`;
  out.file =
    await sql`select (payload::jsonb-'revision'-'athletes'-'velocity'-'metrics')::text as protected from pd_working_file where id='club'`;
  out.playerProtected =
    await sql`select (a-'position'-'throws'-'bats'-'graduationYear'-'school'-'city')::text as row from pd_working_file w cross join lateral jsonb_array_elements(w.payload::jsonb->'athletes') a order by a->>'id'`;
  out.oldDay =
    await sql`select to_jsonb(d)::text as row from athlete_training_days d where day='2026-01-02' order by athlete_id`;
  out.training = await sql`select to_jsonb(a)::text as row from training_assignments a order by id`;
  return out;
}
const profile = (revision: number): OrganizationDevelopmentProfileInput => ({
  athleteId: "base",
  revision,
  position: "C",
  throws: "R",
  bats: "L",
  graduationYear: 2029,
  school: "Updated School",
  city: "Tulsa",
});
const metric = (revision: number): OrganizationDevelopmentMetricInput => ({
  id: "velocity-base",
  athleteId: "base",
  revision,
  kind: "velocity",
  date: "2026-01-03",
  value: 71,
});
const plan = (athleteId = "base", day = chicagoDate()): OrganizationDevelopmentDayInput => ({
  athleteId,
  day,
  skill: "beginner",
  qualifiedReview: true,
  items: [
    {
      id: randomUUID(),
      drillId: "training-hitting-1",
      version: trainingDrills.find((d) => d.id === "training-hitting-1")!.version,
      restSeconds: 60,
      sets: 2,
      reps: 10,
    },
  ],
});

test("operational development projects structured data, preserves finance, and rejects privilege changes", async (t) => {
  const f = await fixture();
  const { sql, db } = f;
  try {
    const first = await organizationDevelopment(sql, "sara");
    const d = first.curriculum.drills.find((d) => d.id === "training-hitting-1")!;
    const review = (revision = 0): OrganizationDevelopmentCurriculumInput => ({
      kind: "drill",
      id: d.id,
      version: d.version,
      revision,
      status: "approved",
      recommended: true,
      reason: "Qualified review of the published instruction.",
      qualifiedReview: true,
    });
    await t.test(
      "same-transaction authority and strict nested projections with owner parity",
      async () => {
        f.capture(true);
        const value = await organizationDevelopment(sql, "sara");
        f.capture(false);
        privateAbsent(value);
        privateAbsent(f.trace.map((t) => t.rows));
        assert.equal(value.athletes.length, 5);
        assert.deepEqual(value.metrics.map((m) => m.kind).sort(), ["spin", "velocity"]);
        assert.equal(value.days[0].items[0].sets, 2);
        assert.equal(value.sessionMetrics[0].successes, 8);
        assert.deepEqual(
          Object.keys(value.assignments[0].tasks[0]).sort(),
          ["id", "drillId", "date", "phase"].sort(),
        );
        assert.deepEqual(
          Object.keys(value.days[0].items[0]).sort(),
          ["id", "track", "sets", "reps"].sort(),
        );
        assert.ok(f.trace.every((t) => t.transaction));
        assert.ok(
          f.trace.findIndex((t) => /organization_operational_access/.test(t.statement)) <
            f.trace.findIndex((t) => /pd_working_file/.test(t.statement)),
        );
        assert.deepEqual(value, await organizationDevelopment(sql, "steve"));
        assert.equal(value.athletes.find((a) => a.athleteId === "no-file")?.profileEditable, false);
      },
    );
    await t.test(
      "granular profile and metrics preserve all protected financial identities/values",
      async () => {
        const before = await protectedSnapshot(sql);
        f.capture(true);
        const p = await saveOrganizationDevelopmentProfile(sql, "sara", profile(3));
        const m = await saveOrganizationDevelopmentMetric(sql, "sara", metric(p.revision));
        const n = await saveOrganizationDevelopmentMetric(sql, "sara", {
          ...metric(m.revision),
          id: randomUUID(),
          athleteId: "soft",
          kind: "hb",
          value: -12,
        });
        const updated = await saveOrganizationDevelopmentMetric(sql, "sara", {
          ...metric(n.revision),
          id: "spin-base",
          kind: "spin",
          value: 1900,
        });
        await reviewOrganizationDevelopmentCurriculum(sql, "sara", review());
        await assignOrganizationDevelopmentDay(sql, "sara", plan("base"));
        await assignOrganizationDevelopmentDay(sql, "sara", plan("soft"));
        f.capture(false);
        privateAbsent(f.trace.map((t) => t.rows));
        assert.ok(f.trace.every((t) => t.transaction));
        assert.deepEqual(await protectedSnapshot(sql), before);
        const value = await organizationDevelopment(sql, "sara");
        privateAbsent(value);
        assert.equal(value.revision, updated.revision);
        assert.equal(value.athletes.find((a) => a.athleteId === "base")?.position, "C");
        assert.equal(value.metrics.find((m) => m.id === "velocity-base")?.value, 71);
        const [row] = await sql<{
          payload: Record<string, unknown>;
        }>`select payload::jsonb as payload from pd_working_file where id='club'`;
        assert.equal(
          (row.payload.velocity as Record<string, unknown>[])[0].privateFinancialFuture,
          SECRET,
        );
        assert.equal((row.payload.metrics as Record<string, unknown>[])[0].notes, SECRET);
        const [day] = await sql<{
          coach_user_id: string;
          items: Record<string, unknown>[];
        }>`select coach_user_id,items from athlete_training_days where athlete_id='base' and day=${chicagoDate()}::date`;
        assert.equal(day.coach_user_id, "sara");
        assert.equal(day.items[0].name, d.name);
        assert.equal(day.items[0].reps, "10");
        assert.match(String(day.items[0].instructions), /Reviewed rest between sets: 60 seconds/);
        assert.equal(
          dayInput.safeParse({
            athleteId: "base",
            day: chicagoDate(),
            focus: "Hitting",
            gameNotes: "",
            items: day.items,
          }).success,
          true,
        );
      },
    );
    await t.test(
      "revision and historical ownership conflicts never overwrite private records",
      async () => {
        await assert.rejects(
          () => saveOrganizationDevelopmentProfile(sql, "sara", profile(3)),
          /changed/,
        );
        await assert.rejects(
          () => saveOrganizationDevelopmentMetric(sql, "sara", metric(3)),
          /changed/,
        );
        await assert.rejects(
          () => reviewOrganizationDevelopmentCurriculum(sql, "sara", review()),
          /changed/,
        );
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan()),
          /already has a plan/,
        );
        const current = await organizationDevelopment(sql, "sara");
        await assert.rejects(
          () =>
            saveOrganizationDevelopmentProfile(sql, "sara", {
              ...profile(current.revision),
              athleteId: "no-file",
            }),
          /not authorized/,
        );
        await assert.rejects(
          () =>
            saveOrganizationDevelopmentMetric(sql, "sara", {
              ...metric(current.revision),
              athleteId: "soft",
            }),
          /not authorized/,
        );
        await assert.rejects(
          () =>
            saveOrganizationDevelopmentMetric(sql, "sara", {
              ...metric(current.revision),
              id: "secret-value",
              athleteId: "soft",
              kind: "hb",
            }),
          /not authorized/,
        );
      },
    );
    await t.test(
      "invalid historical metric content and malformed collections stay preserved",
      async () => {
        const current = await organizationDevelopment(sql, "sara");
        await assert.rejects(
          () =>
            saveOrganizationDevelopmentMetric(sql, "sara", {
              ...metric(current.revision),
              id: "secret-value",
              athleteId: "soft",
              kind: "spin",
            }),
          /not authorized/,
        );
        const [before] = await sql<{
          payload: string;
        }>`select payload from pd_working_file where id='club'`;
        await sql`update pd_working_file set payload=jsonb_set(payload::jsonb,'{velocity}',${JSON.stringify({ privateFinancialFuture: SECRET })}::jsonb)::text where id='club'`;
        await assert.rejects(
          () =>
            saveOrganizationDevelopmentMetric(sql, "sara", {
              ...metric(current.revision),
              id: randomUUID(),
            }),
          /not authorized/,
        );
        await sql`update pd_working_file set payload=${before.payload} where id='club'`;
      },
    );
    await t.test(
      "strict request bodies reject unknown financial, authority and nested fields",
      async () => {
        const current = await organizationDevelopment(sql, "sara");
        for (const payload of [
          { ...profile(current.revision), coachIds: ["changed"] },
          { ...profile(current.revision), role: "admin" },
          { ...profile(current.revision), price: 1 },
          { ...profile(current.revision), assessmentComplete: true },
        ]) {
          assert.equal(organizationDevelopmentProfileInput.safeParse(payload).success, false);
          await assert.rejects(() => saveOrganizationDevelopmentProfile(sql, "sara", payload));
        }
        const forgedMetric = { ...metric(current.revision), payout: "paid" };
        assert.equal(organizationDevelopmentMetricInput.safeParse(forgedMetric).success, false);
        await assert.rejects(() => saveOrganizationDevelopmentMetric(sql, "sara", forgedMetric));
        const p = plan("base", "2030-01-04"),
          forgedPlan = { ...p, items: [{ ...p.items[0], credits: 100 }] };
        assert.equal(organizationDevelopmentDayInput.safeParse(forgedPlan).success, false);
        await assert.rejects(() => assignOrganizationDevelopmentDay(sql, "sara", forgedPlan));
        const forgedReview = { ...review(1), reviewed_by: "steve" };
        assert.equal(organizationDevelopmentCurriculumInput.safeParse(forgedReview).success, false);
        await assert.rejects(() =>
          reviewOrganizationDevelopmentCurriculum(sql, "sara", forgedReview),
        );
        assert.equal(
          organizationDevelopmentMetricInput.safeParse({ ...metric(current.revision), value: 1000 })
            .success,
          false,
        );
      },
    );
    await t.test(
      "new-day prescriptions enforce latest safety state, retirement, age and recorded sport",
      async () => {
        await organizationDevelopment(sql, "sara");
        await sql`update training_assignments set status='paused' where id='historical-home'`;
        f.capture(true);
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan("base", "2030-01-04")),
          /protected coaching/,
        );
        f.capture(false);
        const lock = f.trace.findIndex((t) => /from club_athletes.*for update/s.test(t.statement));
        const hold = f.trace.findIndex((t) => /status='paused'/.test(t.statement));
        assert.ok(lock >= 0 && hold > lock);
        assert.ok(
          f.trace
            .filter((t) => /club_athletes|training_assignments/.test(t.statement))
            .every((t) => t.transaction),
        );
        await sql`update training_assignments set status='active' where id='historical-home'`;
        await reviewOrganizationDevelopmentCurriculum(sql, "sara", {
          ...review(1),
          status: "retired",
          recommended: false,
        });
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan("soft", "2030-01-04")),
          /retired/,
        );
        await reviewOrganizationDevelopmentCurriculum(sql, "sara", review(2));
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan("young")),
          /five or older/,
        );
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan("no-age")),
          /birthday/,
        );
        const softballOnly = first.curriculum.drills.find(
          (d) => d.sports.length === 1 && d.sports[0] === "softball",
        );
        if (softballOnly)
          await assert.rejects(
            () =>
              assignOrganizationDevelopmentDay(sql, "sara", {
                ...plan("base", "2030-01-04"),
                items: [
                  {
                    id: randomUUID(),
                    drillId: softballOnly.id,
                    version: softballOnly.version,
                    restSeconds: 60,
                    sets: 2,
                    reps: 10,
                  },
                ],
              }),
            /recorded age or sport/,
          );
        await assert.rejects(
          () =>
            assignOrganizationDevelopmentDay(sql, "sara", {
              ...plan("base", "2030-01-04"),
              items: [
                {
                  id: randomUUID(),
                  drillId: "private-custom-draft",
                  version: "unknown",
                  restSeconds: 60,
                  sets: 2,
                  reps: 10,
                },
              ],
            }),
          /recorded age or sport/,
        );
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", plan("base", "2026-02-30")),
          /Invalid date/,
        );
      },
    );
    await t.test(
      "baseball rest, reviewed skill and content version are authoritative without private details",
      async () => {
        const today = chicagoDate();
        const addDays = (n: number) =>
          new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
        const baseball = first.curriculum.drills.find(
          (d) =>
            d.discipline === "Pitching" &&
            d.sports.length === 1 &&
            d.sports[0] === "baseball" &&
            d.minimumSkill === 0,
        )!;
        const softball = first.curriculum.drills.find(
          (d) =>
            d.discipline === "Pitching" &&
            d.sports.length === 1 &&
            d.sports[0] === "softball" &&
            d.minimumSkill === 0,
        )!;
        const make = (
          athleteId: string,
          day: string,
          drill = baseball,
        ): OrganizationDevelopmentDayInput => ({
          ...plan(athleteId, day),
          items: [
            {
              id: randomUUID(),
              drillId: drill.id,
              version: drill.version,
              sets: 2,
              reps: 10,
              restSeconds: 90,
            },
          ],
        });
        await sql`update pd_working_file set payload=jsonb_set(payload::jsonb,'{outings}',${JSON.stringify(
          [
            { id: "game-base", athleteId: "no-file", date: today, pitches: 95, notes: SECRET },
            { id: "game-soft", athleteId: "soft", date: today, pitches: 95, notes: SECRET },
          ],
        )}::jsonb)::text where id='club'`;
        f.capture(true);
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", make("no-file", today)),
          /protected coaching/,
        );
        f.capture(false);
        privateAbsent(f.trace.map((t) => t.rows));
        const fileLock = f.trace.findIndex((t) => /pd_working_file.*for share/s.test(t.statement));
        const athleteLock = f.trace.findIndex((t) =>
          /club_athletes.*for update/s.test(t.statement),
        );
        assert.ok(fileLock >= 0 && athleteLock > fileLock);
        await assert.rejects(
          () => assignOrganizationDevelopmentDay(sql, "sara", make("no-file", addDays(4))),
          /protected coaching/,
        );
        await assignOrganizationDevelopmentDay(sql, "sara", make("no-file", addDays(5)));
        await assignOrganizationDevelopmentDay(sql, "sara", make("soft", addDays(1), softball));
        const future = make("no-file", addDays(6));
        await assert.rejects(
          () =>
            assignOrganizationDevelopmentDay(sql, "sara", {
              ...future,
              items: [{ ...future.items[0], version: "stale-version" }],
            }),
          /content changed/,
        );
        const advanced = first.curriculum.drills.find(
          (d) => d.minimumSkill > 0 && d.minAge <= 16 && d.sports.includes("baseball"),
        )!;
        await assert.rejects(
          () =>
            assignOrganizationDevelopmentDay(sql, "sara", make("no-file", addDays(6), advanced)),
          /reviewed skill/,
        );
        const missingRest = { ...future, items: [{ ...future.items[0], restSeconds: 0 }] };
        assert.equal(organizationDevelopmentDayInput.safeParse(missingRest).success, false);
        await assert.rejects(() => assignOrganizationDevelopmentDay(sql, "sara", missingRest));
      },
    );
    await t.test(
      "fake owner, parent, disabled, unverified and revoked identities denied for every endpoint",
      async () => {
        const attempt = async (id: string) => {
          const revision = (
            await sql<{ revision: number }>`select revision from pd_working_file where id='club'`
          )[0].revision;
          await assert.rejects(() => organizationDevelopment(sql, id), /not authorized/);
          await assert.rejects(
            () => saveOrganizationDevelopmentProfile(sql, id, profile(revision)),
            /not authorized/,
          );
          await assert.rejects(
            () => saveOrganizationDevelopmentMetric(sql, id, metric(revision)),
            /not authorized/,
          );
          await assert.rejects(
            () => assignOrganizationDevelopmentDay(sql, id, plan("soft", "2030-01-04")),
            /not authorized/,
          );
          await assert.rejects(
            () => reviewOrganizationDevelopmentCurriculum(sql, id, review(3)),
            /not authorized/,
          );
        };
        await attempt("parent");
        await attempt("fake-owner");
        await sql`update "user" set "disabledAt"=now() where id='sara'`;
        await attempt("sara");
        await sql`update "user" set "disabledAt"=null,"emailVerified"=false where id='sara'`;
        await attempt("sara");
        await sql`update "user" set "emailVerified"=true where id='sara'`;
        for (const status of ["suspended", "removed"]) {
          await sql`update organization_operational_access set status=${status} where user_id='sara'`;
          await attempt("sara");
        }
        const [account] = await sql`select role from profiles where user_id='sara'`;
        assert.equal(account.role, "parent");
        const [allowed] = await sql<{
          count: number;
        }>`select count(*)::int as count from coordinator_audit where actor_id='sara' and result='allowed' and action like 'organization.development.%'`;
        assert.ok(allowed.count >= 7);
      },
    );
  } finally {
    await db.close();
  }
});

test("operational transport opts in explicitly and never calls legacy aggregate or identity savers", async () => {
  const api = await readFile("src/lib/coordinator/organization-development-api.ts", "utf8");
  assert.equal((api.match(/operationalAuthMiddleware\]/g) || []).length, 5);
  const server = await readFile("src/lib/coordinator/organization-development.server.ts", "utf8");
  assert.doesNotMatch(
    server,
    /\b(readWorkingFile|writeWorkingFile|resolveIdentity|saveDeskForUser|assignTrainingForUser|loadDeskForUser)\s*\(/,
  );
  assert.equal(
    (server.match(/await requireOrganizationOperations\(tx, userId\)/g) || []).length,
    5,
  );
  assert.doesNotMatch(server, /select\s+\*/i);
});
