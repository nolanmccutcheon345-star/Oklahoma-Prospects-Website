import test from "node:test";
import { rosterWaiver, teamWaiverReadiness } from "./enrollment/athlete-link.server.ts";
import { enrollmentGuide } from "./enrollment/guide.server.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { auditHarness } from "../../scripts/audit-support.mjs";
import { sampleClub } from "./teams/seed.ts";
import { prepareOrganization } from "./enrollment/test-fixture.ts";
import { enrollmentCase } from "./enrollment/enrollment.server.ts";
import { enrollmentScope } from "./enrollment/access.server.ts";
test("saved waivers survive roster linking, retries and coach views without widening household access", async () => {
  const h = await auditHarness();
  try {
    const { sql, api } = h;
    for (const [id, role] of [
      ["owner", "admin"],
      ["guardian", "parent"],
      ["coach", "coach"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
      await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${"home-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    const identity = await api.clubIdentity("guardian");
    const athlete = await api.addAthlete("guardian", {
      requestId: randomUUID(),
      name: "Synthetic Athlete",
      birthDate: "2014-02-01",
      sport: "baseball",
      throws: "R",
      bats: "R",
    });
    const club = sampleClub();
    club._demo = false;
    club.teams = ["base", "soft"].map((id) => {
      const team = structuredClone(club.teams[0]);
      team.id = id;
      team.name = "Synthetic " + id;
      team.sport = id === "base" ? "baseball" : "softball";
      team.closed = false;
      team.coachEmail = "coach@example.invalid";
      team.staff = [];
      team.roster = team.roster.slice(0, 1);
      Object.assign(team.roster[0], {
        id: id + "-player",
        name: "Synthetic Athlete",
        familyId: identity.billingHouseholdIds[0],
        withdrawn: false,
        feeLock: null,
        planLock: null,
        payments: [],
        credits: [],
        agreement: { version: "", signedBy: "", signedAt: "" },
        parents: [
          { name: "Guardian", email: "guardian@example.invalid", rel: "parent", phone: "" },
        ],
      });
      return team;
    });
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
    await prepareOrganization(sql);
    await sql`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${athlete.id},'base','base-player','owner')`;
    const waiver = {
      athleteId: athlete.id,
      adultName: "Synthetic Guardian",
      adultPhone: "555-0100",
      participantType: "minor",
      emergencyName: "Synthetic Emergency",
      emergencyPhone: "555-0101",
      signerName: "Synthetic Guardian",
      relationship: "parent",
      medicalNotes: "",
      consent: true,
      rosterConsent: true,
    };
    const first = await api.signWaiver("guardian", waiver);
    assert.equal(first.outcome, "saved");
    const retry = await api.signWaiver("guardian", waiver);
    assert.equal(retry.outcome, "already-on-file");
    assert.equal(retry.receipt.id, first.receipt.id);
    const stored = await api.myWaivers("guardian");
    assert.equal(stored.length, 1);
    const key = { teamId: "base", playerId: "base-player" };
    const before = await enrollmentCase(sql, "guardian", key);
    assert.equal(before.summary.waiverCurrent, true);
    assert.equal(before.summary.athleteLinked, true);
    assert.equal((await teamWaiverReadiness(sql, "coach", "base"))[0].waiverCurrent, true);
    await assert.rejects(teamWaiverReadiness(sql, "guardian", "base"));
    await assert.rejects(
      enrollmentCase(sql, "coach", { teamId: "unassigned", playerId: "base-player" }),
    );
    const guide = await enrollmentGuide(sql, "guardian", {});
    assert.doesNotMatch(
      guide.players[0].steps[2].detail,
      /sign the annual facility waiver|link the roster athlete/,
    );
    await sql`insert into team_dev_roster_links(id,team_id,roster_player_id,athlete_id,linked_by) values('synthetic-link','base','base-player',${athlete.id},'owner')`;
    assert.equal(
      (await rosterWaiver(sql, "base", "base-player")).current,
      true,
      "same athlete in both link sources is not ambiguous",
    );
    const changed = await api.signWaiver("guardian", { ...waiver, emergencyPhone: "555-0199" });
    assert.equal(changed.outcome, "amendment-required");
    assert.equal(changed.receipt.id, first.receipt.id);
    const [saved] = await sql`select details from club_waivers where athlete_id=${athlete.id}`;
    assert.equal(saved.details.emergencyPhone, "555-0101");
    assert.equal((await api.myWaivers("guardian")).length, 1);
    await assert.rejects(api.signWaiver("coach", waiver), /household/);
    await sql`update club_waivers set signed_at=now()+interval '1 day' where id=${first.receipt.id}`;
    assert.equal((await rosterWaiver(sql, "base", "base-player")).current, false);
    await sql`update club_waivers set signed_at=now()-interval '2 years' where id=${first.receipt.id}`;
    assert.equal((await rosterWaiver(sql, "base", "base-player")).current, false);
    await sql`update club_waivers set signed_at=now() where id=${first.receipt.id}`;
    await sql`insert into club_athletes(id,household_email,name) values('other-child','guardian@example.invalid','Synthetic Sibling')`;
    await sql`update team_dev_roster_links set athlete_id='other-child' where id='synthetic-link'`;
    assert.equal((await rosterWaiver(sql, "base", "base-player")).status, "review-required");
    assert.equal((await enrollmentCase(sql, "guardian", key)).summary.waiverCurrent, false);
    await sql`update team_dev_roster_links set ended_at=now() where id='synthetic-link'`;
    assert.equal((await rosterWaiver(sql, "base", "base-player")).current, true);
    await sql`insert into club_households(id,primary_email) values('other-home','other@example.invalid')`;
    await sql`update club_athletes set household_id='other-home' where id=${athlete.id}`;
    assert.equal((await rosterWaiver(sql, "base", "base-player")).status, "review-required");
    assert.equal((await rosterWaiver(sql, "soft", "soft-player")).status, "missing");
    await sql`insert into club_staff(id,user_id,name,email,role,active) values('synthetic-inactive','coach','Synthetic Coach','coach@example.invalid','coach',false)`;
    const scope = await enrollmentScope(sql, "coach");
    assert.equal(scope.teams.find((t) => t.id === "base")?.canManage, undefined);
    assert.equal((await api.clubIdentity("coach")).canTeamCoach, false);
    await assert.rejects(teamWaiverReadiness(sql, "coach", "base"));
    await sql`insert into household_members(household_id,user_id) values(${identity.billingHouseholdIds[0]},'coach')`;
    const parentCoach = await enrollmentScope(sql, "coach");
    assert.equal(parentCoach.teams[0].canManage, false);
    assert.deepEqual(parentCoach.teams[0].guardianPlayerIds, ["base-player"]);
  } finally {
    await h.close();
  }
});
