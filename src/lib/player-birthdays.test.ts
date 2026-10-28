import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  privatePlayerBirthday,
  birthdayAccess,
  missingPlayerBirthdays,
  completePlayerBirthday,
} from "./player-birthdays.server";
import { saveAccountProfile } from "./account-records.server";
import { resolveIdentity } from "./identity.server";
import { redactBirthdays, scopeForViewer, filterDevelopmentData } from "./pd/access";
import { mergeScopedFile } from "./pd/file";
import { seedDevelopment } from "./pd/seed";
import { emptyClub } from "./teams/seed";
import { assertYouthAge } from "./commerce/assessment-gate.server";
import { withCommerceRecords } from "./commerce/development.server";

test("birthday onboarding, guardian and team-only visibility, immutable self birthday, canonical storage", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((s, x, i) => s + (i ? `$${i}` : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    // Mirror production: nested transactions are forbidden.
    sql.transaction = (work) =>
      db.transaction((tx) => {
        const s = wrap(tx.query.bind(tx) as PGlite["query"]);
        s.transaction = async () => {
          throw new Error("Nested transaction");
        };
        return work(s);
      });
    return sql;
  };
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["parent", "parent"],
      ["other", "parent"],
      ["coach", "coach"],
      ["lesson", "coach"],
      ["player", "player"],
      ["new", ""],
      ["owner", "admin"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      if (role)
        await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    await resolveIdentity(sql, "parent");
    await sql`insert into club_athletes(id,user_id,household_email,name,coach_ids) values('kid','parent','parent@example.invalid','Private Child','["lesson"]'::jsonb)`;
    await sql`insert into person_player_links(user_id,player_id) values('player','kid')`;
    const club = emptyClub();
    club.teams = [
      {
        id: "team",
        closed: false,
        coachEmail: "coach@example.invalid",
        staff: [],
        roster: [{ id: "kid", withdrawn: false }],
      } as unknown as (typeof club.teams)[number],
    ];
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    assert.deepEqual(await missingPlayerBirthdays(sql, "parent"), [
      { id: "kid", name: "Private Child" },
    ]);
    await assert.rejects(completePlayerBirthday(sql, "other", "kid", "2016-01-01"), /not linked/);
    await assert.rejects(completePlayerBirthday(sql, "parent", "kid", "2016-02-30"), /valid/);
    await assert.rejects(completePlayerBirthday(sql, "parent", "kid", "2099-01-01"), /future/);
    await completePlayerBirthday(sql, "player", "kid", "2016-01-01");
    await assert.rejects(
      completePlayerBirthday(sql, "player", "kid", "2020-01-01"),
      /already saved/,
    );
    assert.deepEqual(await missingPlayerBirthdays(sql, "parent"), []);
    for (const id of ["parent", "coach"])
      assert.ok((await birthdayAccess(sql, id)).visibleIds.has("kid"));
    for (const id of ["other", "lesson", "player", "owner"])
      assert.ok(!(await birthdayAccess(sql, id)).visibleIds.has("kid"), id);
    assert.deepEqual(await privatePlayerBirthday(sql, "coach", "kid"), { birthDate: "2016-01-01" });
    for (const id of ["other", "lesson", "player", "owner"])
      await assert.rejects(privatePlayerBirthday(sql, id, "kid"), /Only this player/);
    club.teams[0].roster.push({
      id: "roster-only",
      name: "Roster Child",
      withdrawn: false,
      parents: [{ email: "parent@example.invalid" }],
    } as unknown as (typeof club.teams)[number]["roster"][number]);
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    assert.ok((await missingPlayerBirthdays(sql, "parent")).some((p) => p.id === "roster-only"));
    await completePlayerBirthday(sql, "parent", "roster-only", "2018-01-01");
    assert.deepEqual(await privatePlayerBirthday(sql, "coach", "roster-only"), {
      birthDate: "2018-01-01",
    });
    const viewer = await resolveIdentity(sql, "new");
    await assert.rejects(
      saveAccountProfile(sql, viewer, { name: "New", role: "player", playerName: "New" }),
      /birth/,
    );
    await saveAccountProfile(sql, viewer, {
      name: "New",
      role: "player",
      playerName: "New",
      birthDate: "2017-01-01",
    });
    assert.deepEqual((await resolveIdentity(sql, "new")).playerIds, ["player:new"]);
    assert.deepEqual(await missingPlayerBirthdays(sql, "new"), []);
    const data = seedDevelopment();
    data.athletes = [{ ...data.athletes[0], id: "kid", birthDate: "2020-01-01" }];
    assert.equal(
      (await withCommerceRecords(sql, data)).athletes.find((a) => a.id === "kid")!.birthDate,
      "2016-01-01",
    );
  } finally {
    await db.close();
  }
});

test("server projection strips dates including snapshots; redacted saves preserve saved birthday", () => {
  const full = seedDevelopment(),
    kid = full.athletes[0];
  const scope = scopeForViewer(
    { role: "admin", email: "owner@example.invalid", name: "Owner", playerName: "" },
    full,
  );
  scope.birthdayIds = new Set();
  const safe = filterDevelopmentData(full, scope);
  assert.equal(safe.athletes[0].birthDate, "");
  assert.equal(safe.athletes[0].birthdayRecorded, true);
  assert.ok(safe.athletes[0].ageYears! > 0);
  assert.equal(mergeScopedFile(full, safe, scope).athletes[0].birthDate, kid.birthDate);
  const snapshot = {
    id: "plan",
    athleteId: kid.id,
    inputs: { id: "snapshot", birthDate: kid.birthDate },
  };
  assert.equal(redactBirthdays(snapshot, new Set()).inputs.birthDate, "");
  assert.equal(redactBirthdays(snapshot, new Set([kid.id])).inputs.birthDate, kid.birthDate);
  safe.athletes[0].birthDate = "2020-01-01";
  assert.equal(mergeScopedFile(full, safe, scope).athletes[0].birthDate, kid.birthDate);
});

test("age 11 remains eligible until the twelfth birthday; unknown DOB is not eligible", () => {
  assert.doesNotThrow(() => assertYouthAge("2015-10-11", "2027-10-10"));
  assert.throws(() => assertYouthAge("2015-10-11", "2027-10-11"), /11 or younger/);
  assert.throws(() => assertYouthAge("", "2027-10-11"), /date of birth/);
});
