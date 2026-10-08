import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coachHoldsTeam, familyHoldsPlayer, fetchPlayerRecord, fetchPlayerRecordForTeam, fetchTeamRecord, mergeSave, scopeClub } from "./privacy.ts";

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

it('v2: a colliding family identifier does not reveal or edit an unrelated household',()=>{
 const raw=club(),me={email:'ty@prospectsbaseball.club',familyId:'fam-cade'};
 raw.teams[0].roster[1].familyId='fam-cade';
 raw.teams[1].roster[0].familyId='fam-cade';
 raw.notifications=[{id:'secret',teamId:'t-foreign',audience:'admin',body:'Private staff note'},{id:'family',teamId:'t-13u-navy',audience:'family',body:'Practice'}];
 const scoped=scopeClub(raw,'parent',me);
 assert.deepEqual(scoped.teams.map(t=>t.id),['t-13u-navy']);
 assert.deepEqual(scoped.teams[0].roster.map(p=>p.id),['p-cade']);
 assert.deepEqual(scoped.notifications.map(n=>n.id),[]); // Unaddressed "family" notices are private, not a team broadcast.
 const incoming=structuredClone(raw);incoming.teams[0].roster[1].order.number='99';
 assert.equal(mergeSave(raw,incoming,'parent',me).teams[0].roster[1].order.number,'7');
});
it('v2: persisted guardian membership authorizes only its linked household',()=>{
 const raw=club(),me={email:'second-guardian@example.invalid',familyId:'not-used',familyIds:['fam-cade']};
 assert.deepEqual(scopeClub(raw,'parent',me).teams[0].roster.map(p=>p.id),['p-cade']);
 assert.equal(fetchPlayerRecord(raw,'parent',me,'p-other'),null);
 assert.equal(scopeClub(raw,'parent',{...me,familyIds:[]}).teams.length,0);
});
it('v2: browser saves cannot replace administrative audit history',()=>{
 const raw=club(),incoming={...structuredClone(raw),audit:[]};
 assert.deepEqual(mergeSave(raw,incoming,'admin',{email:'owner@example.invalid',familyId:''}).audit,raw.audit);
});

it('linked players see and edit their own roster record, while guardians retain sibling access',()=>{
 const raw=club(),me={email:'  CADE@example.com ',familyId:'fam-cade',familyIds:['fam-cade']};
 raw.teams[0].roster[1].familyId='fam-cade';raw.teams[1].roster[0].familyId='fam-cade';
 const scoped=scopeClub(raw,'player',me);
 assert.deepEqual(scoped.teams.map(t=>t.id),['t-13u-navy']);
 assert.deepEqual(scoped.teams[0].roster.map(p=>p.id),['p-cade']);
 assert.equal(fetchTeamRecord(raw,'player',me,'t-foreign'),null);
 assert.equal(fetchPlayerRecord(raw,'player',me,'p-other'),null);
 assert.equal(fetchPlayerRecord(raw,'player',me,'p-cade').id,'p-cade');
 assert.equal(scopeClub(raw,'player',{...me,email:''}).teams.length,0);
 const incoming=structuredClone(raw);for(const t of incoming.teams)for(const p of t.roster)p.rsvp={practice:'yes'};
 const changed=mergeSave(raw,incoming,'player',me);
 assert.deepEqual(changed.teams[0].roster[0].rsvp,{practice:'yes'});
 assert.deepEqual(changed.teams[0].roster[1].rsvp,{});
 assert.deepEqual(changed.teams[1].roster[0].rsvp,{});
 assert.equal(scopeClub(raw,'parent',{...me,email:'guardian@example.invalid'}).teams.flatMap(t=>t.roster).length,3);
});

it('player RSVPs cannot publish a public profile; guardians retain publication controls',()=>{
 const raw=club(),incoming=structuredClone(raw),me={email:'cade@example.com',familyId:'fam-cade',familyIds:['fam-cade']};
 incoming.teams[0].roster[0].publicProfile={enabled:true,bio:'Forged public bio',slug:'public-player'};
 incoming.teams[0].roster[0].rsvp={practice:'yes'};
 const player=mergeSave(raw,incoming,'player',me).teams[0].roster[0];
 assert.deepEqual(player.publicProfile,raw.teams[0].roster[0].publicProfile);
 assert.deepEqual(player.rsvp,{practice:'yes'});
 const parent=mergeSave(raw,incoming,'parent',{...me,email:'guardian@example.invalid'}).teams[0].roster[0];
 assert.deepEqual(parent.publicProfile,incoming.teams[0].roster[0].publicProfile);
});

it("v3: private family notices require a matching recipient and team", () => {
 const raw=club(),me={email:"ty@prospectsbaseball.club",familyId:"fam-cade",familyIds:["fam-cade"]};
 raw.notifications=[
  {id:"broadcast",ts:"2026-10-08",teamId:"t-13u-navy",kind:"practice",title:"Practice",body:"Open for all",audience:"all"},
  {id:"ours",ts:"2026-10-08",teamId:"t-13u-navy",kind:"family",title:"Family",body:"Our private note",audience:"family",recipientFamilyId:"fam-cade"},
  {id:"theirs",ts:"2026-10-08",teamId:"t-13u-navy",kind:"family",title:"Family",body:"Other private note",audience:"family",recipientFamilyId:"fam-other"},
  {id:"unaddressed",ts:"2026-10-08",teamId:"t-13u-navy",kind:"family",title:"Legacy",body:"May belong to anyone",audience:"family"},
  {id:"coach",ts:"2026-10-08",teamId:"t-13u-navy",kind:"staff",title:"Coach",body:"Staff only",audience:"coach"},
  {id:"foreign",ts:"2026-10-08",teamId:"t-foreign",kind:"family",title:"Family",body:"Wrong team",audience:"family",recipientFamilyId:"fam-cade"},
 ];
 const p=scopeClub(raw,"parent",me),player=scopeClub(raw,"player",{email:"cade@example.com",familyId:"fam-cade",familyIds:["fam-cade"]});
 assert.deepEqual(p.notifications.map(n=>n.id),["broadcast","ours"]);
 assert.deepEqual(player.notifications.map(n=>n.id),["broadcast","ours"]);
 assert.deepEqual(scopeClub(raw,"coach",me).notifications.map(n=>n.id),["broadcast","coach"]);
 assert.equal(scopeClub(raw,"admin",me).notifications.length,6);
 assert.deepEqual(scopeClub(raw,"parent",{...me,familyIds:[]}).notifications,[]);
});

it("v3: the player endpoint cannot mix an authorized player ID with a foreign team ID", () => {
 const raw=club(),parent={email:"ty@prospectsbaseball.club",familyId:"fam-cade",familyIds:["fam-cade"]};
 const player={email:"cade@example.com",familyId:"fam-cade",familyIds:["fam-cade"]};
 const coach={email:"ty@prospectsbaseball.club",familyId:"fam-cade"};
 for(const [role,who] of [["parent",parent],["player",player],["coach",coach],["admin",parent]]) {
  assert.equal(fetchPlayerRecordForTeam(raw,role,who,"t-foreign","p-cade"),null);
  assert.equal(fetchPlayerRecordForTeam(raw,role,who,"t-13u-navy","p-foreign"),null);
  assert.equal(fetchPlayerRecordForTeam(raw,role,who,"t-13u-navy","p-cade")?.id,"p-cade");
 }
 assert.equal(fetchPlayerRecordForTeam(raw,"parent",parent,"t-13u-navy","p-other"),null);
});

it("v4: coaches retain their own pay but not coworkers' payroll or owner budgets",()=>{
 const raw=club();
 const team=raw.teams[0];
 team.staff.push({
  ...team.staff[0],id:"st-colleague",email:"colleague@example.com",
  name:"Colleague",monthly:2300,applyAmount:450,childId:"p-other",
  w9:true,backgroundCheck:true,safeSport:true,expires:"2027-08-01",
 });
 const coach=scopeClub(raw,"coach",{email:"ty@prospectsbaseball.club",familyId:"fam-cade"});
 assert.equal(coach.teams.length,1);
 const scoped=coach.teams[0];
 const mine=scoped.staff.find(s=>s.id==="st-ty");
 const other=scoped.staff.find(s=>s.id==="st-colleague");
 assert.equal(mine.monthly,1500);
 assert.equal(mine.w9,true);
 assert.equal(other.monthly,0);
 assert.equal(other.applyAmount,0);
 assert.equal(other.childId,"");
 assert.equal(other.w9,false);
 assert.equal(other.backgroundCheck,false);
 assert.equal(other.safeSport,false);
 assert.equal(other.expires,"");
 assert.equal(scoped.orgFee,0);
 assert.equal(scoped.coachMonthly,0);
 assert.equal(scoped.eventBudget,0);
 assert.ok(Object.values(scoped.otherCosts).every(v=>v===0));
 const admin=scopeClub(raw,"admin",{email:"owner@example.com",familyId:""});
 assert.equal(admin.teams[0].staff[1].monthly,2300);
 assert.equal(admin.teams[0].eventBudget,3600);
});

it("v5: parent and player team snapshots never expose another athlete's pitch or attendance data, or coach notes", () => {
 const raw=club(),team=raw.teams[0];
 team.notes="Staff only: confidential performance and placement comments";
 team.messages=[{id:"staff-chat",at:"2026-10-08",from:"Coach",body:"Coach-only note about another family"}];
 team.announcements=[{id:"team-broadcast",title:"Practice",body:"Team practice",pin:false,arrive:"",uniform:"",hotel:""}];
 team.attendance={practice1:{"p-cade":"present","p-other":"absent"}};
 team.pitchLog=[
  {id:"outing-cade",playerId:"p-cade",date:"2026-10-08",pitches:27},
  {id:"outing-other",playerId:"p-other",date:"2026-10-08",pitches:90},
 ];
 const family={email:"ty@prospectsbaseball.club",familyId:"fam-cade",familyIds:["fam-cade"]};
 for(const [role,identity] of [
  ["parent",family],
  ["player",{email:"cade@example.com",familyId:"fam-cade",familyIds:["fam-cade"]}],
 ]) {
  const scoped=scopeClub(raw,role,identity).teams[0];
  assert.equal(scoped.notes,"");
  assert.deepEqual(scoped.messages,[]);
  assert.deepEqual(scoped.announcements,team.announcements);
  assert.deepEqual(scoped.attendance,{practice1:{"p-cade":"present"}});
  assert.deepEqual(scoped.pitchLog.map(row=>row.playerId),["p-cade"]);
  assert.deepEqual(scoped.roster.map(row=>row.id),["p-cade"]);
 }
 const admin=scopeClub(raw,"admin",family).teams[0];
 assert.equal(admin.notes,team.notes);
 assert.equal(admin.messages.length,1);
 assert.equal(admin.pitchLog.length,2);
 const coach=scopeClub(raw,"coach",family).teams[0];
 assert.equal(coach.pitchLog.length,2);
 assert.equal(coach.attendance.practice1["p-other"],"absent");
});
