import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  blankEvaluationPayload,
  evaluationInput,
  evaluationTotal,
  normalizedEvaluationAge,
  type EvaluationInput,
} from "./tryout-evaluation-contracts";
import { evaluationWorkspaceFor, saveEvaluationFor } from "./tryout-evaluations.server";

test("scores stay pending until all seven skills are observed; invalid ratings and attribution are rejected", () => {
  const payload = blankEvaluationPayload();
  assert.equal(evaluationTotal(payload.ratings), null);
  payload.ratings = {
    contact: 5,
    approach: 4,
    fielding: 3,
    throwing: 2,
    movement: 1,
    knowledge: 4,
    coachability: null,
  };
  assert.equal(evaluationTotal(payload.ratings), null);
  payload.ratings.coachability = 5;
  assert.equal(evaluationTotal(payload.ratings), 24);
  assert.equal(normalizedEvaluationAge("13 U"), "13U");
  assert.equal(normalizedEvaluationAge("7U"), "7U");
  const input = {
    id: randomUUID(),
    baseRevision: 0,
    registrationId: null,
    teamId: "t",
    playerName: "Fixture",
    evaluationDate: "2026-10-07",
    status: "submitted",
    recommendation: "callback",
    payload,
  };
  assert.equal(evaluationInput.safeParse(input).success, true);
  assert.equal(evaluationInput.safeParse({ ...input, evaluatorId: "someone-else" }).success, false);
  assert.equal(
    evaluationInput.safeParse({ ...input, evaluationDate: "2026-02-30" }).success,
    false,
  );
  payload.ratings.contact = 0;
  assert.equal(evaluationInput.safeParse(input).success, false);
});

test("persistent evaluations enforce staff/team access, author attribution, retry safety, and owner visibility", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, email, role] of [
      ["owner", "stevemccutcheon89@gmail.com", "admin"],
      ["coach", "coach@example.invalid", "coach"],
      ["assistant", "assistant@example.invalid", "coach"],
      ["other", "other@example.invalid", "coach"],
      ["inactive", "inactive@example.invalid", "coach"],
      ["parent", "parent@example.invalid", "parent"],
      ["player", "player@example.invalid", "player"],
      ["fake-admin", "fake@example.invalid", "admin"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${email},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${email},${id},${role},${"fam-" + id})`;
      if (role === "coach")
        await sql`insert into club_staff(id,user_id,name,email,role,active) values(${id},${id},${id},${email},'coach',${id !== "inactive"})`;
    }
    const club = {
      teams: [
        {
          id: "baseball",
          name: "Baseball Fixture",
          age: "13U",
          sport: "baseball",
          coachEmail: "coach@example.invalid",
          staff: [{ email: "assistant@example.invalid" }],
        },
        {
          id: "softball",
          name: "Softball Fixture",
          age: "13U",
          sport: "softball",
          coachEmail: "other@example.invalid",
          staff: [],
        },
        {
          id: "young",
          name: "Young Fixture",
          age: "7U",
          sport: "baseball",
          coachEmail: "inactive@example.invalid",
          staff: [],
        },
      ],
    };
    await sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1)`;
    for (const [id, age, sport] of [
      ["reg-baseball", "13", "Baseball"],
      ["reg-softball", "13U", "Softball"],
      ["reg-young", "7U", "Baseball"],
    ]) {
      await sql`insert into club_requests(id,kind,payload) values(${id},'tryout',${JSON.stringify({ player: id, age, sport, email: "private@example.invalid", phone: "private", notes: "private" })}::jsonb)`;
    }
    for (const id of ["parent", "player", "fake-admin", "inactive"])
      await assert.rejects(() => evaluationWorkspaceFor(sql, id), /access|required/);
    const coach = await evaluationWorkspaceFor(sql, "coach");
    assert.deepEqual(
      coach.teams.map((t) => t.id),
      ["baseball"],
    );
    assert.deepEqual(
      coach.candidates.map((c) => c.id),
      ["reg-baseball"],
    );
    assert.doesNotMatch(JSON.stringify(coach), /private@example|phone|notes/);
    const input: EvaluationInput = {
      id: randomUUID(),
      baseRevision: 0,
      registrationId: "reg-baseball",
      teamId: "baseball",
      ageGroup: "13U",
      sport: "baseball",
      playerName: "Tampered name",
      evaluationDate: "2026-10-07",
      status: "draft",
      recommendation: "undecided",
      payload: blankEvaluationPayload(),
    };
    await assert.rejects(() => saveEvaluationFor(sql, "parent", input), /access/);
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, teamId: "softball" }),
      /assigned/,
    );
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, registrationId: "reg-softball" }),
      /does not match/,
    );
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, status: "submitted" }),
      /at least one/,
    );
    const draft = await saveEvaluationFor(sql, "coach", input);
    assert.equal(draft.playerName, "reg-baseball");
    assert.equal(draft.evaluatorId, "coach");
    assert.equal(draft.revision, 1);
    assert.equal(
      (await saveEvaluationFor(sql, "coach", input)).revision,
      1,
      "identical retries do not duplicate or revise",
    );
    assert.equal((await evaluationWorkspaceFor(sql, "owner")).evaluations.length, 1);
    assert.equal((await evaluationWorkspaceFor(sql, "other")).evaluations.length, 0);
    const teammate = await evaluationWorkspaceFor(sql, "assistant");
    assert.equal(teammate.evaluations.length, 1);
    assert.equal(teammate.evaluations[0].canEdit, false);
    await assert.rejects(
      () => saveEvaluationFor(sql, "assistant", { ...input, baseRevision: 1 }),
      /original evaluator/,
    );
    await assert.rejects(
      () => saveEvaluationFor(sql, "owner", { ...input, baseRevision: 1 }),
      /original evaluator/,
    );
    input.payload.ratings.contact = 4;
    const submitted = await saveEvaluationFor(sql, "coach", {
      ...input,
      baseRevision: 1,
      status: "submitted",
      recommendation: "callback",
    });
    assert.equal(submitted.revision, 2);
    assert.equal(submitted.status, "submitted");
    assert.equal(evaluationTotal(submitted.payload.ratings), null);
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, baseRevision: 1 }),
      /another window/,
    );
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, baseRevision: 2, registrationId: null }),
      /new evaluation/,
    );
    await assert.rejects(
      () =>
        saveEvaluationFor(sql, "coach", {
          ...input,
          baseRevision: 2,
          evaluationDate: "2099-01-01",
          status: "submitted",
        }),
      /future/,
    );
    const young = await saveEvaluationFor(sql, "owner", {
      ...input,
      id: randomUUID(),
      registrationId: "reg-young",
      teamId: "young",
      playerName: "ignored",
      status: "submitted",
    });
    assert.equal(young.ageGroup, "7U");
    const walkin = await saveEvaluationFor(sql, "other", {
      ...input,
      id: randomUUID(),
      registrationId: null,
      teamId: "softball",
      playerName: "Walk-in Fixture",
    });
    assert.equal(walkin.sport, "softball");
    assert.equal((await evaluationWorkspaceFor(sql, "owner")).evaluations.length, 3);
    const audits = await sql<{
      actor_id: string;
    }>`select actor_id from audit_events where target_table='tryout_evaluations'`;
    assert.deepEqual(audits.map((a) => a.actor_id).sort(), ["coach", "coach", "other", "owner"]);
    await sql`update club_staff set active=false where id='coach'`;
    await assert.rejects(() => evaluationWorkspaceFor(sql, "coach"), /active staff/);
    await sql`update club_staff set active=true where id='coach'`;
    club.teams[0].coachEmail = "removed@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    assert.equal((await evaluationWorkspaceFor(sql, "coach")).evaluations.length, 0);
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...input, baseRevision: 2 }),
      /assigned/,
    );
    assert.equal((await evaluationWorkspaceFor(sql, "owner")).evaluations.length, 3);
    await sql`update "user" set "disabledAt"=now() where id='assistant'`;
    await assert.rejects(() => evaluationWorkspaceFor(sql, "assistant"), /Unauthorized/);
    // A team record is optional for general tryouts. Access remains staff-only,
    // and each coach sees only their own general evaluations.
    await sql`delete from club_state where id='oklahoma-prospects'`;
    const general: EvaluationInput = {
      ...input,
      id: randomUUID(),
      registrationId: null,
      teamId: "",
      ageGroup: "7 u",
      sport: "baseball",
      playerName: "General Fixture",
      status: "submitted",
      recommendation: "callback",
    };
    await assert.rejects(
      () => saveEvaluationFor(sql, "coach", { ...general, ageGroup: "" }),
      /age group/,
    );
    const noTeam = await saveEvaluationFor(sql, "coach", general);
    assert.equal(noTeam.ageGroup, "7U");
    assert.equal(noTeam.teamId, "");
    assert.equal((await saveEvaluationFor(sql, "coach", general)).revision, 1);
    assert.deepEqual(
      (await evaluationWorkspaceFor(sql, "coach")).evaluations.map((r) => r.id),
      [noTeam.id],
    );
    assert.equal((await evaluationWorkspaceFor(sql, "other")).evaluations.length, 0);
    assert.equal((await evaluationWorkspaceFor(sql, "owner")).evaluations.length, 4);
    await assert.rejects(
      () => saveEvaluationFor(sql, "other", { ...general, baseRevision: 1 }),
      /original evaluator/,
    );
    await assert.rejects(() => saveEvaluationFor(sql, "parent", general), /access/);
    await assert.rejects(
      () =>
        saveEvaluationFor(sql, "coach", {
          ...general,
          id: randomUUID(),
          registrationId: "reg-softball",
        }),
      /assigned teams/,
    );
    const registered = await saveEvaluationFor(sql, "owner", {
      ...general,
      id: randomUUID(),
      registrationId: "reg-softball",
      ageGroup: "forged",
      sport: "baseball",
    });
    assert.equal(registered.ageGroup, "13U");
    assert.equal(registered.sport, "softball");
    assert.equal(registered.playerName, "reg-softball");
    const revised = await saveEvaluationFor(sql, "coach", {
      ...general,
      baseRevision: 1,
      ageGroup: "8U",
    });
    assert.equal(revised.ageGroup, "8U");
    assert.equal(revised.revision, 2);
    await sql`update club_staff set active=false where id='coach'`;
    await assert.rejects(() => evaluationWorkspaceFor(sql, "coach"), /active staff/);
  } finally {
    await db.close();
  }
});
