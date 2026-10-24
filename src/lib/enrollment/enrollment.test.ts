import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture, preparePilot } from "./test-fixture";
import {
  configurePilot,
  enrollmentCase,
  enrollmentHome,
  getMedical,
  saveMedical,
  signPacket,
  saveMedia,
  mediaFor,
  reportSafety,
  safetyReports,
  requirePilotAcknowledgment,
} from "./enrollment.server";
import { enrollmentFinance, clearEnrollment } from "./financial.server";
import { handbookWorkspace, saveHandbook } from "./handbooks.server";
import { emptyReview } from "./contracts";

test("pilot enrollment preserves financial terms and enforces guardian signatures, medical privacy and scoped status access", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await assert.rejects(
      configurePilot(sql, "owner", {
        teamId: "base",
        seasonKey: "2027",
        revision: 0,
        signaturesOpen: true,
      }),
      /Publish/,
    );
    await preparePilot(sql);
    const before = JSON.stringify(
      (await sql<{ payload: unknown }>`select payload from club_state`)[0].payload,
    );
    const key = { teamId: "base", playerId: "base-player" };
    let c = await enrollmentCase(sql, "guardian", key);
    assert.equal(c.packet.ready, true);
    const sign = {
      ...key,
      packetDigest: c.packet.digest,
      signerName: "Synthetic Guardian",
      guardian: true,
      electronicConsent: true,
      conductDiscussed: true,
      medicalAuthorization: true,
    };
    await assert.rejects(signPacket(sql, "player", sign), /guardian/);
    await assert.rejects(signPacket(sql, "coach", sign), /guardian/);
    await assert.rejects(enrollmentCase(sql, "stranger", key), /available/);
    await assert.rejects(
      requirePilotAcknowledgment(sql, "guardian", "base", "base-player"),
      /Review and sign/,
    );
    await signPacket(sql, "guardian", sign);
    await signPacket(sql, "guardian", sign);
    await requirePilotAcknowledgment(sql, "guardian", "base", "base-player");
    assert.equal((await enrollmentCase(sql, "guardian", key)).signatures.length, 1);
    await saveMedical(sql, "guardian", {
      ...key,
      revision: 0,
      emergencyName: "Synthetic Emergency",
      emergencyPhone: "555-010-0010",
      medicalAlerts: "Private test alert",
      restrictions: "Private test restriction",
      accuracyConfirmed: true,
    });
    await assert.rejects(getMedical(sql, "coach", key), /restricted/);
    const staff = await enrollmentCase(sql, "coach", key);
    assert.equal(staff.summary.medicalComplete, true);
    assert.equal(staff.canViewFinancial, false);
    assert.deepEqual(staff.signatures, []);
    assert.ok(!JSON.stringify(staff).includes("Private test"));
    const soft = { teamId: "soft", playerId: "soft-player" };
    await enrollmentCase(sql, "guardian", soft);
    assert.equal((await enrollmentHome(sql, "coordinator")).candidates.length, 1);
    await assert.rejects(enrollmentCase(sql, "coordinator", key), /available/);
    await assert.rejects(getMedical(sql, "coordinator", soft), /restricted/);
    await assert.rejects(enrollmentFinance(sql, "coordinator", soft));
    await assert.rejects(enrollmentFinance(sql, "coach", key), /guardian|owner/i);
    assert.equal((await enrollmentFinance(sql, "guardian", key)).depositSatisfied, false);
    await saveMedia(sql, "guardian", { ...key, consent: true, signerName: "Synthetic Guardian" });
    await saveMedia(sql, "guardian", { ...key, consent: false, signerName: "Synthetic Guardian" });
    assert.equal((await mediaFor(sql, "guardian", key))?.consent, false);
    assert.equal((await sql`select * from enrollment_media_history`).length, 2);
    await reportSafety(sql, "guardian", {
      ...key,
      concerning: "other",
      body: "Synthetic confidential concern",
    });
    await assert.rejects(safetyReports(sql, "coach"), /Owner/);
    await assert.rejects(safetyReports(sql, "coordinator"), /Owner/);
    assert.equal((await safetyReports(sql, "owner")).length, 1);
    const d = (await handbookWorkspace(sql, "owner")).documents.find(
      (d) => d.documentId === "academy-2027",
    )!;
    await saveHandbook(sql, "owner", {
      documentId: d.documentId,
      version: d.version,
      revision: d.revision,
      action: "publish",
      effectiveOn: d.effectiveOn,
      content: { ...d.content, title: "Next unsigned version" },
      review: emptyReview,
    });
    c = await enrollmentCase(sql, "guardian", key);
    assert.equal(c.summary.acknowledgmentUpdate, true);
    assert.equal(c.signatures[0].packet[0].content.title, d.content.title);
    assert.equal(
      JSON.stringify((await sql<{ payload: unknown }>`select payload from club_state`)[0].payload),
      before,
    );
    assert.equal(club.teams.length, 2);
    await assert.rejects(sql`delete from enrollment_signatures`, /append-only/);
    await assert.rejects(sql`truncate enrollment_media_history`, /append-only/);
  } finally {
    await db.close();
  }
});

test("readiness requires reconciled production Square evidence and current requirements; refunds remove clearance", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await preparePilot(sql);
    const key = { teamId: "base", playerId: "base-player" };
    const c = await enrollmentCase(sql, "guardian", key);
    await signPacket(sql, "guardian", {
      ...key,
      packetDigest: c.packet.digest,
      signerName: "Synthetic Guardian",
      guardian: true,
      electronicConsent: true,
      conductDiscussed: true,
      medicalAuthorization: true,
    });
    await saveMedical(sql, "guardian", {
      ...key,
      revision: 0,
      emergencyName: "Synthetic Emergency",
      emergencyPhone: "555-010-0010",
      medicalAlerts: "",
      restrictions: "",
      accuracyConfirmed: true,
    });
    await sql`insert into club_athletes(id,household_email,name) values('athlete-base','guardian@example.invalid','Synthetic Athlete')`;
    await sql`insert into team_dev_roster_links(id,team_id,roster_player_id,athlete_id) values('link-base','base','base-player','athlete-base')`;
    await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,consent_text) values('waiver','guardian','athlete-base','synthetic','Synthetic Guardian','Synthetic fixture only')`;
    const p = club.teams[0].roster[0];
    p.feeLock = {
      amount: 1000,
      lockedAt: new Date().toISOString(),
      policyVersion: "synthetic",
      components: {},
    };
    p.planLock = {
      dep: 700,
      deadline: "2027-01-01",
      planType: "70/15/15",
      rows: [
        { date: "2027-02-01", amount: 150 },
        { date: "2027-03-01", amount: 150 },
      ],
    };
    p.agreement = {
      version: "preserved-original",
      signedBy: "Synthetic Guardian",
      signedAt: new Date().toISOString(),
    };
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_environment,square_payment_id) values('order','order','guardian@example.invalid','team','team-fee',${JSON.stringify({ teamFee: { ...key, lockedAt: p.feeLock.lockedAt } })}::jsonb,70000,'paid','sandbox','payment')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values('payment','order','sandbox',70000,'COMPLETED')`;
    assert.equal((await enrollmentFinance(sql, "guardian", key)).verifiedCents, 0);
    await sql`update square_payments set environment='production' where id='payment'`;
    await sql`update commerce_orders set payment_environment='production' where id='order'`;
    assert.equal((await enrollmentFinance(sql, "guardian", key)).verifiedCents, 0);
    p.payments = [
      {
        date: "2026-10-24",
        amount: 700,
        fee: 0,
        charged: 700,
        method: "Square website",
        label: "Square: payment",
        receipt: "synthetic receipt",
      },
    ];
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    const ready = await enrollmentFinance(sql, "guardian", key);
    assert.equal(ready.verifiedCents, 70000);
    assert.equal(ready.agreementVersion, "preserved-original");
    await sql`update commerce_orders set snapshot=jsonb_set(snapshot,'{teamFee,lockedAt}','"other-agreement"') where id='order'`;
    assert.equal((await enrollmentFinance(sql, "guardian", key)).verifiedCents, 0);
    await sql`update commerce_orders set snapshot=jsonb_set(snapshot,'{teamFee,lockedAt}',${JSON.stringify(p.feeLock.lockedAt)}::jsonb) where id='order'`;
    const approval = { ...key, medicalReviewed: true, reason: "Synthetic owner checklist review" };
    await assert.rejects(clearEnrollment(sql, "coach", approval), /Steve|Nolan/);
    await clearEnrollment(sql, "owner", approval);
    assert.ok((await enrollmentCase(sql, "coach", key)).summary.clearedAt);
    await sql`update square_payments set refunded_cents=10000 where id='payment'`;
    assert.equal((await enrollmentFinance(sql, "guardian", key)).verifiedCents, 60000);
    assert.equal((await enrollmentCase(sql, "coach", key)).summary.clearedAt, null);
    await assert.rejects(clearEnrollment(sql, "owner", approval), /verified/);
  } finally {
    await db.close();
  }
});
