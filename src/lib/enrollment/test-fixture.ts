import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { defaultStandards } from "./contracts";
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

export async function preparePilot(sql: Sql) {
  const { handbookWorkspace, saveHandbook, saveTeamStandards } = await import("./handbooks.server");
  const { saveRollout, configurePilot } = await import("./enrollment.server");
  const review = {
    legalReviewer: "Synthetic lawyer",
    legalReviewedOn: "2026-01-01",
    insuranceReviewer: "Synthetic insurer",
    insuranceReviewedOn: "2026-01-01",
    reviewReference: "Isolated test evidence; not an actual review",
  };
  for (const d of (await handbookWorkspace(sql, "owner")).documents.filter(
    (d) => d.kind !== "team",
  )) {
    await saveHandbook(sql, "owner", {
      documentId: d.documentId,
      version: d.version,
      revision: d.revision,
      action: "publish",
      effectiveOn: "2026-01-01",
      content: d.content,
      review,
      reviewConfirmed: true,
    });
  }
  await saveRollout(sql, "owner", {
    revision: 0,
    safetyName: "Synthetic Primary",
    safetyContact: "primary@example.invalid",
    alternateName: "Synthetic Alternate",
    alternateContact: "alternate@example.invalid",
    emergencyPlanReference: "Isolated emergency-plan fixture",
  });
  for (const teamId of ["base", "soft"]) {
    await saveTeamStandards(sql, "owner", {
      teamId,
      version: 0,
      revision: 0,
      action: "publish",
      effectiveOn: "2026-01-01",
      standards,
    });
    await configurePilot(sql, "owner", {
      teamId,
      seasonKey: "2027",
      revision: 0,
      signaturesOpen: true,
    });
  }
}
