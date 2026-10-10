import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import { defaultBudget, calculateFees } from "./fee-model";
import { feeWorkspace, mutateFeePlan, teamFundingStatus } from "./fee.server";
import { saveTeamActivity, teamActivityWorkspace } from "./activity.server";
import { activityInput, type TeamActivity } from "./activity-contracts";
import { seasonHotelNights } from "./travel-budget";

test("scheduled stays calculate admin-priced hotel costs; aggregate arrears exclude players and private financial data", async () => {
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
    for (const id of ["admin", "coach", "parent", "player", "stranger"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${id === "stranger" ? "parent" : id},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 1);
    const team = club.teams[0];
    team.closed = false;
    team.coachEmail = "coach@example.invalid";
    team.staff = [];
    team.roster = team.roster.slice(0, 3);
    for (const p of team.roster) {
      p.withdrawn = false;
      p.parents = [];
      p.feeLock = null;
      p.payments = [];
      p.credits = [];
      p.agreement = { version: "", signedBy: "", signedAt: "" };
    }
    team.roster[0].email = "player@example.invalid";
    team.roster[0].parents = [
      { name: "Parent", rel: "parent", email: "parent@example.invalid", phone: "" },
    ];
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    const budget = {
      ...defaultBudget(),
      start: "2027-01-01",
      end: "2027-12-31",
      hotelNightly: 20000,
      hotelNights: 999,
    };
    await mutateFeePlan(sql, "admin", {
      action: "save",
      teamId: team.id,
      revision: 0,
      budget,
      uniforms: [],
      expenses: [],
    });
    let plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 0, "client cannot forge calculated nights");
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "coach", {
          action: "save",
          teamId: team.id,
          revision: 1,
          budget,
          uniforms: [],
          expenses: [],
        }),
      /Admin/,
    );
    const event: TeamActivity = {
      teamId: team.id,
      id: "",
      revision: 0,
      kind: "tournament",
      title: "Travel tournament",
      date: "2027-04-01",
      startTime: "08:00",
      endTime: "18:00",
      location: "Away field",
      status: "scheduled",
      ourRuns: 0,
      oppRuns: 0,
      stats: [],
      travel: "travel",
      overnightNights: 3,
    };
    await assert.rejects(() => saveTeamActivity(sql, "parent", event), /Access/);
    const saved = await saveTeamActivity(sql, "coach", event);
    plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 3);
    assert.equal(plan.revision, 2);
    assert.equal(plan.status, "pending");
    assert.equal(
      calculateFees(plan.budget).fixed - calculateFees({ ...plan.budget, hotelNights: 0 }).fixed,
      60000,
    );
    const current = (await teamActivityWorkspace(sql, "coach", team.id)).activities.find(
      (a) => a.id === saved.id,
    )!;
    await saveTeamActivity(sql, "coach", { ...current, overnightNights: 2 });
    plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 2);
    await saveTeamActivity(sql, "coach", { ...current, revision: 2, status: "cancelled" });
    plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 0);
    await saveTeamActivity(sql, "coach", { ...current, revision: 3, status: "scheduled" });
    await saveTeamActivity(sql, "coach", {
      ...event,
      title: "Travel game",
      kind: "game",
      date: "2027-06-01",
      overnightNights: 2,
    });
    plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 5);
    await mutateFeePlan(sql, "admin", {
      action: "save",
      teamId: team.id,
      revision: plan.revision,
      budget: { ...plan.budget, hotelNightly: 30000, hotelNights: 999 },
      uniforms: [],
      expenses: [],
    });
    plan = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(plan.budget.hotelNights, 5);
    assert.equal(
      calculateFees(plan.budget).fixed - calculateFees({ ...plan.budget, hotelNights: 0 }).fixed,
      150000,
    );
    assert.equal(
      seasonHotelNights(
        [
          { ...event, date: "2028-01-01" },
          { ...event, travel: "local", overnightNights: 0 },
        ],
        budget,
      ),
      0,
    );
    assert.equal(
      activityInput.safeParse({ ...event, travel: "local", overnightNights: 2 }).success,
      false,
    );
    assert.equal(activityInput.safeParse({ ...event, overnightNights: -1 }).success, false);
    assert.equal(activityInput.safeParse({ ...event, overnightNights: 1.5 }).success, false);
    // A funded season's agreements remain distinct from its private budget.
    const [stored] = await sql<{
      payload: typeof club;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    const players = stored.payload.teams[0].roster;
    for (let i = 0; i < players.length; i++) {
      players[i].feeLock = {
        amount: 1000,
        lockedAt: "2020-01-01",
        policyVersion: "agreed",
        components: { season: 1000 },
      };
      players[i].planLock = {
        dep: 400,
        deadline: "2099-01-01",
        planType: "custom",
        rows: [
          { date: i === 2 ? "2099-01-01" : "2020-01-01", amount: 400 },
          { date: "2099-01-01", amount: 600 },
        ],
      };
      players[i].agreement = { version: "agreed", signedBy: "Guardian", signedAt: "2020-01-01" };
    }
    await sql`update club_state set payload=${JSON.stringify(stored.payload)}::jsonb where id='oklahoma-prospects'`;
    for (const who of ["admin", "coach", "parent"])
      assert.deepEqual(await teamFundingStatus(sql, who, team.id), {
        overduePlayers: 2,
        tracking: true,
      });
    for (const who of ["player", "stranger"])
      assert.equal(await teamFundingStatus(sql, who, team.id), null);
    assert.equal(await teamFundingStatus(sql, "coach", "other-team"), null);
    players[0].credits = [{ label: "Approved credit", amount: 400 }];
    players[1].payments = [
      {
        date: "2026-01-01",
        amount: 400,
        fee: 0,
        charged: 400,
        method: "cash",
        label: "Deposit",
        receipt: "fixture",
      },
    ];
    await sql`update club_state set payload=${JSON.stringify(stored.payload)}::jsonb where id='oklahoma-prospects'`;
    assert.deepEqual(await teamFundingStatus(sql, "parent", team.id), {
      overduePlayers: 0,
      tracking: true,
    });
    const game = (await teamActivityWorkspace(sql, "coach", team.id)).activities.find(
      (a) => a.kind === "game",
    )!;
    await saveTeamActivity(sql, "coach", { ...game, travel: "local", overnightNights: 0 });
    const [after] = await sql<{
      payload: typeof club;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(
      after.payload.teams[0].roster[0].feeLock?.amount,
      1000,
      "schedule recalculation cannot rewrite an accepted player fee",
    );
    assert.equal(players[0].feeLock?.amount, 1000);
  } finally {
    await db.close();
  }
});
