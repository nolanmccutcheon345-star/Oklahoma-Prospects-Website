import type { Team } from "./types";
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import { defaultBudget } from "./fee-model";
import {
  assertPORosterSpace,
  poRosterLimit,
  rosterAddInput,
  inquiryRosterInput,
} from "./po-roster";
import { assertRosterAssignment, assertRosterCapacity } from "./po-roster.server";
test("age defaults, admin overrides and required staff fee designations", () => {
  const team: Team = { ...sampleClub().teams[0], age: "14U", roster: [] };
  for (let age = 6; age <= 17; age++) assert.equal(poRosterLimit(`${age}U`), age <= 14 ? 1 : 4);
  const p = sampleClub().teams[0].roster[0];
  team.roster = [{ ...p, id: "one", roleType: "po", withdrawn: false }];
  assert.throws(() => assertPORosterSpace(team), /maximum of 1/);
  assert.doesNotThrow(() => assertPORosterSpace(team, 0, "one"));
  assert.doesNotThrow(() => assertPORosterSpace(team, 0, "", 3));
  assert.throws(() => assertPORosterSpace(team, 2, "", 3), /maximum of 3/);
  assert.throws(() => assertPORosterSpace(team, 0, "", 0), /no pitcher-only/);
  const input = {
    teamId: team.id,
    name: "Example",
    parentName: "Parent",
    parentEmail: "example@example.invalid",
  };
  assert.equal(rosterAddInput.safeParse(input).success, false);
  assert.equal(rosterAddInput.safeParse({ ...input, rosterRole: "po" }).success, true);
  assert.equal(rosterAddInput.safeParse({ ...input, rosterRole: "full" }).success, true);
  for (const stage of ["offer", "accepted"])
    assert.equal(
      inquiryRosterInput.safeParse({ id: "request", teamId: team.id, stage }).success,
      false,
    );
  assert.equal(
    inquiryRosterInput.safeParse({ id: "request", teamId: team.id, stage: "registered" }).success,
    true,
  );
});
test("database-backed roster checks reserve PO offers and apply saved per-team admin caps", async () => {
  const db = new PGlite();
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await db.query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const team: Team = { ...sampleClub().teams[0], age: "14U", roster: [] };
    const budget = { ...defaultBudget(), poEnabled: true };
    await sql`insert into team_fee_plans(team_id,payload) values(${team.id},${JSON.stringify({ budget })}::jsonb)`;
    await assertRosterAssignment(sql, team, "po");
    await sql`insert into club_requests(id,kind,payload) values('offer-one','tryout',${JSON.stringify({ teamId: team.id, stage: "offer", rosterRole: "po" })}::jsonb)`;
    await assert.rejects(() => assertRosterAssignment(sql, team, "po"), /maximum of 1/);
    await assertRosterAssignment(sql, team, "po", "", "offer-one");
    await assertRosterAssignment(sql, team, "full");
    await sql`update team_fee_plans set payload=${JSON.stringify({ budget: { ...budget, poRosterLimit: 2 } })}::jsonb where team_id=${team.id}`;
    await assertRosterAssignment(sql, team, "po");
    const player = {
      ...sampleClub().teams[0].roster[0],
      id: "po-one",
      roleType: "po" as const,
      withdrawn: false,
    };
    team.roster = [player];
    await assert.rejects(() => assertRosterAssignment(sql, team, "po"), /maximum of 2/);
    await assert.rejects(
      () => assertRosterCapacity(sql, team, { ...budget, poRosterLimit: 1 }),
      /2 active PO/,
    );
    await assertRosterCapacity(sql, team, { ...budget, poRosterLimit: 2 });
    await sql`update club_requests set payload=payload||'{"stage":"waitlist"}'::jsonb where id='offer-one'`;
    await assertRosterAssignment(sql, team, "po");
    await sql`update team_fee_plans set payload=${JSON.stringify({ budget: { ...budget, poEnabled: false } })}::jsonb where team_id=${team.id}`;
    await assert.rejects(() => assertRosterAssignment(sql, team, "po"), /does not offer/);
  } finally {
    await db.close();
  }
});
