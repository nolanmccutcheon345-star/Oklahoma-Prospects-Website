import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { sampleClub } from "./teams/seed";
import { saveTeamActivity } from "./teams/activity.server";
import { blankProfile, metricInput, currentSeason } from "./recruiting-contracts";
import {
  saveRecruitingProfile,
  consentRecruiting,
  saveRecruitingMetric,
  reviewRecruitingMetric,
  linkRecruitingRoster,
  recruitingWorkspace,
  publicRecruiting,
  lessonMetricContext,
  recordLessonMetric,
} from "./recruiting.server";
test("recruiting consent, identity boundaries, verification invalidation, shared stats, and withdrawal", async () => {
  const db = new PGlite();
  const wrap = (q: PGlite["query"]): Sql => {
    const s = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await q(
          p.reduce((s, x, i) => s + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    s.query = (async (t: string, v: unknown[] = []) => (await q(t, v)).rows) as Sql["query"];
    s.transaction = (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return s;
  };
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["admin", "admin"],
      ["parent", "parent"],
      ["player", "player"],
      ["sibling", "player"],
      ["head", "coach"],
      ["instructor", "parent"],
      ["assistant", "coach"],
      ["stranger", "parent"],
      ["fake-admin", "admin"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    const parent = await resolveIdentity(sql, "parent");
    const household = parent.familyIds[0];
    await sql`insert into club_athletes(id,name,household_id,birth_date,household_email) values('athlete','Prospect Player',${household},'2012-01-02','parent@example.invalid'),('unrelated','Unrelated Player',null,'2010-01-01','stranger@example.invalid')`;
    await sql`insert into household_members(household_id,user_id) values(${household},'player'),(${household},'sibling')`;
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 2);
    const team = club.teams[0];
    team.closed = false;
    team.coachEmail = "head@example.invalid";
    team.staff = [
      {
        ...team.staff[0],
        id: "assistant",
        name: "Assistant",
        email: "assistant@example.invalid",
        role: "Assistant Coach",
      },
    ];
    team.seasons = ["Spring 2026", "Fall 2026"];
    team.seasonLabel = "Spring 2026 & Fall 2026";
    const roster = team.roster[0];
    roster.withdrawn = false;
    roster.stats = { ab: 10, h: 4 };
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    await sql`insert into person_player_links(user_id,player_id) values('player',${roster.id})`;
    const link = { athleteId: "athlete", teamId: team.id, rosterId: roster.id };
    await assert.rejects(() => linkRecruitingRoster(sql, "head", link), /Admin/);
    await linkRecruitingRoster(sql, "admin", link);
    await assert.rejects(
      () => linkRecruitingRoster(sql, "admin", { ...link, athleteId: "unrelated" }),
      /another player/,
    );
    const draft = {
      athleteId: "athlete",
      revision: 0,
      profile: {
        ...blankProfile,
        bio: "A committed student athlete.",
        school: "Example High",
        gradYear: "2030",
      },
    };
    for (const id of ["stranger", "sibling", "head", "assistant", "fake-admin"])
      await assert.rejects(() => saveRecruitingProfile(sql, id, draft), /Only/);
    await saveRecruitingProfile(sql, "player", draft);
    assert.equal((await publicRecruiting(sql)).length, 0);
    await assert.rejects(() => saveRecruitingProfile(sql, "parent", draft), /changed/);
    const consent = {
      athleteId: "athlete",
      publish: true,
      signer: "Parent Guardian",
      consent: true,
    };
    for (const id of ["admin", "player", "sibling", "head", "stranger"])
      await assert.rejects(() => consentRecruiting(sql, id, consent), /Only/);
    await assert.rejects(
      () => consentRecruiting(sql, "parent", { ...consent, consent: false }),
      /consent/,
    );
    await consentRecruiting(sql, "parent", consent);
    assert.equal((await publicRecruiting(sql))[0].name, "Prospect Player");
    const metric = {
      athleteId: "athlete",
      id: "",
      revision: 0,
      metric: "pitchVelocity" as const,
      value: 78,
      measuredOn: "2026-10-01",
      evidence: "https://example.invalid/evidence",
      request: true,
    };
    await assert.rejects(() => saveRecruitingMetric(sql, "stranger", metric), /Only/);
    await saveRecruitingMetric(sql, "player", metric);
    let work = await recruitingWorkspace(sql, "head");
    assert.equal(work.requests.length, 1);
    let request = work.requests[0];
    assert.equal((await recruitingWorkspace(sql, "assistant")).requests.length, 0);
    assert.equal(
      (await recruitingWorkspace(sql, "stranger")).players.some((p) => p.id === "athlete"),
      false,
    );
    assert.equal((await recruitingWorkspace(sql, "sibling")).players.length, 0);
    const review = {
      id: request.id,
      revision: request.revision,
      approve: true,
      method: "Observed on facility radar",
      note: "Private review note",
    };
    for (const id of ["player", "parent", "assistant", "stranger", "fake-admin"])
      await assert.rejects(() => reviewRecruitingMetric(sql, id, review), /Only/);
    await reviewRecruitingMetric(sql, "head", review);
    let pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(pub.metrics[0].status, "verified");
    assert.equal(pub.metrics[0].verifiedBy, "head");
    const publicText = JSON.stringify(pub);
    for (const secret of [
      "2012-01-02",
      "Parent Guardian",
      "example.invalid/evidence",
      "Private review note",
      "household_id",
      "consent_by",
    ])
      assert.ok(!publicText.includes(secret), secret);
    let editable = (await recruitingWorkspace(sql, "parent")).players[0].metrics[0];
    await saveRecruitingMetric(sql, "parent", {
      ...metric,
      id: editable.id,
      revision: editable.revision,
      value: 79,
    });
    await assert.rejects(() => reviewRecruitingMetric(sql, "head", review), /changed/);
    pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(pub.metrics[0].status, "pending");
    assert.equal(pub.metrics[0].verifiedBy, null);
    request = (await recruitingWorkspace(sql, "admin")).requests[0];
    await reviewRecruitingMetric(sql, "admin", {
      ...review,
      id: request.id,
      revision: request.revision,
      approve: false,
    });
    assert.equal((await publicRecruiting(sql, "athlete"))[0].metrics[0].status, "unverified");

    await sql`insert into person_profiles(user_id,instructor) values('instructor',true)`;
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify({ coaches: [{ id: "lesson-coach", email: "instructor@example.invalid", active: true }] })}::jsonb,1)`;
    for (const [id, athlete, status, start] of [
      ["lesson-past", "athlete", "completed", "2026-10-01T18:00:00Z"],
      ["lesson-future", "athlete", "confirmed", "2030-10-01T18:00:00Z"],
      ["lesson-cancelled", "unrelated", "cancelled", "2026-10-01T18:00:00Z"],
    ]) {
      const end = new Date(Date.parse(start) + 3600000).toISOString();
      await sql`insert into booking_records(id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${id},${athlete},'lesson-coach','private-pitching',${start},${end},'[]'::jsonb,${status})`;
    }
    assert.equal(
      (await recruitingWorkspace(sql, "instructor")).players.length,
      0,
      "lesson access does not grant profile/guardian editing",
    );
    await assert.rejects(() => lessonMetricContext(sql, "instructor", "lesson-cancelled"), /Only/);
    for (const id of ["parent", "player", "assistant", "head", "stranger"])
      await assert.rejects(() => lessonMetricContext(sql, id, "lesson-past"), /Only/);
    let latest = (await lessonMetricContext(sql, "instructor", "lesson-past")).metrics[0];
    const lessonInput = {
      bookingId: "lesson-past",
      id: latest.id,
      revision: latest.revision,
      metric: "pitchVelocity" as const,
      value: 82,
      evidence: "",
      method: "Measured with facility radar during lesson",
    };
    await assert.rejects(
      () => recordLessonMetric(sql, "instructor", { ...lessonInput, bookingId: "lesson-future" }),
      /not before/,
    );
    await recordLessonMetric(sql, "instructor", lessonInput);
    pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(pub.metrics[0].status, "verified");
    assert.equal(pub.metrics[0].value, 82);
    assert.equal(pub.metrics[0].verifiedBy, "instructor");
    assert.equal(pub.metrics[0].date, "2026-10-01");
    assert.equal(JSON.stringify(pub).includes("lesson-past"), false);
    const [source] = await sql<{
      source_booking_id: string;
    }>`select source_booking_id from recruiting_metrics where id=${latest.id}`;
    assert.equal(source.source_booking_id, "lesson-past");
    await assert.rejects(() => recordLessonMetric(sql, "instructor", lessonInput), /changed/);
    latest = (await lessonMetricContext(sql, "instructor", "lesson-past")).metrics[0];
    await saveRecruitingMetric(sql, "parent", {
      ...metric,
      id: latest.id,
      revision: latest.revision,
      value: 83,
    });
    assert.equal((await publicRecruiting(sql, "athlete"))[0].metrics[0].status, "pending");
    const pending = (await recruitingWorkspace(sql, "instructor")).requests[0];
    assert.equal(pending.athlete_id, "athlete");
    await reviewRecruitingMetric(sql, "instructor", {
      id: pending.id,
      revision: pending.revision,
      approve: true,
      method: "Observed in private lesson",
      note: "",
    });
    await sql`insert into booking_records(id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status) values('lesson-private','unrelated','lesson-coach','private-hitting','2026-10-01T18:00:00Z','2026-10-01T19:00:00Z','[]'::jsonb,'completed')`;
    await recordLessonMetric(sql, "instructor", {
      bookingId: "lesson-private",
      id: "",
      revision: 0,
      metric: "exitVelocity",
      value: 80,
      evidence: "",
      method: "Observed with hitting sensor",
    });
    assert.equal(
      (await publicRecruiting(sql, "unrelated")).length,
      0,
      "automatic lesson entry must never authorize public visibility",
    );
    assert.equal(
      (await recruitingWorkspace(sql, "stranger")).players.find((p) => p.id === "unrelated")!
        .metrics[0].status,
      "verified",
    );
    await sql`update pd_working_file set payload=jsonb_set(payload::jsonb,'{coaches,0,active}','false'::jsonb)::text where id='club'`;
    await assert.rejects(() => lessonMetricContext(sql, "instructor", "lesson-past"), /Only/);
    const createdGame = await saveTeamActivity(sql, "head", {
      teamId: team.id,
      id: "",
      revision: 0,
      season: "Fall 2026",
      kind: "game",
      title: "League game",
      date: "2026-10-01",
      startTime: "18:00",
      endTime: "20:00",
      location: "Home field",
      status: "final",
      ourRuns: 5,
      oppRuns: 3,
      stats: [
        { playerId: roster.id, values: { ab: 4, h: 2, r: 1, hr: 0, rbi: 1, sb: 0, bb: 0, so: 1 } },
      ],
    });
    const [gameRow] = await sql<{
      payload: import("./teams/activity-contracts").TeamActivity;
    }>`select payload from team_activities where id=${createdGame.id}`;
    const game = gameRow.payload;
    pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(
      pub.rows.filter((r) => r.season === "Fall 2026").reduce((n, r) => n + r.values.ab, 0),
      4,
    );
    assert.equal(
      pub.rows.reduce((n, r) => n + r.values.ab, 0),
      14,
    );
    assert.equal(pub.rows.find((r) => r.season === "Unassigned season")!.values.ab, 10);
    await saveTeamActivity(sql, "head", {
      ...game,
      stats: [{ ...game.stats[0], values: { ...game.stats[0].values, h: 3 } }],
    });
    pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(
      pub.rows.reduce((n, r) => n + r.values.h, 0),
      7,
    );
    const otherTeam = club.teams[1];
    await linkRecruitingRoster(sql, "admin", {
      athleteId: "athlete",
      teamId: otherTeam.id,
      rosterId: otherTeam.roster[0].id,
    });
    pub = (await publicRecruiting(sql, "athlete"))[0];
    assert.equal(pub.teams.length, 2);
    assert.equal(
      pub.rows.filter((r) => r.teamId === team.id).reduce((n, r) => n + r.values.ab, 0),
      14,
    );
    await linkRecruitingRoster(sql, "admin", {
      athleteId: "athlete",
      teamId: otherTeam.id,
      rosterId: otherTeam.roster[0].id,
      remove: true,
    });
    assert.equal((await publicRecruiting(sql, "athlete"))[0].teams.length, 1);
    await consentRecruiting(sql, "parent", { ...consent, publish: false, consent: false });
    assert.equal((await publicRecruiting(sql)).length, 0);
    assert.equal((await publicRecruiting(sql, "athlete")).length, 0);
    assert.equal((await recruitingWorkspace(sql, "parent")).players[0].published, false);
  } finally {
    await db.close();
  }
});
test("metric schema rejects forged verification and invalid measurements", () => {
  const d = {
    athleteId: "a",
    id: "",
    revision: 0,
    metric: "exitVelocity",
    value: 85,
    measuredOn: "2026-10-01",
    evidence: "",
    request: true,
  };
  assert.equal(metricInput.safeParse(d).success, true);
  for (const patch of [
    { value: 1000 },
    { value: -5 },
    { measuredOn: "2026-02-30" },
    { status: "verified" },
    { verifiedBy: "admin" },
  ])
    assert.equal(metricInput.safeParse({ ...d, ...patch }).success, false);
  assert.equal(currentSeason(new Date("2026-10-10T12:00:00Z")), "Fall 2026");
});
