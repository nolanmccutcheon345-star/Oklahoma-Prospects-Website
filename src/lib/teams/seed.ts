import { DEFAULT_SETTINGS, type ClubRecord, type Player, type Team } from "./types";
import { priceComponents } from "./pricing";

function parent(
  name: string,
  rel: string,
  phone: string,
  email: string,
): Player["parents"][number] {
  return { name, rel, phone, email };
}

function player(partial: Player): Player {
  return partial;
}

const uniforms: ClubRecord["uniforms"] = [
  {
    id: "heritage-bb",
    name: "Heritage Classic",
    sport: "baseball",
    price: 325,
    items: ["Home jersey", "Road jersey", "Pants", "Cap", "Belt", "Socks"],
    colourways: ["Navy / cream", "Maroon / cream"],
    sizeFields: ["jersey", "pants", "cap", "helmet"],
  },
  {
    id: "modern-bb",
    name: "Modern Performance",
    sport: "baseball",
    price: 365,
    items: ["Home jersey", "Road jersey", "Alternate", "Pants", "Cap"],
    colourways: ["Navy", "Maroon"],
    sizeFields: ["jersey", "pants", "cap", "helmet"],
  },
  {
    id: "core-bb",
    name: "Prospects Core",
    sport: "baseball",
    price: 245,
    items: ["Jersey", "Pants", "Cap"],
    colourways: ["Navy"],
    sizeFields: ["jersey", "pants", "cap"],
  },
  {
    id: "elite-bb",
    name: "Showcase Elite (HS)",
    sport: "baseball",
    price: 425,
    items: ["Home", "Road", "Alternate", "Pants", "Cap", "Helmet"],
    colourways: ["Navy / maroon"],
    sizeFields: ["jersey", "pants", "cap", "helmet"],
  },
  {
    id: "heritage-sb",
    name: "Heritage Classic",
    sport: "softball",
    price: 335,
    items: ["Jersey", "Pants", "Visor"],
    colourways: ["Navy / cream"],
    sizeFields: ["jersey", "pants", "visor"],
  },
  {
    id: "modern-sb",
    name: "Modern Performance",
    sport: "softball",
    price: 375,
    items: ["Jersey", "Pants", "Visor"],
    colourways: ["Navy / pink"],
    sizeFields: ["jersey", "pants", "visor"],
  },
];

const catalog: ClubRecord["catalog"] = [
  {
    id: "ev-pg-okc",
    org: "Perfect Game",
    name: "PG Super 25 Oklahoma",
    city: "Oklahoma City",
    state: "OK",
    start: "2027-03-20",
    end: "2027-03-22",
    ages: ["13U", "14U"],
    levels: ["Open"],
    fee: 895,
    sport: "baseball",
    type: "tournament",
    stayToPlay: true,
    verifiedOn: "2026-09-01",
  },
  {
    id: "ev-usssa-ba",
    org: "USSSA",
    name: "Broken Arrow State",
    city: "Broken Arrow",
    state: "OK",
    start: "2027-04-10",
    end: "2027-04-12",
    ages: ["13U"],
    levels: ["AAA", "Open"],
    fee: 575,
    sport: "baseball",
    type: "tournament",
    stayToPlay: false,
    verifiedOn: "2026-09-01",
  },
  {
    id: "ev-5tool",
    org: "Five Tool",
    name: "Five Tool Texas",
    city: "Dallas",
    state: "TX",
    start: "2027-05-15",
    end: "2027-05-17",
    ages: ["14U", "15U"],
    levels: ["Open"],
    fee: 975,
    sport: "baseball",
    type: "showcase",
    stayToPlay: true,
    verifiedOn: "",
  },
];

function basePlayer(
  id: string,
  teamId: string,
  familyId: string,
  name: string,
  number: string,
  extras: Partial<Player> = {},
): Player {
  return player({
    id,
    teamId,
    familyId,
    name,
    number,
    positions: ["SS", "2B"],
    bats: "R",
    throws: "R",
    gradYear: "2031",
    school: "Broken Arrow",
    height: "5-6",
    weight: "125",
    email: "",
    parents: [parent("Parent", "guardian", "(918) 555-0100", "parent@example.com")],
    roleType: "full",
    coachChild: false,
    joinedOn: "2026-08-01",
    withdrawn: false,
    agreement: { version: "", signedBy: "", signedAt: "" },
    feeLock: null,
    planLock: null,
    credits: [],
    payments: [],
    cards: [],
    planType: "four",
    depositPaid: false,
    uniformWaived: false,
    order: { number: "", sizes: {}, submitted: false },
    docs: { waiver: false, birthCert: false, insurance: false, physical: false },
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    publicProfile: { enabled: false, bio: "", slug: "" },
    prefs: { email: true, sms: true },
    reenroll: false,
    cageOverage: 0,
    stats: { avg: 0, hr: 0, sb: 0 },
    rsvp: {},
    ...extras,
  });
}

function lockFee(team: Team, p: Player): Player {
  const pack = uniforms.find((u) => u.id === team.uniformPackageId);
  const c = priceComponents(team, DEFAULT_SETTINGS, pack?.price ?? 0, p.roleType);
  return {
    ...p,
    feeLock: {
      amount: c.published,
      lockedAt: "2026-08-15",
      policyVersion: DEFAULT_SETTINGS.policyVersion,
      components: {
        teamAndEvents: c.teamCost,
        coaching: c.coaching,
        program: c.membership + c.orgFee,
        uniform: c.uniform,
      },
    },
    planLock: {
      dep: c.deposit,
      deadline: "2027-02-01",
      planType: p.planType,
      rows: [
        { date: "2026-09-01", amount: c.deposit },
        { date: "2026-11-01", amount: roundPart(c.published - c.deposit, 3, 0) },
        { date: "2027-01-01", amount: roundPart(c.published - c.deposit, 3, 1) },
        { date: "2027-02-01", amount: roundPart(c.published - c.deposit, 3, 2) },
      ],
    },
  };
}

function roundPart(total: number, parts: number, index: number) {
  const base = Math.floor(total / parts);
  return index === parts - 1 ? total - base * (parts - 1) : base;
}

function make13u(): Team {
  const team: Team = {
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
    tournamentIds: ["ev-usssa-ba", "ev-pg-okc"],
    otherCosts: { insurance: 400, balls: 250, fields: 800, admin: 200, travel: 900 },
    teamCageHoursPerWeek: 4,
    playerCageHoursPerWeek: 1,
    record: { w: 4, l: 2, t: 0 },
    roster: [],
    practices: [
      {
        id: "pr-1",
        date: "2026-09-16",
        time: "6:00 PM",
        where: "Prospects cages",
        cageHours: 2,
        status: "set",
      },
    ],
    messages: [
      {
        id: "m1",
        at: "2026-09-12T18:00:00",
        from: "Ty Redmond",
        body: "Navy 13U — cages Tuesday 6 PM. Group thread only.",
      },
    ],
    announcements: [
      {
        id: "a1",
        title: "Tuesday cages",
        body: "Arrive 5:45. Navy hats.",
        pin: true,
        arrive: "5:45 PM",
        uniform: "Navy practice",
        hotel: "",
      },
    ],
    attendance: {},
    pitchLog: [{ id: "pi-1", playerId: "p-easton", date: "2026-09-07", pitches: 42 }],
    closed: false,
    notes: "",
  };

  const roster = [
    lockFee(
      team,
      basePlayer("p-easton", team.id, "fam-t14f-3", "Easton Hale", "7", {
        positions: ["P", "SS"],
        docs: { waiver: true, birthCert: true, insurance: true, physical: true },
        agreement: { version: "2026-spring-1", signedBy: "Hale", signedAt: "2026-08-20" },
        depositPaid: true,
        payments: [
          {
            date: "2026-08-20",
            amount: 725,
            fee: 22,
            charged: 747,
            method: "card",
            label: "Deposit",
            receipt: "R-1001",
          },
        ],
        cards: [{ brand: "Visa", last4: "4242", exp: "09/28", primary: true }],
        emergency: {
          allergies: "Peanuts",
          conditions: "Asthma",
          insurer: "BCBS",
          policyNo: "OK-4411",
          physician: "Dr. Patel",
          pickup: ["Jordan Hale"],
          notes: "Inhaler in bag",
        },
        parents: [parent("Jordan Hale", "mom", "(918) 555-0144", "jordan.hale@example.com")],
        order: { number: "7", sizes: { jersey: "YM", pants: "YM", cap: "6 7/8" }, submitted: true },
        rsvp: { "ev-usssa-ba": "going" },
      }),
    ),
    lockFee(
      team,
      basePlayer("p-cade", team.id, "fam-coach-ty", "Cade Redmond", "12", {
        coachChild: true,
        positions: ["C", "3B"],
        docs: { waiver: true, birthCert: true, insurance: false, physical: true },
        agreement: { version: "2026-spring-1", signedBy: "Ty Redmond", signedAt: "2026-08-18" },
        depositPaid: true,
        credits: [{ label: "Coach pay offset", amount: 400 }],
        parents: [parent("Ty Redmond", "dad", "(918) 760-2719", "ty@prospectsbaseball.club")],
      }),
    ),
    lockFee(
      team,
      basePlayer("p-miles", team.id, "fam-t14f-3", "Miles Hale", "3", {
        positions: ["OF"],
        docs: { waiver: true, birthCert: false, insurance: true, physical: false },
        parents: [parent("Jordan Hale", "mom", "(918) 555-0144", "jordan.hale@example.com")],
      }),
    ),
    ...["p-jay", "p-bo", "p-knox", "p-reid", "p-cole", "p-sam"].map((id, i) =>
      lockFee(
        team,
        basePlayer(id, team.id, `fam-${id}`, ["Jay", "Bo", "Knox", "Reid", "Cole", "Sam"][i] + " Brooks", String(10 + i), {
          agreement:
            i < 3
              ? { version: "2026-spring-1", signedBy: "Brooks", signedAt: "2026-08-22" }
              : { version: "", signedBy: "", signedAt: "" },
          depositPaid: i < 3,
          docs: {
            waiver: i < 4,
            birthCert: i < 2,
            insurance: i < 3,
            physical: i < 2,
          },
        }),
      ),
    ),
  ];
  team.roster = roster;
  return team;
}

function make14u(): Team {
  const team: Team = {
    id: "t-14u-maroon",
    name: "14U Maroon",
    sport: "baseball",
    age: "14U",
    level: "Open",
    seasonLabel: "Spring 2027",
    seasonStart: "2027-02-01",
    seasonEnd: "2027-07-15",
    months: 6,
    headCoach: "Steve McCutcheon",
    coachEmail: "steve@prospectsbaseball.club",
    staff: [
      {
        id: "st-steve",
        name: "Steve McCutcheon",
        role: "Head coach",
        monthly: 1750,
        childId: "",
        applyAmount: 0,
        w9: true,
        backgroundCheck: true,
        safeSport: true,
        expires: "2027-01-15",
        email: "steve@prospectsbaseball.club",
      },
    ],
    uniformPackageId: "modern-bb",
    uniformDeadline: "2026-11-01",
    orgFee: 550,
    coachMonthly: 1750,
    eventBudget: 4800,
    tournamentIds: ["ev-pg-okc", "ev-5tool"],
    otherCosts: { insurance: 450, balls: 300, fields: 900, admin: 250, travel: 1200 },
    teamCageHoursPerWeek: 5,
    playerCageHoursPerWeek: 1,
    record: { w: 6, l: 1, t: 1 },
    roster: [],
    practices: [],
    messages: [],
    announcements: [],
    attendance: {},
    pitchLog: [],
    closed: false,
    notes: "",
  };
  team.roster = Array.from({ length: 11 }, (_, i) =>
    lockFee(
      team,
      basePlayer(`p-14-${i}`, team.id, `fam-14-${i}`, `Player ${i + 1}`, String(i + 1), {
        agreement: { version: "2026-spring-1", signedBy: "Parent", signedAt: "2026-08-10" },
        depositPaid: i < 10,
        docs: { waiver: true, birthCert: true, insurance: true, physical: i !== 8 },
      }),
    ),
  );
  return team;
}

export function sampleClub(): ClubRecord {
  const t13 = make13u();
  const t14 = make14u();
  return {
    settings: DEFAULT_SETTINGS,
    teams: [t13, t14],
    catalog,
    uniforms,
    leads: [
      {
        id: "lead-1",
        name: "Noah Grant",
        age: "13U",
        stage: "evaluated",
        grades: { hit: 50, power: 40, run: 55, arm: 50, field: 45, makeup: 60 },
        teamId: "t-13u-navy",
      },
    ],
    alumni: [
      { id: "al-1", name: "Former Prospect", kind: "college", detail: "Oral Roberts" },
    ],
    notifications: [
      {
        id: "n1",
        ts: "2026-09-14T10:00:00",
        teamId: "t-13u-navy",
        kind: "paperwork",
        title: "Birth certificates missing",
        body: "Three Navy 13U players still need birth certificates.",
        audience: "admin",
      },
    ],
    audit: [{ at: "2026-09-01T12:00:00", action: "seed", detail: "Sample club loaded" }],
    onboarding: { started: true },
    _rev: 1,
    _savedAt: "2026-09-14T10:00:00",
    _demo: true,
  };
}

export function emptyClub(): ClubRecord {
  return {
    settings: DEFAULT_SETTINGS,
    teams: [],
    catalog: [],
    uniforms,
    leads: [],
    alumni: [],
    notifications: [],
    audit: [{ at: new Date().toISOString(), action: "start", detail: "Empty club opened" }],
    onboarding: { started: true },
    _rev: 1,
    _savedAt: new Date().toISOString(),
    _demo: false,
  };
}
