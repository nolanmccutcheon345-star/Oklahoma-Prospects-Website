import test from "node:test";
import assert from "node:assert/strict";
import { auditHarness } from "./audit-support.mjs";

test("booking-bound templates, drafts, completion, privacy and financial preservation", async (t) => {
  const h = await auditHarness(),
    { api, sql } = h;
  try {
    for (const [id, role] of [
      ["instructor", "coach"],
      ["other", "coach"],
      ["parent", "parent"],
      ["unrelated", "parent"],
      ["admin", "admin"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${id},${id + "@audit.example.invalid"},true,now(),now())`;
      await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@audit.example.invalid"},${role},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(user_id,email) values('admin','admin@audit.example.invalid')`;
    await sql`insert into club_households(id,primary_email) values('family','parent@audit.example.invalid')`;
    await sql`insert into club_athletes(id,user_id,household_id,household_email,name,birth_date,profile) values('player','parent','family','parent@audit.example.invalid','Pitcher Taking Hitting','2014-03-01','{"sport":"baseball","sports":["baseball","softball"]}'::jsonb)`;
    await sql`insert into club_staff(id,name,email,role,active) values('staff','Instructor','instructor@audit.example.invalid','coach',true)`;
    const file = api.emptyDevelopment();
    file.coaches = [
      {
        id: "instructor-id",
        name: "Instructor",
        email: "instructor@audit.example.invalid",
        active: true,
        specialties: ["Pitching", "Hitting"],
      },
      {
        id: "other-id",
        name: "Other",
        email: "other@audit.example.invalid",
        active: true,
        specialties: [],
      },
    ];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;
    const services =
      await sql`select * from club_services where kind='lesson' and active and id<>'s5'`;
    await t.test(
      "all currently seeded in-person service/sport/duration templates validate timing and order",
      () => {
        for (const service of services)
          for (const sport of ["baseball", "softball"]) {
            const template = api.resolveTemplate(
              sport,
              api.disciplineFor(service.discipline),
              service.minutes,
              12,
              1,
            );
            assert.equal(
              template.stages.reduce((n, s) => n + s.minutes, 0),
              service.minutes,
            );
            assert.equal(template.stages[3].name, "Sport-Specific Warm-up");
            assert.equal(template.stages[4].name, "Drills");
          }
        for (const sport of ["baseball", "softball"])
          for (const discipline of api.lessonDisciplines)
            for (const minutes of [30, 60, 75])
              assert.equal(
                api
                  .resolveTemplate(sport, discipline, minutes, 12, 1)
                  .stages.reduce((n, s) => n + s.minutes, 0),
                minutes,
              );
        assert.throws(() => api.resolveTemplate("baseball", "Pitching", 45, 12, 1), /template/);
        assert.throws(() => api.disciplineFor("unknown"), /mapping/);
      },
    );
    async function booking(id, serviceId = "s7", sport = "baseball", minutes = 30) {
      const [service] = await sql`select * from club_services where id=${serviceId}`;
      await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff',${serviceId},60) on conflict do nothing`;
      const start = new Date(Date.now() - 4 * 3600000);
      start.setUTCSeconds(0, 0);
      start.setUTCMinutes(Math.floor(start.getUTCMinutes() / 5) * 5);
      const end = new Date(+start + minutes * 60000);
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id) values(${id},${id},'parent','parent@audit.example.invalid','player',${serviceId},'lesson',${JSON.stringify({ kind: "lesson", regularCents: 10400, discipline: service.discipline, credits: 1, recurring: false })}::jsonb,10400,'paid','square',${"pay-" + id},'family')`;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"pay-" + id},${id},'sandbox',10400,'COMPLETED')`;
      await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,status,resources,household_id,lesson_sport) values(${id},${id},'parent','player','instructor-id',${serviceId},${start.toISOString()},${end.toISOString()},'confirmed','["lane:1","athlete:player","coach:instructor-id"]'::jsonb,'family',${sport})`;
      return { start, end };
    }
    let first, document;
    await t.test(
      "pitcher booking hitting receives booked discipline; draft and logs restore",
      async () => {
        await booking("hitting");
        first = await api.openLessonSession("instructor", "hitting");
        assert.equal(first.session.snapshot.template.discipline, "Hitting");
        assert.equal(first.session.snapshot.template.minutes, 30);
        document = {
          ...first.session.document,
          attendance: "present",
          readiness: "ready",
          familyRecap: "Made solid contact and repeated the cue.",
          homework: "Tee drill, controlled quality repetitions.",
          nextSteps: "Review contact next session.",
          stageNotes: Array(8).fill("Completed and reviewed."),
          logs: [
            {
              id: "swing1",
              kind: "Hitting",
              drill: "Tee",
              observations: "Private observation",
              contactQuality: "Barrel",
              outcome: "Line drive",
              repetitions: 10,
            },
          ],
        };
        await api.saveLessonSession("instructor", {
          bookingId: "hitting",
          revision: 1,
          document,
          complete: false,
        });
        first = await api.openLessonSession("instructor", "hitting");
        assert.equal(first.session.document.logs[0].contactQuality, "Barrel");
        assert.equal(first.session.revision, 2);
      },
    );
    await t.test(
      "atomic idempotent completion preserves payments and updates history/earnings once",
      async () => {
        const money = await sql`select * from commerce_orders order by id`,
          payments = await sql`select * from square_payments order by id`;
        await api.saveLessonSession("instructor", {
          bookingId: "hitting",
          revision: 2,
          document,
          complete: true,
        });
        await api.saveLessonSession("instructor", {
          bookingId: "hitting",
          revision: 2,
          document,
          complete: true,
        });
        assert.equal(
          (await sql`select status from booking_records where id='hitting'`)[0].status,
          "completed",
        );
        assert.equal(
          (await sql`select * from guided_lesson_sessions where booking_id='hitting'`).length,
          1,
        );
        assert.equal(
          (await sql`select * from contractor_earnings where booking_id='hitting'`).length,
          1,
        );
        assert.equal(
          (await api.readWorkingFile()).lessons.filter((l) => l.id.startsWith("guided:")).length,
          1,
        );
        assert.deepEqual(await sql`select * from commerce_orders order by id`, money);
        assert.deepEqual(await sql`select * from square_payments order by id`, payments);
        assert.equal((await sql`select * from recruiting_metrics`).length, 0);
        const reopened = await api.openLessonSession("instructor", "hitting");
        assert.equal(reopened.session.document.logs[0].repetitions, 10);
      },
    );
    await t.test(
      "family privacy, unrelated instructors and legacy completion cannot bypass authority",
      async () => {
        await assert.rejects(() => api.openLessonSession("other", "hitting"), /assigned/);
        await assert.rejects(() => api.openLessonSession("parent", "hitting"), /Instructor/);
        await assert.rejects(() => api.lessonHistory("unrelated", "player"), /Forbidden/);
        const history = await api.lessonHistory("parent", "player");
        assert.equal(history.length, 1);
        assert.equal(history[0].document.coachNotes, "");
        assert.equal(history[0].document.logs[0].observations, "");
        await assert.rejects(
          () => api.completeSession("instructor", "hitting", "Legacy completion attempt"),
          /guided lesson/,
        );
      },
    );
    await t.test(
      "both sports and 30/60/75 minute sessions resolve independent of primary position",
      async () => {
        for (const sport of ["baseball", "softball"])
          for (const [serviceId, minutes] of [
            ["s2", 30],
            ["s3", 60],
            ["s1", 75],
          ]) {
            const id = sport + minutes;
            await booking(id, serviceId, sport, minutes);
            const opened = await api.openLessonSession("instructor", id);
            assert.equal(opened.session.snapshot.template.sport, sport);
            assert.equal(opened.session.snapshot.template.minutes, minutes);
            if (sport === "softball")
              assert.match(
                opened.session.snapshot.template.stages[3].instructions.join(" "),
                /underhand|Underhand/,
              );
          }
      },
    );
    await t.test(
      "catching and fielding use distinct persisted logs, never pitching fallback",
      async () => {
        for (const [id, serviceId, discipline, minutes] of [
          ["catch", "s10", "Catching", 30],
          ["field", "s12", "Fielding", 60],
        ]) {
          await booking(id, serviceId, "softball", minutes);
          let opened = await api.openLessonSession("instructor", id);
          assert.equal(opened.session.snapshot.template.discipline, discipline);
          const d = {
            ...document,
            objective: opened.session.document.objective,
            logs: [
              {
                id,
                kind: discipline,
                drill: "Rep circuit",
                observations: "Footwork",
                repetitions: 8,
                outcome: "Clean",
                ...(id === "catch"
                  ? { skill: "blocking", transfer: "quick" }
                  : { ballType: "grounder", errors: 1, throwQuality: "on target" }),
              },
            ],
          };
          await api.saveLessonSession("instructor", {
            bookingId: id,
            revision: 1,
            document: d,
            complete: false,
          });
          opened = await api.openLessonSession("instructor", id);
          assert.deepEqual(opened.session.document.logs, d.logs);
          await api.saveLessonSession("instructor", {
            bookingId: id,
            revision: 2,
            document: d,
            complete: true,
          });
          assert.deepEqual(
            (await api.openLessonSession("instructor", id)).session.document.logs,
            d.logs,
          );
        }
      },
    );
    await t.test(
      "cancellations, stale saves, no-shows, restrictions and incomplete documentation stay drafts",
      async () => {
        await booking("blocked");
        const opened = await api.openLessonSession("instructor", "blocked");
        await assert.rejects(
          () =>
            api.saveLessonSession("other", {
              bookingId: "blocked",
              revision: 1,
              document,
              complete: true,
            }),
          /assigned/,
        );
        for (const patch of [
          { attendance: "no-show" },
          { readiness: "unchecked" },
          { familyRecap: "" },
          { stageNotes: Array(8).fill("") },
          { logs: [{ id: "wrong", kind: "Pitching", drill: "No" }] },
        ])
          await assert.rejects(() =>
            api.saveLessonSession("instructor", {
              bookingId: "blocked",
              revision: 1,
              document: { ...document, objective: opened.session.document.objective, ...patch },
              complete: true,
            }),
          );
        assert.equal(
          (await sql`select status from booking_records where id='blocked'`)[0].status,
          "confirmed",
        );
        await api.saveLessonSession("instructor", {
          bookingId: "blocked",
          revision: 1,
          document: opened.session.document,
          complete: false,
        });
        await assert.rejects(
          () =>
            api.saveLessonSession("instructor", {
              bookingId: "blocked",
              revision: 1,
              document,
              complete: false,
            }),
          /Another editor/,
        );
        await sql`update booking_records set status='cancelled' where id='blocked'`;
        await assert.rejects(
          () =>
            api.saveLessonSession("instructor", {
              bookingId: "blocked",
              revision: 2,
              document,
              complete: true,
            }),
          /no longer confirmed/,
        );
        assert.equal(
          (await api.openLessonSession("instructor", "blocked")).session.status,
          "draft",
        );
      },
    );
    await t.test(
      "changed booked service cannot complete the original draft; old completed records remain read-only",
      async () => {
        await booking("changed-service");
        const s = await api.openLessonSession("instructor", "changed-service");
        await sql`update booking_records set product_id='s3' where id='changed-service'`;
        await assert.rejects(
          () =>
            api.saveLessonSession("instructor", {
              bookingId: "changed-service",
              revision: 1,
              document: s.session.document,
              complete: true,
            }),
          /Booking details changed/,
        );
        await booking("previously-completed");
        await sql`update booking_records set status='completed',completion_recap='Original historical recap' where id='previously-completed'`;
        const old = await api.openLessonSession("instructor", "previously-completed");
        assert.equal(old.session, null);
        assert.equal(old.legacyCompleted.recap, "Original historical recap");
        assert.equal(
          (await sql`select id from guided_lesson_sessions where booking_id='previously-completed'`)
            .length,
          0,
        );
      },
    );
    await t.test(
      "database isolation denies anonymous reads/writes even with direct table grants",
      async () => {
        await sql.query("create role lesson_untrusted");
        await sql.query("grant usage on schema public to lesson_untrusted");
        await sql.query(
          "grant select,insert,update,delete on guided_lesson_sessions to lesson_untrusted",
        );
        await sql.transaction(async (tx) => {
          await tx.query("set local role lesson_untrusted");
          assert.equal((await tx`select * from guided_lesson_sessions`).length, 0);
          assert.equal(
            (await tx`update guided_lesson_sessions set document='{}' returning id`).length,
            0,
          );
        });
      },
    );
    await t.test(
      "a downstream earnings failure rolls back publication and booking completion; retries commit once",
      async () => {
        await booking("rollback", "s1", "baseball", 75);
        const opened = await api.openLessonSession("instructor", "rollback");
        const d = {
          ...document,
          objective: opened.session.document.objective,
          logs: [
            {
              id: "pitch-a",
              kind: "Pitching",
              drill: "Called target",
              observations: "Controlled",
              intent: { row: 2, col: 2 },
              actual: { row: 2, col: 2 },
              repetitions: 1,
            },
          ],
        };
        await sql.query(
          "create function audit_fail_earning() returns trigger language plpgsql as $$ begin if new.booking_id='rollback' then raise exception 'Synthetic ledger failure'; end if; return new; end $$",
        );
        await sql.query(
          "create trigger audit_fail_earning before insert on contractor_earnings for each row execute function audit_fail_earning()",
        );
        const input = { bookingId: "rollback", revision: 1, document: d, complete: true };
        await assert.rejects(
          () => api.saveLessonSession("instructor", input),
          /Synthetic ledger failure/,
        );
        assert.equal(
          (await sql`select status from booking_records where id='rollback'`)[0].status,
          "confirmed",
        );
        assert.equal(
          (await sql`select status from guided_lesson_sessions where booking_id='rollback'`)[0]
            .status,
          "draft",
        );
        assert.equal(
          (await sql`select id from athlete_assessments where booking_id='rollback'`).length,
          0,
        );
        await sql.query("drop trigger audit_fail_earning on contractor_earnings");
        await Promise.all([
          api.saveLessonSession("instructor", input),
          api.saveLessonSession("instructor", input),
        ]);
        assert.equal(
          (await sql`select * from contractor_earnings where booking_id='rollback'`).length,
          1,
        );
        assert.equal(
          (await sql`select * from athlete_assessments where booking_id='rollback'`).length,
          1,
        );
        const history = await api.readWorkingFile();
        assert.equal(
          history.bullpens.filter((b) => b.id === "guided:" + opened.session.id).length,
          1,
        );
        assert.ok(history.bullpens.find((b) => b.id === "guided:" + opened.session.id).tci > 0);
      },
    );
    await t.test(
      "ambiguous legacy configuration requires documented admin resolution; snapshots never drift",
      async () => {
        await booking("legacy", "s3", null, 60);
        await sql`update booking_records set lesson_config=null where id='legacy'`;
        assert.equal((await api.openLessonSession("instructor", "legacy")).session, null);
        await assert.rejects(
          () =>
            api.reviewLegacyLesson("instructor", {
              bookingId: "legacy",
              sport: "softball",
              discipline: "Pitching",
              reason: "Checked original registration.",
            }),
          /Admin/,
        );
        await api.reviewLegacyLesson("admin", {
          bookingId: "legacy",
          sport: "softball",
          discipline: "Pitching",
          reason: "Checked original registration and family request.",
        });
        const before = (await api.openLessonSession("instructor", "legacy")).session.snapshot;
        await sql`update club_services set name='Changed later',minutes=30 where id='s3'`;
        assert.deepEqual(
          (await api.openLessonSession("instructor", "legacy")).session.snapshot,
          before,
        );
        assert.equal(before.service.service.lesson_version, 0);
        const report = await api.historicalLessonExceptions("admin");
        assert.match(report.note, /No historical records/);
      },
    );
  } finally {
    await h.close();
  }
});
