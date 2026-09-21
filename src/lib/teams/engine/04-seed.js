/* Prospects Team Management OS — paste block 5 of 5: seed data and the empty club
   Use verbatim. Full entity shapes. seedState() is sample data; emptyState() is what a real club starts from. */

import { TODAY, addDays, iso, uid } from "./00-helpers.js";
import { CATALOG, FIRST, LAST, POS, SB_FIRST, SCHOOLS, T, UNIFORMS } from "./01-catalog.js";
import { lockFee, lockPlan } from "./02-pricing.js";

function mkPlayer(i, sport, gradBase, teamId, seedNum) {
 const first = sport === "softball" ? SB_FIRST[i % SB_FIRST.length] : FIRST[i % FIRST.length];
 const last = LAST[(i * 3 + 2) % LAST.length];
 const name = `${first} ${last}`;
 const isPitcher = i % 4 === 0;
 return {
  id: uid(),
  teamId,
  name,
  number: seedNum,
  positions: POS[i % POS.length],
  bats: i % 3 === 0 ? "L" : "R",
  throws: i % 5 === 0 ? "L" : "R",
  gradYear: gradBase + (i % 3),
  school: SCHOOLS[(i * 2) % SCHOOLS.length],
  height: `5'${8 + (i % 5)}"`,
  weight: 140 + i * 4,
  email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
  parents: [
   { name: `${LAST[(i * 5) % LAST.length] === last ? "Dana" : "Megan"} ${last}`, rel: "Mother", phone: `918-555-0${100 + i}`, email: `parent${i}.${last.toLowerCase()}@example.com` },
   { name: `${FIRST[(i * 7) % FIRST.length]} ${last}`, rel: "Father", phone: `918-555-0${200 + i}`, email: `dad${i}.${last.toLowerCase()}@example.com` },
  ],
  familyId: `fam-${teamId}-${i % 9}`,
  roleType: i === 7 ? "po" : "full",
  coachChild: i === 0 ? "head" : null,
  joinedOn: null,
  withdrawn: null,
  credits: i === 2 ? [{ id: uid(), type: "sponsorship", amount: 250, note: "Cordova Roofing banner", date: iso(addDays(TODAY, -20)) }] : [],
  agreement: i % 8 === 7 ? null : { version: 1, signedBy: `Parent of ${first} ${last}`, signedAt: iso(addDays(TODAY, -30)) },
  prefs: { email: true, sms: true },
  feeLock: null,
  amendments: [],
  emergency: {
   allergies: i % 6 === 2 ? "Peanuts — carries an EpiPen in the bat bag" : "",
   conditions: i % 9 === 4 ? "Exercise-induced asthma — inhaler in bag" : "",
   insurer: "Blue Cross Blue Shield OK",
   policyNo: `OK${430000 + i * 37}`,
   physician: "Dr. Whitfield, Broken Arrow Pediatrics · 918-555-0190",
   pickup: [`${LAST[(i * 3 + 2) % LAST.length]} grandparents`],
   notes: "",
  },
  publicProfile: { enabled: i % 4 === 0, bio: "", video: [], slug: "" },
  reenroll: null,
  uniformWaived: false,
  docs: { waiver: i % 5 !== 4, birthCert: i % 7 !== 6, insurance: i % 4 !== 3, physical: i % 6 !== 5 },
  order: { number: seedNum, sizes: {}, submitted: i % 3 !== 2 },
  depositPaid: i % 6 !== 5,
  planType: i % 2 === 0 ? "monthly" : "full",
  cards: i % 6 === 5 ? [] : [
   { id: uid(), brand: ["Visa", "Mastercard", "Amex"][i % 3], last4: String(4000 + i * 7).slice(-4), exp: `0${(i % 9) + 1}/29`, primary: true },
   { id: uid(), brand: "Visa", last4: String(9000 + i * 3).slice(-4), exp: `1${(i % 2) + 1}/28`, primary: false },
  ],
  payments: [],
  cageOverage: 0,
  stats: {
   gp: 18 + (i % 8),
   ab: 52 + i * 2,
   h: 16 + i,
   hr: i % 4,
   rbi: 9 + i,
   bb: 6 + (i % 7),
   k: 8 + (i % 9),
   sb: i % 6,
   avg: 0,
   obp: 0,
   ops: 0,
   ev: 78 + i,
   pop: isPitcher ? null : (1.9 + (i % 5) / 50).toFixed(2),
   velo: isPitcher ? 72 + i : null,
   ip: isPitcher ? 22 + i : 0,
   er: isPitcher ? 8 + (i % 5) : 0,
   so: isPitcher ? 26 + i : 0,
   era: 0,
   whip: 0,
  },
 };
}


function finishStats(p) {
 const s = p.stats;
 s.avg = s.ab ? +(s.h / s.ab).toFixed(3) : 0;
 s.obp = s.ab ? +((s.h + s.bb) / (s.ab + s.bb)).toFixed(3) : 0;
 s.ops = +(s.obp + s.avg * 1.35).toFixed(3);
 s.era = s.ip ? +((s.er * 7) / s.ip).toFixed(2) : 0;
 s.whip = s.ip ? +(((s.h * 0.45 + s.bb) / s.ip)).toFixed(2) : 0;
 return p;
}

/* ---------------------- seed: teams ---------------------- */


function mkTeam(cfg) {
 const roster = [];
 for (let i = 0; i < cfg.count; i++) {
  roster.push(finishStats(mkPlayer(i + cfg.offset, cfg.sport, cfg.gradBase, cfg.id, cfg.numbers[i])));
 }
 return {
  id: cfg.id,
  name: cfg.name,
  sport: cfg.sport,
  age: cfg.age,
  level: cfg.level,
  seasonLabel: cfg.seasonLabel,
  seasonStart: cfg.seasonStart,
  seasonEnd: cfg.seasonEnd,
  headCoach: cfg.coach,
  coachEmail: cfg.coachEmail,
  assistants: cfg.assistants || [],
  uniformPackageId: cfg.pkg,
  orgFee: cfg.orgFee,
  coachMonthly: cfg.coachMonthly,
  eventBudget: cfg.eventBudget || 3200,
  uniformDeadline: null,
  announcements: cfg.announcements || [],
  attendance: {},
  tournamentIds: cfg.tournamentIds,
  otherCosts: cfg.otherCosts,
  teamCageHoursPerWeek: cfg.teamCage,
  playerCageHoursPerWeek: cfg.playerCage,
  gameChanger: cfg.gc || { connected: false, teamId: "", lastSync: null },
  record: cfg.record,
  roster,
  invites: cfg.invites || [],
  practices: cfg.practices || [],
  messages: cfg.messages || [],
  rsvps: {},
  pitchLog: cfg.pitchLog || [],
  sponsors: cfg.sponsors || [],
  withdrawn: [],
  actuals: null,
  closed: null,
  nextSeason: null,
  staff: cfg.staff || [
   { id: uid(), name: cfg.coach, role: "Head coach", monthly: cfg.coachMonthly - (cfg.assistants || []).length * 400,
    childId: null, applyAmount: 0, w9: true,
    backgroundCheck: iso(addDays(TODAY, -120)), safeSport: iso(addDays(TODAY, -120)), expires: iso(addDays(TODAY, 245)) },
   ...(cfg.assistants || []).map((a) => ({
    id: uid(), name: a, role: "Assistant coach", monthly: 400, childId: null, applyAmount: 0, w9: true,
    backgroundCheck: iso(addDays(TODAY, -90)), safeSport: iso(addDays(TODAY, -90)), expires: iso(addDays(TODAY, 275)),
   })),
  ],
  notes: "",
 };
}


function pickEvents(filter, n) {
 return CATALOG.filter(filter).slice(0, n).map((e) => e.id);
}


function emptyState() {
 const s = seedState();
 return {
  ...s, teams: [], games: [], bookings: [], leads: [], tryouts: [], payouts: [],
  reimbursements: [], purchaseOrders: [], disruptions: [], archive: [], alumni: [],
  notifications: [], cancelled: [], audit: [], onboarding: {}, _demo: false,
 };
}

function seedState() {
 const teams = [
  mkTeam({
   id: "t14f",
   name: "Prospects 14U Cream",
   sport: "baseball",
   age: "14U",
   level: "AA",
   seasonLabel: "Fall 2026",
   seasonStart: "2026-09-01",
   seasonEnd: "2026-11-30",
   coach: "Ty Redmond",
   coachEmail: "ty@prospectsbaseball.club",
   assistants: ["Marcus Vela"],
   pkg: "u-core-bb",
   orgFee: 550,
   coachMonthly: 1500,
   tournamentIds: pickEvents((e) => e.start.startsWith("2026-1") || e.start.startsWith("2026-09"), 4),
   otherCosts: { insurance: 300, balls: 250, fields: 400, admin: 250, travel: 0 },
   teamCage: 2,
   playerCage: 1,
   gradBase: 2031,
   count: 12,
   offset: 0,
   numbers: [2, 5, 7, 9, 11, 12, 14, 18, 21, 23, 27, 33],
   record: { w: 14, l: 6, t: 1 },
   gc: { connected: true, teamId: "gc-14u-cream", lastSync: "2026-09-11" },
  }),
  mkTeam({
   id: "t12s",
   name: "Prospects 12U Navy",
   sport: "baseball",
   age: "12U",
   level: "AA",
   seasonLabel: "Spring 2027",
   seasonStart: "2027-03-01",
   seasonEnd: "2027-05-31",
   coach: "Casey Whitlow",
   coachEmail: "casey@prospectsbaseball.club",
   pkg: "u-her-bb",
   orgFee: 450,
   coachMonthly: 1250,
   tournamentIds: pickEvents((e) => e.ages.includes("12U") && e.start.startsWith("2027-0") && e.sport === "baseball", 4),
   otherCosts: { insurance: 300, balls: 250, fields: 500, admin: 250, travel: 0 },
   teamCage: 2,
   playerCage: 1,
   gradBase: 2033,
   count: 11,
   offset: 3,
   numbers: [1, 3, 6, 8, 10, 13, 15, 17, 22, 24, 31],
   record: { w: 0, l: 0, t: 0 },
  }),
  mkTeam({
   id: "t13s",
   name: "Prospects 13U Navy",
   sport: "baseball",
   age: "13U",
   level: "AAA",
   seasonLabel: "Spring 2027",
   seasonStart: "2027-03-01",
   seasonEnd: "2027-05-31",
   coach: "Dell Cathey",
   coachEmail: "dell@prospectsbaseball.club",
   pkg: "u-mod-bb",
   orgFee: 600,
   coachMonthly: 1500,
   tournamentIds: pickEvents((e) => e.ages.includes("13U") && e.start.startsWith("2027-0") && e.sport === "baseball", 5),
   otherCosts: { insurance: 300, balls: 300, fields: 600, admin: 300, travel: 250 },
   teamCage: 3,
   playerCage: 1,
   gradBase: 2032,
   count: 12,
   offset: 6,
   numbers: [2, 4, 7, 9, 11, 16, 19, 20, 25, 28, 30, 44],
   record: { w: 0, l: 0, t: 0 },
  }),
  mkTeam({
   id: "t15su",
   name: "Prospects 15U Columbia",
   sport: "baseball",
   age: "15U",
   level: "Majors",
   seasonLabel: "Summer 2027",
   seasonStart: "2027-06-01",
   seasonEnd: "2027-07-31",
   coach: "Brant Skaggs",
   coachEmail: "brant@prospectsbaseball.club",
   pkg: "u-show-bb",
   orgFee: 700,
   coachMonthly: 2000,
   tournamentIds: pickEvents((e) => e.ages.includes("15U") && e.start.startsWith("2027-0") && e.sport === "baseball" && (e.type === "showcase" || e.fee > 600), 4),
   otherCosts: { insurance: 500, balls: 450, fields: 900, admin: 400, travel: 750 },
   teamCage: 4,
   playerCage: 2,
   gradBase: 2030,
   count: 13,
   offset: 2,
   numbers: [1, 3, 5, 8, 12, 14, 17, 21, 23, 26, 29, 34, 41],
   record: { w: 0, l: 0, t: 0 },
  }),
  mkTeam({
   id: "t17su",
   name: "Prospects 17U Showcase",
   sport: "baseball",
   age: "17U",
   level: "Majors",
   seasonLabel: "Summer 2027",
   seasonStart: "2027-06-01",
   seasonEnd: "2027-07-31",
   coach: "Nolan Pryor",
   coachEmail: "nolan@prospectsbaseball.club",
   pkg: "u-show-bb",
   orgFee: 750,
   coachMonthly: 2000,
   tournamentIds: pickEvents((e) => e.ages.includes("17U") && e.type === "showcase", 4),
   otherCosts: { insurance: 500, balls: 450, fields: 900, admin: 500, travel: 750 },
   teamCage: 4,
   playerCage: 2,
   gradBase: 2028,
   count: 13,
   offset: 5,
   numbers: [2, 4, 6, 9, 10, 13, 15, 18, 22, 24, 27, 32, 45],
   record: { w: 0, l: 0, t: 0 },
  }),
  mkTeam({
   id: "t16sb",
   name: "Prospects 16U Fastpitch",
   sport: "softball",
   age: "16U",
   level: "Majors",
   seasonLabel: "Summer 2027",
   seasonStart: "2027-06-01",
   seasonEnd: "2027-07-31",
   coach: "Randi Bowman",
   coachEmail: "randi@prospectsbaseball.club",
   pkg: "u-mod-sb",
   orgFee: 700,
   coachMonthly: 2000,
   tournamentIds: pickEvents((e) => e.sport === "softball" && e.ages.includes("16U"), 4),
   otherCosts: { insurance: 500, balls: 400, fields: 700, admin: 400, travel: 500 },
   teamCage: 3,
   playerCage: 2,
   gradBase: 2029,
   count: 12,
   offset: 1,
   numbers: [1, 3, 5, 7, 8, 11, 12, 16, 19, 22, 25, 33],
   record: { w: 0, l: 0, t: 0 },
  }),
 ];

 // seed practices for the in-season team
 const base = new Date(TODAY);
 teams[0].practices = [
  { id: uid(), date: iso(addDays(base, 2)), time: "5:00 PM", dur: 2, place: "Field 1", note: "Situational defense" },
  { id: uid(), date: iso(addDays(base, 5)), time: "6:00 PM", dur: 1.5, place: "Field 2", note: "Live BP" },
 ];
 teams[0].invites = [
  { id: uid(), name: "Nash Calder", email: "calder.n@example.com", position: "3B", sent: iso(TODAY), status: "sent" },
 ];
 // a real family with two players in the program
 teams[1].roster[3].familyId = teams[0].roster[3].familyId;
 teams[1].roster[3].name = teams[0].roster[3].name.split(" ")[0] === "Ryder"
  ? "Tate " + teams[0].roster[3].name.split(" ")[1]
  : "Ryder " + teams[0].roster[3].name.split(" ")[1];
 teams[1].roster[3].parents = teams[0].roster[3].parents;
 teams[0].roster[3].reenroll = {
  seasonLabel: "Spring 2027",
  earlyBird: 150,
  deadline: "2026-11-01",
  status: "offer",
 };
 teams[0].roster[3].publicProfile = {
  enabled: true,
  bio: "Middle infield. Plays the hop. Quiet in the box.",
  video: [],
  slug: teams[0].roster[3].name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
 };
 if (teams[0].roster[3].cards?.length) {
  teams[0].roster[3].cards = teams[0].roster[3].cards.filter((c) => c.primary);
 }
 if (teams[0].roster[2]) teams[0].roster[2].failedDraft = true;
 teams[0].sponsors = [
  { id: uid(), name: "Cordova Roofing", amount: 500, level: "Outfield banner", playerId: teams[0].roster[2].id, date: iso(addDays(TODAY, -20)) },
  { id: uid(), name: "Green Country Dental", amount: 250, level: "Jersey sleeve", playerId: null, date: iso(addDays(TODAY, -35)) },
 ];
 teams[0].pitchLog = [
  { id: uid(), playerId: teams[0].roster[0].id, date: iso(addDays(base, -2)), pitches: 70, event: "Route 66 Fall Open" },
  { id: uid(), playerId: teams[0].roster[4].id, date: iso(addDays(base, -3)), pitches: 42, event: "Route 66 Fall Open" },
  { id: uid(), playerId: teams[0].roster[8].id, date: iso(addDays(base, -7)), pitches: 55, event: "Green Country Fall Classic" },
 ];
 const firstEv = teams[0].tournamentIds[0];
 teams[0].rsvps[firstEv] = {};
 teams[0].roster.forEach((pl, i) => {
  teams[0].rsvps[firstEv][pl.id] = i % 7 === 3 ? "out" : i % 5 === 4 ? "maybe" : i % 6 === 5 ? null : "in";
 });
 teams[0].announcements = [
  {
   id: uid(),
   title: "Route 66 Fall Open",
   body: "Pool play Saturday. Gates open 7:15 — dressed and stretching by 7:30.",
   pin: true,
   arrive: "7:15 AM",
   uniform: "Cream home",
   hotel: "Hampton Inn Broken Arrow",
  },
 ];
 const attendId = teams[0].practices[0].id;
 teams[0].attendance = { [attendId]: {} };
 teams[0].roster.forEach((pl, i) => {
  teams[0].attendance[attendId][pl.id] =
   i % 7 === 0 ? "absent" : i % 5 === 0 ? "late" : i % 11 === 0 ? "excused" : "present";
 });
 teams[0].messages = [
  { id: uid(), author: "Ty Redmond", role: "coach", ts: Date.now() - 86400000 * 2, text: "Route 66 Fall Open pool play starts 8:00 Saturday. Gates open at 7:15 — be dressed and stretching by 7:30." },
  { id: uid(), author: "Megan Ferrell", role: "parent", ts: Date.now() - 86400000 * 2 + 3600000, text: "Is the Sunday game time posted yet?" },
  { id: uid(), author: "Ty Redmond", role: "coach", ts: Date.now() - 86400000, text: "Bracket comes out Saturday night. I'll post it here as soon as USSSA releases it." },
 ];
 teams[0].invites = [
  { id: uid(), name: "Cole Denton", email: "cole.denton@example.com", position: "OF/RHP", sent: iso(addDays(base, -3)), status: "pending" },
 ];

 const now = Date.now();
 const games = [
  {
   id: uid(),
   teamId: "t14f",
   status: "live",
   inning: "T5",
   opponent: "Tulsa Bandits 14U",
   oppRecord: "12-8",
   oppRuns: 3,
   ourRuns: 5,
   event: "Route 66 Fall Open",
   field: "BA Sports Park — Field 4",
   date: iso(TODAY),
   time: "10:00 AM",
   recap: "",
   line: [1, 0, 2, 0, 2],
   live: {
    half: "Top",
    inning: 5,
    outs: 1,
    balls: 2,
    strikes: 1,
    bases: { first: "Kason Ferrell", second: null, third: "Easton Maddux" },
    batting: "them",
    pitcher: { name: "Tate Bowman", num: 14, pitches: 64, strikes: 41, ip: "4.1", so: 6, bb: 2, limit: 95 },
    batter: { name: "R. Alvarez", num: 8, line: "1-2, RBI", avg: ".311" },
    onDeck: "M. Kirby #22",
    inHole: "D. Sanders #5",
    lastPlay: "Ground out to short, runner tags and advances to third.",
    bullpen: [
     { name: "Nash Vance", num: 27, pitches: 0, status: "Ready" },
     { name: "Rhett Pryor", num: 21, pitches: 0, status: "Warming" },
    ],
   },
  },
  {
   id: uid(),
   teamId: "t16sb",
   status: "live",
   inning: "B3",
   opponent: "Green Country Heat 16U",
   oppRecord: "18-9",
   oppRuns: 2,
   ourRuns: 2,
   event: "Fall Fastpitch Preview",
   field: "Broken Arrow — Field 2",
   date: iso(TODAY),
   time: "11:30 AM",
   recap: "",
   line: [0, 2, 0],
   live: {
    half: "Bottom",
    inning: 3,
    outs: 2,
    balls: 1,
    strikes: 2,
    bases: { first: "Reese Cordova", second: "Marlee Rains", third: null },
    batting: "us",
    pitcher: { name: "T. Boyd", num: 11, pitches: 51, strikes: 30, ip: "2.2", so: 3, bb: 3, limit: 110 },
    batter: { name: "Presley Ferrell", num: 7, line: "2-2, 2B", avg: ".408" },
    onDeck: "Aubrey Maddux #12",
    inHole: "Sutton Bowman #16",
    lastPlay: "Line drive double to the left-center gap, runner holds at third.",
    bullpen: [{ name: "Kinsley Skaggs", num: 19, pitches: 0, status: "Ready" }],
   },
  },
  {
   id: uid(),
   teamId: "t14f",
   status: "final",
   inning: "F",
   opponent: "OKC Athletics 14U",
   oppRecord: "15-5",
   oppRuns: 2,
   ourRuns: 7,
   event: "Green Country Fall Classic",
   field: "Broken Arrow — Field 1",
   date: iso(addDays(TODAY, -7)),
   time: "1:30 PM",
   recap: "Seven runs on nine hits. Two-out RBI double in the fourth broke it open; bullpen finished with three shutout innings.",
   line: [0, 2, 1, 3, 0, 1, 0],
  },
  {
   id: uid(),
   teamId: "t14f",
   status: "final",
   inning: "F",
   opponent: "Arkansas Sticks 14U",
   oppRecord: "9-11",
   oppRuns: 6,
   ourRuns: 4,
   event: "Green Country Fall Classic",
   field: "Broken Arrow — Field 3",
   date: iso(addDays(TODAY, -8)),
   time: "4:00 PM",
   recap: "Four errors put us behind early. Offense came back within two but stranded eight.",
   line: [0, 0, 2, 0, 1, 1, 0],
  },
 ];

 const seedLeads = [
  { id: uid(), name: "Cole Denton", email: "denton.family@example.com", phone: "918-555-0311", gradYear: 2031, position: "OF/RHP", sport: "baseball", ageGroup: "14U", source: "Tryout", status: "evaluated", scores: { hit: 55, power: 50, run: 60, arm: 55, field: 55, makeup: 60 }, note: "Plus runner, projectable frame." },
  { id: uid(), name: "Beckham Vance", email: "vance.home@example.com", phone: "918-555-0312", gradYear: 2032, position: "C", sport: "baseball", ageGroup: "13U", source: "Referral", status: "registered", scores: {}, note: "" },
  { id: uid(), name: "Adley Rains", email: "rains4@example.com", phone: "918-555-0313", gradYear: 2029, position: "SS", sport: "softball", ageGroup: "16U", source: "Website", status: "waitlist", scores: { hit: 50, power: 45, run: 55, arm: 50, field: 55, makeup: 55 }, note: "Strong hands, needs at-bats." },
  { id: uid(), name: "Gage Ashby", email: "ashby.g@example.com", phone: "918-555-0314", gradYear: 2030, position: "LHP", sport: "baseball", ageGroup: "15U", source: "Showcase", status: "lead", scores: {}, note: "" },
  { id: uid(), name: "Nash Calder", email: "calder.n@example.com", phone: "918-555-0315", gradYear: 2031, position: "3B", sport: "baseball", ageGroup: "14U", source: "Tryout", status: "offer", scores: { hit: 50, power: 55, run: 50, arm: 55, field: 50, makeup: 55 }, note: "Offer out on 14U Cream.", teamId: "t14f" },
  { id: uid(), name: "Easton Pike", email: "pike.e@example.com", phone: "918-555-0316", gradYear: 2030, position: "RHP", sport: "baseball", ageGroup: "15U", source: "Tryout", status: "accepted", scores: { hit: 45, power: 50, run: 50, arm: 60, field: 45, makeup: 60 }, note: "Accepted. Signing from the invite." },
 ];

 const built = {
  settings: {
   contingencyPct: 15,
   membershipMonthly: 200,
   facilityPerTeamMonth: 500,
   fundingPlayers: 10,
   cardFeePct: 0,
   orgFeeMin: 300,
   orgFeeMax: 750,
   coachMin: 1250,
   coachMax: 2000,
   roundStep: 25,
   paidInFullWeeks: 6,
   cageHourlyRate: 45,
   cageOpenHour: 15,
   cageCloseHour: 21,
   cageCount: 4,
   devOsUrl: "https://prospectsbaseball.club/development",
   orgName: "Oklahoma Prospects",
   poTeamCostPct: 70,          // pitcher-only share of the team-cost component
   sponsorCreditPct: 50,        // share of a sold sponsorship credited to that family
   cardSurchargeEnabled: false,
   acquisitionSpend: 0,
   membershipIncludes: [
    "Weekly cage time at the Broken Arrow facility",
    "Access to the Prospects Player Development app and curriculum",
    "Team practice sessions and coach instruction",
    "Member pricing on extra cage hours and lessons",
    "Recruiting and profile support for high school players",
   ],
   policy: {
    version: 1,
    depositRefundable: false,
    refundWindowDays: 14,
    text:
     "1. The roster deposit reserves a spot and is non-refundable once paid.\n" +
     "2. Once the season schedule is committed, the full season fee is owed whether or not the player participates.\n" +
     "3. A player who withdraws before the schedule is committed owes the deposit only.\n" +
     "4. A player who withdraws after the schedule is committed owes the full balance; uniform items already ordered remain the family's property.\n" +
     "5. Balances must clear six weeks before the first tournament. Unpaid accounts forfeit the roster spot without refund.\n" +
     "6. Fees fund team operations for the season. Unused team budget is not distributed to families.\n" +
     "7. Tournament cancellations outside the organization's control are replaced where possible; entry fees that cannot be replaced are credited to the family.",
   },
   payroll: {
    classification: "1099",     // every coach and staff member is an independent contractor
    form1099Threshold: 600,
    seTaxGuidancePct: 25,       // suggested set-aside, not withheld by the organization
    accountablePlan: true,      // substantiated reimbursements stay off the 1099
   },
   messaging: { email: true, sms: true, fromEmail: "teams@prospectsbaseball.club", smsName: "OK Prospects" },
   automations: {
    dueReminder: true,      // 7 days before each scheduled draft
    pastDue: true,          // every morning once a balance is late
    docChase: true,         // weekly until paperwork is complete
    sizeChase: true,        // weekly until uniform orders are in
    rsvpChase: true,        // 10 days before each event
    weeklyDigest: true,     // Sunday summary to every family
    retryBackup: true,      // failed draft retries the backup card next morning
   },
  },
  teams,
  catalog: CATALOG,
  uniforms: UNIFORMS,
  games,
  bookings: [],
  leads: seedLeads,
  tryouts: [
   { id: uid(), name: "Fall Evaluation Day", date: iso(addDays(TODAY, 21)), location: "Prospects Facility, Broken Arrow", ageGroups: ["12U", "13U", "14U", "15U"], sport: "baseball", fee: 35 },
   { id: uid(), name: "Fastpitch Open Tryout", date: iso(addDays(TODAY, 28)), location: "Broken Arrow Sports Park", ageGroups: ["14U", "16U", "18U"], sport: "softball", fee: 35 },
  ],
  payouts: [],
  reimbursements: [],
  purchaseOrders: [],
  disruptions: [],
  archive: [],
  alumni: [
   { id: uid(), name: "Jalen Whitlow", gradYear: 2024, kind: "college", school: "Oral Roberts University", division: "NCAA D1", position: "RHP", committedOn: "2023-11-08" },
   { id: uid(), name: "Cade Ferrell", gradYear: 2024, kind: "college", school: "Seminole State College", division: "NJCAA D1", position: "SS", committedOn: "2024-01-22" },
   { id: uid(), name: "Bryce Cathey", gradYear: 2023, kind: "college", school: "Oklahoma State University", division: "NCAA D1", position: "OF", committedOn: "2022-09-14" },
   { id: uid(), name: "Trey Maddux", gradYear: 2022, kind: "draft", school: "Kansas City Royals", division: "MLB Draft", position: "RHP", committedOn: "2025-07-14", draftRound: 11, draftYear: 2025 },
  ],
  onboarding: {},
  audit: [],
  notifications: [
   { id: uid(), ts: now - 1800000, teamId: "t14f", title: "Lightning delay", body: "14U Cream is delayed. Stay in the cars.", kind: "field", audience: "all" },
   { id: uid(), ts: now - 3600000, teamId: "t14f", title: "Bracket pending", body: "USSSA has not released Sunday bracket times for Route 66 Fall Open.", kind: "info", audience: "all" },
   { id: uid(), ts: now - 5400000, teamId: "t14f", title: "Card failed", body: "A family deposit did not clear. Invoice is sitting in the office.", kind: "money", audience: "admin" },
  ],
  fieldCalls: [
   {
    id: uid(),
    teamId: "t14f",
    practiceId: null,
    status: "delayed",
    at: iso(TODAY),
    note: "Lightning delay. Stay in the cars.",
    newDate: null,
    newTime: null,
    newPlace: null,
   },
  ],
  cancelled: [],
 };

 // a signed agreement means a frozen price — do it once the club is assembled
 built.teams.forEach((tm) => {
  tm.roster.forEach((pl) => {
   if (pl.agreement) pl.feeLock = lockFee(built, tm, pl, built.settings.policy.version);
  });
 });
 return built;
}

/* ---------------------- pricing engine ---------------------- */

export { emptyState, finishStats, mkPlayer, mkTeam, pickEvents, seedState };
