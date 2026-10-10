import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import {
  teamActivityWorkspace,
  saveTeamActivity,
  postTeamChat,
  publicTeamGames,
} from "./activity.server";
import { publicGamesFor } from "../games.server";
import { canReadTeamStats, publicTeamView, playerStatsView } from "./public-view";
import { scopeClub, mergeSave } from "./privacy";
import { parseClubSave } from "./contracts";
import { feeWorkspace, mutateFeePlan } from "./fee.server";
import { type TeamActivity } from "./activity-contracts";
import type { ClubRecord } from "./types";

test("assigned coaches manage schedules/results, family chat stays scoped, pricing remains owner-only", async () => {
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
    for (const id of [
      "admin",
      "coach",
      "assistant",
      "parent",
      "player",
      "stranger",
      "fake-admin",
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${id.includes("admin") ? "admin" : id === "coach" ? "coach" : id === "player" ? "player" : "parent"},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 2);
    const t = club.teams[0],
      other = club.teams[1];
    t.closed = false;
    other.closed = false;
    t.coachEmail = "coach@example.invalid";
    t.staff = [
      {
        ...t.staff[0],
        id: "assistant",
        email: "assistant@example.invalid",
        role: "Assistant Coach",
      },
    ];
    t.record = { w: 2, l: 1, t: 0 };
    const p = t.roster[0];
    p.email = "player@example.invalid";
    p.familyId = "fam-parent";
    p.parents = [{ name: "Parent", email: "parent@example.invalid", phone: "", rel: "parent" }];
    p.stats = { ab: 5, h: 2 };
    p.withdrawn = false;
    assert.equal(canReadTeamStats(t,{role:'player',email:'sibling@example.invalid',familyIds:[p.familyId],householdEmails:['parent@example.invalid']}),false,'a sibling household alone does not grant player team access');
    assert.equal(canReadTeamStats(t,{role:'parent',email:'stranger@example.invalid',familyId:p.familyId,familyIds:[]}),false,'unverified profile family ID is not membership');
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    const input: TeamActivity = {
      teamId: t.id,
      id: "",
      revision: 0,
      kind: "game",
      title: "Opponent",
      date: "2027-03-10",
      startTime: "18:00",
      endTime: "20:00",
      location: "Home field",
      status: "final",
      ourRuns: 6,
      oppRuns: 2,
      stats: [
        { playerId: p.id, values: { ab: 3, h: 2, r: 1, hr: 0, rbi: 1, sb: 0, bb: 0, so: 1 } },
      ],
    };
    for (const who of ["parent", "player", "stranger", "fake-admin"])
      await assert.rejects(() => saveTeamActivity(sql, who, input), /Access/);
    await assert.rejects(
      () => saveTeamActivity(sql, "coach", { ...input, teamId: other.id }),
      /Access/,
    );
    await assert.rejects(
      () =>
        saveTeamActivity(sql, "coach", {
          ...input,
          stats: [{ ...input.stats[0], playerId: other.roster[0].id }],
        }),
      /roster/,
    );
    const { id } = await saveTeamActivity(sql, "assistant", input);
    let view = await teamActivityWorkspace(sql, "coach", t.id);
    assert.equal(view.manage, true);
    assert.deepEqual(view.record, { w: 3, l: 1, t: 0 });
    assert.equal(view.players[0].stats.h, 4);
    const [game] = await publicGamesFor(sql);
    assert.equal(game.id, id);
    assert.equal(game.ourRuns, 6);
    assert.equal(game.teamStats?.h, 2);
    assert.ok(!JSON.stringify(game).includes(p.id));
    assert.ok(!JSON.stringify(game).includes("player@example"));
    for (const who of ["parent", "player"]) {
      const v = await teamActivityWorkspace(sql, who, t.id);
      assert.equal(v.manage, false);
      assert.equal(v.activities[0].stats[0].values.h, 2);
      await postTeamChat(sql, who, { teamId: t.id, body: "Team message " + who });
    }
    await assert.rejects(() => teamActivityWorkspace(sql, "stranger", t.id), /Access/);
    await assert.rejects(
      () => postTeamChat(sql, "coach", { teamId: other.id, body: "wrong team" }),
      /Access/,
    );
    await assert.rejects(() =>
      postTeamChat(sql, "parent", { teamId: t.id, body: "", author: "spoof" } as never),
    );
    view = await teamActivityWorkspace(sql, "coach", t.id);
    assert.deepEqual(
      view.messages.map((m) => m.author),
      ["parent", "player"],
    );
    const edit = {
      ...view.activities[0],
      ourRuns: 1,
      oppRuns: 2,
      stats: [{ ...input.stats[0], values: { ...input.stats[0].values, h: 1 } }],
    };
    await saveTeamActivity(sql, "coach", edit);
    await assert.rejects(() => saveTeamActivity(sql, "coach", edit), /changed/);
    view = await teamActivityWorkspace(sql, "parent", t.id);
    assert.deepEqual(view.record, { w: 2, l: 2, t: 0 });
    assert.equal(view.players[0].stats.h, 3);
    let [stored] = await sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(publicTeamView(stored.payload.teams[0]).record.l, 2);
    assert.equal(
      playerStatsView(stored.payload.teams[0], p.id, {
        role: "parent",
        email: "parent@example.invalid",
      }).stats.h,
      3,
    );
    await saveTeamActivity(sql, "coach", { ...view.activities[0], status: "cancelled" });
    view = await teamActivityWorkspace(sql, "coach", t.id);
    assert.deepEqual(view.record, { w: 2, l: 1, t: 0 });
    assert.equal(view.players[0].stats.h, 2);
    for (const kind of ["practice", "tournament"] as const)
      await saveTeamActivity(sql, "coach", {
        ...input,
        id: "",
        kind,
        status: "scheduled",
        stats: [],
        ourRuns: 0,
        oppRuns: 0,
      });
    [stored] = await sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    parseClubSave({ club: stored.payload, baseRev: stored.payload._rev });
    assert.ok(stored.payload.teams[0].practices.some((p) => p.where === "Home field"));
    assert.ok(
      stored.payload.catalog.some(
        (e) => e.name === "Opponent" && stored.payload.teams[0].tournamentIds.includes(e.id),
      ),
    );
    const coachFees = await feeWorkspace(sql, "coach");
    assert.equal(coachFees.teams.length, 1);
    assert.equal(coachFees.teams[0].private, null);
    assert.equal(coachFees.business, null);
    for (const action of ["publish", "close"] as const)
      await assert.rejects(
        () => mutateFeePlan(sql, "coach", { teamId: t.id, revision: 0, action, confirmed: true }),
        /Admin/,
      );
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "coach", {
          teamId: other.id,
          revision: 0,
          action: "propose",
          tournament: 10000,
          uniformId: "",
        }),
      /coach/,
    );
    const scoped = scopeClub(stored.payload, "coach", {
        email: "coach@example.invalid",
        familyId: "",
      }),
      incoming = structuredClone(scoped);
    incoming.teams[0].orgFee = 1;
    incoming.teams[0].eventBudget = 1;
    incoming.teams[0].uniformPackageId = "forged";
    incoming.teams[0].record.w = 999;
    incoming.teams[0].messages.push({ id: "forged", from: "Admin", body: "forged", at: "" });
    incoming.teams[0].roster[0].name = "Updated player";
    const merged = mergeSave(stored.payload, incoming, "coach", {
      email: "coach@example.invalid",
      familyId: "",
    });
    for (const k of ["orgFee", "eventBudget", "uniformPackageId", "record", "messages"] as const)
      assert.deepEqual(merged.teams[0][k], stored.payload.teams[0][k]);
    assert.equal(merged.teams[0].roster[0].name, "Updated player");
    assert.equal((await feeWorkspace(sql, "admin")).teams[0].access, "admin");
    assert.equal((await publicTeamGames(sql)).length, 1);
  } finally {
    await db.close();
  }
});
