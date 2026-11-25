import type { RosterRole } from "./po-roster";
import type { Player } from "./types";

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "new";
}

export function blankPlayer(input: {
  teamId: string;
  familyId: string;
  name: string;
  parentName: string;
  parentEmail: string;
  rosterRole: RosterRole;
}): Player {
  return {
    id: `p-${slug(input.name)}-${Date.now().toString(36).slice(-4)}`,
    teamId: input.teamId,
    familyId: input.familyId,
    name: input.name,
    number: "",
    positions: [],
    bats: "R",
    throws: "R",
    gradYear: "",
    school: "",
    height: "",
    weight: "",
    email: "",
    parents: [{ name: input.parentName, rel: "guardian", phone: "", email: input.parentEmail }],
    roleType: input.rosterRole,
    coachChild: false,
    joinedOn: new Date().toISOString().slice(0, 10),
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
    stats: {},
    rsvp: {},
  };
}
