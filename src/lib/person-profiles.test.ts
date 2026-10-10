import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { emptySharedProfile, type PersonSave } from "./person-contracts";
import { savePersonFor, personFor, saveMyPersonFor } from "./person.server";
import { publicPeopleFor } from "./person-public.server";
import { sampleClub } from "./teams/seed";
import { scopeClub } from "./teams/privacy";
import { scopeForViewer, canCoachAthlete, filterDevelopmentData } from "./pd/access";
import { emptyDevelopment } from "./pd/empty";
import { commerceIdentityFor } from "./commerce/access.server";
import { revokeStaffAccess } from "./staff-access.server";
import { parsePaySearch, checkoutReturnPath } from "./pay";

test("one account retains primary role, scoped assignments and shared publication; stale or unauthorized writes fail atomically", async () => {
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
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + n, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["owner", "admin"],
      ["student", "player"],
      ["parent", "parent"],
      ["coach", "coach"],
      ["same", "parent"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},'Same Name',true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},'Same Name',${role},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    const club = sampleClub();
    club._demo = false;
    const team = club.teams[0];
    team.coachEmail = "";
    team.headCoach = "";
    team.staff = [];
    team.closed = false;
    const child = team.roster[0];
    child.email = "student@example.invalid";
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    await sql`insert into club_households(id,primary_email) values('guardian-home','guardian@example.invalid')`;
    const input: PersonSave = {
      userId: "student",
      revision: 0,
      profile: {
        ...emptySharedProfile("Same Name"),
        bio: "Shared baseball teaching background.",
        sports: ["baseball"],
        specialties: ["Pitching"],
      },
      instructor: true,
      publishCoach: true,
      publishInstructor: true,
      teams: [{ teamId: team.id, role: "Assistant Coach" }],
      offerings: [{ serviceId: "s2", profitSplit: 60 }],
      windows: [{ weekday: "Mon", start: "16:00", end: "18:00" }],
      guardianHouseholds: [],
      playerIds: [child.id],
      reviewedSources: true,
    };
    // Approved service exists in the migrations/catalog seed.
    await sql`insert into club_services(id,kind,name,price,minutes,discipline) values('s2','lesson','Private Pitching 30',6300,30,'Pitching') on conflict(id) do nothing`;
    for (const actor of ["parent", "student", "coach"])
      await assert.rejects(() => savePersonFor(sql, actor, input), /Owner access/);
    await savePersonFor(sql, "owner", input);
    const identity = await resolveIdentity(sql, "student");
    assert.equal(identity.role, "player");
    assert.equal(identity.canInstruct, true);
    assert.equal(identity.canTeamCoach, true);
    assert.deepEqual(identity.playerIds, [child.id]);
    await assert.rejects(() => commerceIdentityFor(sql, "student"), /Player accounts/);
    const published = await publicPeopleFor(sql);
    const p = published.find((p) => p.name === "Same Name")!;
    assert.equal(p.instructor, true);
    assert.equal(p.teams.length, 1);
    assert.equal(p.bookable, true);
    assert.deepEqual(p.serviceIds, ["s2"]);
    assert.ok(!JSON.stringify(published).includes("@example.invalid"));
    assert.ok(!JSON.stringify(published).includes("profitSplit"));
    await saveMyPersonFor(sql, "student", {
      revision: 1,
      profile: { ...input.profile, bio: "Updated once for both directories." },
      reviewedSources: true,
    });
    assert.equal(
      (await publicPeopleFor(sql)).find((p) => p.id === published[0].id)?.bio,
      "Updated once for both directories.",
    );
    await assert.rejects(() => savePersonFor(sql, "owner", input), /changed/);
    let current = (await personFor(sql, "student")).value;
    await assert.rejects(
      () =>
        savePersonFor(sql, "owner", {
          ...current,
          offerings: [{ serviceId: "missing", profitSplit: 60 }],
          profile: { ...current.profile, name: "Must not save" },
        }),
      /existing lesson/,
    );
    assert.equal((await personFor(sql, "student")).value.profile.name, "Same Name");
    current = (await personFor(sql, "student")).value;
    await savePersonFor(sql, "owner", { ...current, guardianHouseholds: ["guardian-home"] });
    const guardian = await commerceIdentityFor(sql, "student");
    assert.equal(guardian.role, "parent");
    assert.ok(guardian.billingHouseholdIds.includes("guardian-home"));
    assert.equal((await resolveIdentity(sql, "student")).role, "player");
    const owner = (await personFor(sql, "owner")).value;
    await savePersonFor(sql, "owner", {
      ...owner,
      instructor: true,
      publishInstructor: true,
      profile: { ...owner.profile, bio: "Owner and instructor." },
      offerings: [{ serviceId: "s2", profitSplit: 60 }],
      reviewedSources: true,
    });
    assert.equal((await resolveIdentity(sql, "owner")).role, "admin");
    const same = (await personFor(sql, "same")).value;
    await savePersonFor(sql, "owner", {
      ...same,
      instructor: true,
      publishInstructor: true,
      profile: { ...same.profile, bio: "A different person with the same name." },
      reviewedSources: true,
    });
    assert.equal((await publicPeopleFor(sql)).filter((p) => p.name === "Same Name").length, 3);
    current = (await personFor(sql, "student")).value;
    await savePersonFor(sql, "owner", {
      ...current,
      publishCoach: false,
      publishInstructor: false,
    });
    const hidden = await publicPeopleFor(sql);
    assert.ok(!hidden.some((p) => p.id === published[0].id));
    assert.equal((await resolveIdentity(sql, "student")).canInstruct, true);
    await sql`update club_staff set active=false where user_id='student'`;
    await revokeStaffAccess(sql, { user_id: "student", email: "student@example.invalid" });
    assert.equal((await resolveIdentity(sql, "student")).canInstruct, false);
    assert.equal((await resolveIdentity(sql, "student")).role, "player");
  } finally {
    await db.close();
  }
});

test("player-instructor scope includes assigned lesson players and self, never unassigned siblings or coach notes on self", () => {
  const data = emptyDevelopment();
  data.coaches = [
    { id: "i", name: "Instructor", email: "i@example.invalid", specialties: [], active: true },
  ];
  data.families = [
    {
      id: "f",
      name: "Family",
      parentName: "Parent",
      email: "parent@example.invalid",
      phone: "",
      athleteIds: ["self", "sibling"],
    },
    {
      id: "other",
      name: "Other",
      parentName: "Parent",
      email: "other@example.invalid",
      phone: "",
      athleteIds: ["assigned", "unassigned"],
    },
  ];
  data.athletes = ["self", "sibling", "assigned", "unassigned"].map(
    (id) =>
      ({
        id,
        firstName: id,
        lastName: "Player",
        familyId: id === "self" || id === "sibling" ? "f" : "other",
        coachIds: id === "assigned" ? ["i"] : [],
        notes: "Private coach notes",
      }) as (typeof data.athletes)[number],
  );
  const scope = scopeForViewer(
    {
      role: "player",
      canInstruct: true,
      email: "i@example.invalid",
      name: "Instructor",
      playerName: "",
      playerIds: ["self"],
    },
    data,
  );
  assert.deepEqual([...scope.athleteIds].sort(), ["assigned", "self"]);
  assert.equal(canCoachAthlete(scope, "self"), false);
  assert.equal(canCoachAthlete(scope, "assigned"), true);
  assert.equal(filterDevelopmentData(data, scope).athletes.find((a) => a.id === "self")?.notes, "");
  const c = sampleClub();
  const p = c.teams[0].roster[0];
  const visible = scopeClub(c, "player", {
    email: "unmatched@example.invalid",
    familyId: "",
    playerIds: [p.id],
  });
  assert.equal(visible.teams.flatMap((t) => t.roster).length, 1);
});
test("instructor choice survives the sign-in return path without becoming an authorization claim", () => {
  const parsed = parsePaySearch({
    kind: "lesson",
    id: "s2",
    instructor: "c-stable",
    assessed: "yes",
    userId: "other",
  });
  assert.equal(parsed.instructor, "c-stable");
  assert.match(checkoutReturnPath(parsed), /instructor=c-stable/);
  assert.ok(!checkoutReturnPath(parsed).includes("assessed"));
});
