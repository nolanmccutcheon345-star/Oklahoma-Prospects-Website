import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import {
  seedHandbooks,
  handbookWorkspace,
  saveHandbook,
  saveTeamStandards,
  publicHandbooks,
} from "./handbooks.server";
import { defaultStandards, emptyReview, reviewedForSignatures } from "./contracts";

export async function enrollmentFixture() {
  const db = new PGlite();
  for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + n, "utf8"));
  function wrap(query: PGlite["query"]): Sql {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((s, x, i) => s + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  }
  const sql = wrap(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["fake", "admin"],
    ["coach", "coach"],
    ["othercoach", "coach"],
    ["guardian", "parent"],
    ["stranger", "parent"],
    ["coordinator", "parent"],
    ["player", "player"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${"home-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into club_households(id,primary_email) values('home-guardian','guardian@example.invalid')`;
  await sql`insert into household_members(household_id,user_id) values('home-guardian','guardian')`;
  const club = sampleClub();
  club._demo = false;
  const base = structuredClone(club.teams[0]);
  const soft = structuredClone(club.teams[0]);
  for (const [team, id, sport] of [
    [base, "base", "baseball"],
    [soft, "soft", "softball"],
  ] as const) {
    team.id = id;
    team.name = "Synthetic " + sport;
    team.sport = sport;
    team.closed = false;
    team.coachEmail = id === "base" ? "coach@example.invalid" : "othercoach@example.invalid";
    team.staff = [];
    team.roster = team.roster.slice(0, 1);
    const p = team.roster[0];
    p.id = id + "-player";
    p.name = "Synthetic athlete";
    p.familyId = "home-guardian";
    p.withdrawn = false;
    p.feeLock = null;
    p.planLock = null;
    p.payments = [];
    p.credits = [];
    p.agreement = { version: "", signedBy: "", signedAt: "" };
    p.parents = [{ name: "Guardian", email: "guardian@example.invalid", rel: "parent", phone: "" }];
  }
  club.teams = [base, soft];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  await sql`insert into person_player_links(user_id,player_id) values('player','base-player')`;
  await sql`insert into coordinator_assignments(user_id,sport,status,coverage,team_ids,permissions,updated_by) values('coordinator','softball','active','teams',array['soft'],array['enrollment.read','standards.draft'],'owner')`;
  return { db, sql, club };
}
export const standards = {
  ...defaultStandards,
  playingTime: "Meaningful skill-development opportunities; equal playing time is not guaranteed.",
  practiceExpectations: "Arrive prepared and communicate planned absences.",
  tournamentCommitment: "Attend the published schedule subject to organizer updates.",
  evaluationMethod:
    "Coach records observed skills, goals, one midseason update and a final review.",
};

test("handbook drafts, ownership, scoped team standards, immutable publication and conflict handling", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    await assert.rejects(seedHandbooks(sql, "fake"), /Owner/);
    await seedHandbooks(sql, "owner");
    await seedHandbooks(sql, "owner");
    assert.equal((await handbookWorkspace(sql, "owner")).documents.length, 3);
    assert.deepEqual(await publicHandbooks(sql), []);
    const draft = (await handbookWorkspace(sql, "owner")).documents.find(
      (d) => d.documentId === "academy-2027",
    )!;
    const input = {
      documentId: draft.documentId,
      version: 1,
      revision: 0,
      action: "publish",
      effectiveOn: "2026-01-01",
      content: draft.content,
      review: emptyReview,
    };
    await assert.rejects(saveHandbook(sql, "coach", input), /Owner/);
    await saveHandbook(sql, "owner", input);
    const published = (await publicHandbooks(sql))[0];
    assert.equal(published.version, 1);
    await assert.rejects(
      sql`update handbook_versions set content='{}' where document_id='academy-2027' and version=1`,
      /immutable/,
    );
    await assert.rejects(saveHandbook(sql, "owner", input), /changed/);
    await saveHandbook(sql, "owner", {
      ...input,
      revision: 1,
      action: "draft",
      content: { ...draft.content, title: "Changed title" },
    });
    assert.equal((await publicHandbooks(sql))[0].content.title, draft.content.title);
    const teamInput = {
      teamId: "base",
      version: 0,
      revision: 0,
      action: "draft",
      effectiveOn: "2026-01-01",
      standards,
    };
    await assert.rejects(saveTeamStandards(sql, "othercoach", teamInput), /available/);
    await assert.rejects(saveTeamStandards(sql, "guardian", teamInput), /permission/);
    await saveTeamStandards(sql, "coach", teamInput);
    await assert.rejects(
      saveTeamStandards(sql, "coach", { ...teamInput, version: 1, action: "publish" }),
      /owner/,
    );
    await saveTeamStandards(sql, "owner", { ...teamInput, version: 1, action: "publish" });
    assert.equal(
      (await handbookWorkspace(sql, "guardian")).documents.filter((d) => d.kind === "team").length,
      1,
    );
    assert.equal(
      (await handbookWorkspace(sql, "stranger")).documents.filter((d) => d.kind === "team").length,
      0,
    );
    const c = await handbookWorkspace(sql, "coordinator");
    assert.equal(c.teams.length, 1);
    assert.equal(c.teams[0].id, "soft");
    await assert.rejects(saveTeamStandards(sql, "coordinator", teamInput), /available/);
    await saveTeamStandards(sql, "coordinator", { ...teamInput, teamId: "soft" });
    await sql`update coordinator_assignments set status='suspended' where user_id='coordinator'`;
    await assert.rejects(
      saveTeamStandards(sql, "coordinator", { ...teamInput, teamId: "soft", version: 1 }),
      /available/,
    );
    const snapshot = JSON.stringify(c);
    assert.ok(!snapshot.includes("feeLock"));
    assert.ok(!snapshot.includes('"payments":'));
    await sql`update "user" set "disabledAt"=now() where id='coach'`;
    await assert.rejects(handbookWorkspace(sql, "coach"), /authorized/);
  } finally {
    await db.close();
  }
});
test("review evidence requires named reviewers, valid past dates and a reference", () => {
  assert.equal(reviewedForSignatures(emptyReview, "2026-10-24"), false);
  const review = {
    legalReviewer: "Synthetic lawyer",
    legalReviewedOn: "2026-10-24",
    insuranceReviewer: "Synthetic insurer",
    insuranceReviewedOn: "2026-10-24",
    reviewReference: "Synthetic review only",
  };
  assert.equal(reviewedForSignatures(review, "2026-10-24"), true);
  assert.equal(
    reviewedForSignatures({ ...review, legalReviewedOn: "2027-01-01" }, "2026-10-24"),
    false,
  );
});
