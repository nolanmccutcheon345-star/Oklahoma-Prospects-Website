import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { enrollmentFixture, prepareOrganization } from "./test-fixture";
import { enrollmentHome, enrollmentCase, signPacket } from "./enrollment.server";
import { publicHandbooks, handbookWorkspace } from "./handbooks.server";

test("authorized release publishes versioned policies and activates the real academy without financial, permission or fabricated review changes", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const source = await readFile("migrations/0108_organization_enrollment.sql", "utf8");
    const publication = source
      .split("-- BEGIN OWNER AUTHORIZED PUBLICATION\n")[1]
      .split("-- END OWNER AUTHORIZED PUBLICATION")[0];
    // Unknown/fake admin is not the academy owner's release authorization.
    await db.exec(publication);
    assert.equal((await publicHandbooks(sql)).length, 0);
    await sql`update owner_grants set user_id=null where user_id='owner'`;
    await sql`update "user" set email='stevemccutcheon89@gmail.com' where id='owner'`;
    await sql`update owner_grants set user_id='owner' where email='stevemccutcheon89@gmail.com'`;
    const before = JSON.stringify((await sql`select payload,rev from club_state`)[0]);
    const permissions = JSON.stringify(await sql`select * from coordinator_assignments`);
    await db.exec(publication);
    await db.exec(publication); // Reapplying only the guarded directive cannot republish or reopen settings.
    const h = await enrollmentHome(sql, "owner");
    assert.equal(h.settings.activationBasis, "owner-directed");
    assert.equal(h.settings.allTeamsEnabled, true);
    assert.equal(h.settings.safetyContact, "stevemccutcheon89@gmail.com");
    assert.equal(h.settings.alternateContact, "nolanmccutcheon@icloud.com");
    assert.equal((await publicHandbooks(sql)).length, 5);
    const published = (await handbookWorkspace(sql, "owner")).documents.filter(
      (d) => d.status === "published",
    );
    assert.equal(published.length, 5);
    assert.ok(published.every((d) => !d.review.legalReviewer && !d.review.insuranceReviewer));
    assert.equal((await sql`select * from enrollment_pilots`).length, 0);
    assert.equal((await sql`select * from enrollment_signatures`).length, 0);
    assert.equal((await sql`select * from enrollment_concussion_acknowledgments`).length, 0);
    assert.equal(JSON.stringify((await sql`select payload,rev from club_state`)[0]), before);
    assert.equal(JSON.stringify(await sql`select * from coordinator_assignments`), permissions);
    const c = await enrollmentCase(sql, "guardian", { teamId: "base", playerId: "base-player" });
    assert.equal(c.packet.ready, true);
    assert.equal(c.pilot.signaturesOpen, true);
    assert.equal(c.summary.clearedAt, null);
    assert.equal(c.summary.concussionCurrent, false);
    await assert.rejects(
      sql`update handbook_versions set content='{}' where status='published'`,
      /immutable/,
    );
    const audit = await sql<{
      details: { externalLegalApproval: boolean; externalInsuranceApproval: boolean };
    }>`select details from handbook_audit where id='organization-2026-10-24:activation'`;
    assert.equal(audit[0].details.externalLegalApproval, false);
    assert.equal(audit[0].details.externalInsuranceApproval, false);
  } finally {
    await db.close();
  }
});

test("annual concussion acknowledgment requires guardian and athlete action, excludes expired/future records and protects signed history", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    await prepareOrganization(sql);
    const key = { teamId: "base", playerId: "base-player" };
    const c = await enrollmentCase(sql, "guardian", key);
    for (const [id, interval] of [
      ["old", "-366 days"],
      ["future", "1 day"],
    ]) {
      await sql`insert into enrollment_concussion_acknowledgments(id,case_id,guardian_id,guardian_name,athlete_name,materials_version,materials,statement,acknowledged_at) values(${id},${c.summary.id},'guardian','Synthetic Guardian','Synthetic athlete','old','{"facts":[],"resources":[]}', 'Synthetic historical acknowledgment',now()+${interval}::interval)`;
    }
    assert.equal((await enrollmentCase(sql, "guardian", key)).summary.concussionCurrent, false);
    const sign = {
      ...key,
      packetDigest: c.packet.digest,
      signerName: "Synthetic Guardian",
      guardian: true,
      electronicConsent: true,
      conductDiscussed: true,
      medicalAuthorization: true,
      concussionAcknowledged: true,
      athleteAcknowledged: true,
      athleteSignerName: "Private athlete acknowledgment canary",
    };
    await assert.rejects(signPacket(sql, "guardian", { ...sign, athleteAcknowledged: false }));
    await assert.rejects(signPacket(sql, "coach", sign), /guardian/);
    await signPacket(sql, "guardian", sign);
    await signPacket(sql, "guardian", sign);
    const own = await enrollmentCase(sql, "guardian", key);
    assert.equal(own.summary.concussionCurrent, true);
    assert.equal(own.concussionAcknowledgments.length, 3);
    const coach = await enrollmentCase(sql, "coach", key);
    assert.equal(coach.summary.concussionCurrent, true);
    assert.deepEqual(coach.concussionAcknowledgments, []);
    assert.ok(!JSON.stringify(coach).includes("Private athlete acknowledgment canary"));
    await assert.rejects(sql`delete from enrollment_concussion_acknowledgments`, /append-only/);
    await assert.rejects(sql`truncate enrollment_concussion_acknowledgments`, /append-only/);
  } finally {
    await db.close();
  }
});
