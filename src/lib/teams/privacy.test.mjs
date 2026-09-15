// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coachHoldsTeam, familyHoldsPlayer, fetchPlayerRecord, fetchTeamRecord, mergeSave, scopeClub } from "./privacy.ts";

function club() {
  const cade = {
    id: "p-cade",
    teamId: "t-13u-navy",
    familyId: "fam-cade",
    name: "Cade Redmond",
    number: "7",
    positions: ["SS"],
    bats: "R",
    throws: "R",
    gradYear: "2031",
    school: "BA",
    height: "5'8\"",
    weight: "140",
    email: "cade@example.com",
    parents: [{ name: "Ty Redmond", rel: "Father", phone: "918-555-0101", email: "ty@prospectsbaseball.club" }],
    roleType: "full",
    coachChild: true,
    joinedOn: "2026-09-01",
    withdrawn: false,
    agreement: { version: "1", signedBy: "Ty", signedAt: "2026-09-01" },
    feeLock: { amount: 2400, lockedAt: "2026-09-01", policyVersion: "1", components: {} },
    planLock: { dep: 250, deadline: "2027-02-01", planType: "monthly", rows: [] },
    credits: [{ label: "Coach pay", amount: 400 }],
    payments: [{ date: "2026-09-01", amount: 250, fee: 0, charged: 250, method: "ach", label: "Deposit", receipt: "R-1" }],
    cards: [{ brand: "Visa", last4: "4242", exp: "09/29", primary: true }],
    planType: "monthly",
    depositPaid: true,
    uniformWaived: false,
    order: { number: "7", sizes: {}, submitted: true },
    docs: { waiver: true, birthCert: true, insurance: true, physical: true },
    emergency: { allergies: "", conditions: "", insurer: "BCBS", policyNo: "1", physician: "Dr", pickup: ["Ty"], notes: "" },
    publicProfile: { enabled: false, bio: "", slug: "" },
    prefs: { email: true, sms: true },
    reenroll: false,
    cageOverage: 0,
    stats: {},
    rsvp: {},
  };
  const other = {
    ...cade,
    id: "p-other",
    familyId: "fam-other",
    name: "Other Kid",
    email: "other@example.com",
    payments: [{ date: "2026-09-01", amount: 100, fee: 0, charged: 100, method: "card", label: "Deposit", receipt: "R-2" }],
    parents: [{ name: "Dana Other", rel: "Mother", phone: "918-555-0199", email: "dana@example.com" }],
  };
  const team = {
    id: "t-13u-navy",
    name: "13U Navy",
    sport: "baseball",
    age: "13U",
    level: "Open",
    seasonLabel: "Spring 2027",
    seasonStart: "2027-02-01",
    seasonEnd: "2027-07-15",
    months: 6,
    headCoach: "Ty Redmond",
    coachEmail: "ty@prospectsbaseball.club",
    staff: [
      {
        id: "st-ty",
        name: "Ty Redmond",
        role: "Head coach",
        monthly: 1500,
        childId: "p-cade",
        applyAmount: 400,
        w9: true,
        backgroundCheck: true,
        safeSport: true,
        expires: "2027-03-01",
        email: "ty@prospectsbaseball.club",
      },
    ],
    uniformPackageId: "heritage-bb",
    uniformDeadline: "2026-11-15",
    orgFee: 450,
    coachMonthly: 1500,
    eventBudget: 3600,
    tournamentIds: [],
    otherCosts: { insurance: 400, balls: 250, fields: 800, admin: 200, travel: 900 },
    teamCageHoursPerWeek: 4,
    playerCageHoursPerWeek: 1,
    record: { w: 4, l: 2, t: 0 },
    roster: [cade, other],
    practices: [],
    messages: [],
    announcements: [],
    attendance: {},
    pitchLog: [],
    closed: false,
    notes: "",
  };
  const foreign = {
    ...team,
    id: "t-foreign",
    name: "14U Maroon",
    coachEmail: "someone-else@example.com",
    staff: [{ ...team.staff[0], id: "st-x", email: "someone-else@example.com" }],
    roster: [{ ...other, id: "p-foreign", teamId: "t-foreign", familyId: "fam-foreign" }],
  };
  return {
    settings: {
      contingencyPct: 0.15,
      membershipMonthly: 200,
      facilityMonthly: 500,
      fundingPlayers: 10,
      cardFeePct: 0.03,
      orgFeeFloor: 300,
      orgFeeCeiling: 750,
      coachPayMin: 1250,
      coachPayMax: 2000,
      cageHourly: 45,
      roundTo: 25,
      policyVersion: "1",
    },
    teams: [team, foreign],
    catalog: [],
    uniforms: [],
    leads: [{ id: "l1", name: "Lead", age: "13U", stage: "lead", grades: {}, teamId: team.id }],
    alumni: [],
    notifications: [],
    audit: [{ at: "2026-09-01", action: "note", detail: "secret" }],
    onboarding: { started: true },
    _rev: 1,
    _savedAt: "2026-09-01",
    _demo: true,
  };
}

describe("Fetch-time scope — ClubRecord", () => {
  it("strips payment keys from a coach response and hides other teams", () => {
    const raw = club();
    const scoped = scopeClub(raw, "coach", { email: "ty@prospectsbaseball.club", familyId: "fam-x" });
    assert.equal(scoped.teams.length, 1);
    assert.equal(scoped.teams[0].id, "t-13u-navy");
    for (const player of scoped.teams.flatMap((t) => t.roster)) {
      assert.equal(Object.prototype.hasOwnProperty.call(player, "payments"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(player, "cards"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(player, "feeLock"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(player, "planLock"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(player, "credits"), false);
    }
  });

  it("strips payment keys from a player response and keeps only their family", () => {
    const raw = club();
    const scoped = scopeClub(raw, "player", { email: "cade@example.com", familyId: "fam-cade" });
    assert.ok(scoped.teams.every((t) => t.roster.some((p) => p.familyId === "fam-cade")));
    const mine = scoped.teams.flatMap((t) => t.roster).find((p) => p.id === "p-cade");
    assert.ok(mine);
    assert.equal(Object.prototype.hasOwnProperty.call(mine, "payments"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(mine, "feeLock"), false);
  });

  it("a parent save cannot rewrite another family's player", () => {
    const raw = club();
    const incoming = structuredClone(raw);
    const target = incoming.teams[0].roster.find((p) => p.id === "p-other");
    target.docs = { waiver: true, birthCert: true, insurance: true, physical: true };
    const merged = mergeSave(raw, incoming, "parent", { email: "ty@prospectsbaseball.club", familyId: "fam-cade" });
    const kept = merged.teams[0].roster.find((p) => p.id === "p-other");
    assert.deepEqual(kept.docs, raw.teams[0].roster.find((p) => p.id === "p-other").docs);
  });

  it("coachHoldsTeam and familyHoldsPlayer are the fetch gates", () => {
    const raw = club();
    assert.equal(coachHoldsTeam(raw, "ty@prospectsbaseball.club", "t-13u-navy"), true);
    assert.equal(coachHoldsTeam(raw, "not-a-coach@example.com", "t-13u-navy"), false);
    assert.equal(familyHoldsPlayer(raw, "fam-cade", "p-cade"), true);
    assert.equal(familyHoldsPlayer(raw, "fam-other", "p-cade"), false);
  });

  it("a crafted roster request returns null for another coach's team", () => {
    const raw = club();
    const me = { email: "ty@prospectsbaseball.club", familyId: "fam-cade" };
    assert.equal(fetchTeamRecord(raw, "coach", me, "t-foreign"), null);
    const mine = fetchTeamRecord(raw, "coach", me, "t-13u-navy");
    assert.ok(mine);
    assert.equal(Object.prototype.hasOwnProperty.call(mine.roster[0], "payments"), false);
  });

  it("a crafted player request returns null for another family's kid", () => {
    const raw = club();
    const me = { email: "ty@prospectsbaseball.club", familyId: "fam-cade" };
    assert.equal(fetchPlayerRecord(raw, "parent", me, "p-other"), null);
    assert.equal(fetchPlayerRecord(raw, "parent", me, "p-foreign"), null);
    const mine = fetchPlayerRecord(raw, "parent", me, "p-cade");
    assert.ok(mine);
    assert.equal(mine.id, "p-cade");
  });
});
