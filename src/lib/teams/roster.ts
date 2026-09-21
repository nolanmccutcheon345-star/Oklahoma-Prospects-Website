import type {
  ClubOs,
  OsClearance,
  OsDepositCharge,
  OsPlayer,
  OsTeam,
} from "@/lib/teams/model";
import { iso, uid } from "@/lib/teams/engine/00-helpers.js";
import {
  depositFor,
  lockFee,
  lockPlan,
  playerBalance,
  playerFee,
} from "@/lib/teams/engine/02-pricing.js";
import { logAudit, missingDocs, notify } from "@/lib/teams/engine/03-domain.js";

export type RosterFilter =
  | "all"
  | "action"
  | "account"
  | "unsigned"
  | "sizes"
  | "paperwork"
  | "pitchers";

export const ROSTER_FILTERS: { id: RosterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "account", label: "Account" },
  { id: "unsigned", label: "Unsigned" },
  { id: "sizes", label: "Sizes" },
  { id: "paperwork", label: "Paperwork" },
  { id: "pitchers", label: "Pitchers" },
];

export function isPitcher(player: OsPlayer): boolean {
  if (player.roleType === "po") return true;
  const pos = Array.isArray(player.positions)
    ? player.positions.join(" ")
    : String(player.positions || "");
  return /\b(P|RHP|LHP)\b/i.test(pos);
}

export function clearanceOf(player: OsPlayer): {
  ok: boolean;
  status: OsClearance;
  reason: string;
} {
  if (player.withdrawn) {
    return { ok: false, status: "unsigned", reason: "Withdrawn" };
  }
  if (!player.agreement) {
    return { ok: false, status: "unsigned", reason: "Unsigned" };
  }
  if (!player.depositPaid) {
    return { ok: false, status: "account", reason: "Account" };
  }
  const miss = missingDocs(player) as string[];
  if (miss.length > 0) {
    return {
      ok: false,
      status: "docs",
      reason: miss.length === 1 ? "Docs" : "Docs",
    };
  }
  if (!player.order?.submitted) {
    return { ok: false, status: "sizes", reason: "Sizes" };
  }
  return { ok: true, status: "cleared", reason: "Cleared" };
}

export function matchesRosterFilter(
  player: OsPlayer,
  filter: RosterFilter,
): boolean {
  if (player.withdrawn && filter !== "all") return false;
  const clear = clearanceOf(player);
  switch (filter) {
    case "all":
      return true;
    case "action":
      return !clear.ok;
    case "account":
      return clear.status === "account";
    case "unsigned":
      return clear.status === "unsigned";
    case "sizes":
      return !player.order?.submitted;
    case "paperwork":
      return (missingDocs(player) as string[]).length > 0;
    case "pitchers":
      return isPitcher(player);
    default:
      return true;
  }
}

export function searchRoster(player: OsPlayer, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const pos = Array.isArray(player.positions)
    ? player.positions.join(" ")
    : String(player.positions || "");
  return `${player.name} ${player.number} ${pos}`.toLowerCase().includes(needle);
}

export function reminderFor(
  filter: RosterFilter,
  teamName: string,
  names: string[],
): { title: string; body: string } {
  const who = names.length <= 3 ? names.join(", ") : `${names.length} families`;
  if (filter === "unsigned") {
    return {
      title: "Agreement chase",
      body: `${who} on ${teamName} still need to sign. The roster spot is not locked until they do.`,
    };
  }
  if (filter === "account") {
    return {
      title: "Deposit chase",
      body: `${who} on ${teamName} have not paid the roster deposit.`,
    };
  }
  if (filter === "paperwork") {
    return {
      title: "Paperwork chase",
      body: `${who} on ${teamName} are missing a required document. They sit until it is in.`,
    };
  }
  if (filter === "sizes") {
    return {
      title: "Size chase",
      body: `${who} on ${teamName} have not submitted uniform sizes.`,
    };
  }
  return {
    title: "Roster chase",
    body: `${who} on ${teamName} still need action before they can be submitted.`,
  };
}

export function takenNumbers(team: OsTeam, exceptId?: string | null): Set<string> {
  return new Set(
    team.roster
      .filter((p) => !p.withdrawn && p.id !== exceptId)
      .map((p) => String(p.number)),
  );
}

export function depositChargeFor(club: ClubOs, team: OsTeam): OsDepositCharge {
  const amount = Number(depositFor(club, team, null)) || 0;
  return { amount, fee: 0, totalCharged: amount };
}

export function scheduleCommitted(team: OsTeam): boolean {
  return (team.tournamentIds || []).length > 0;
}

export function withdrawSettlement(
  club: ClubOs,
  team: OsTeam,
  player: OsPlayer,
): { owes: "deposit" | "full"; amount: number; copy: string } {
  const committed = scheduleCommitted(team);
  if (!committed) {
    const dep = Number(depositFor(club, team, player)) || 0;
    return {
      owes: "deposit",
      amount: player.depositPaid ? dep : dep,
      copy: "Schedule is not committed. Policy settles at the deposit only.",
    };
  }
  const due = Number(playerBalance(club, team, player)) || 0;
  return {
    owes: "full",
    amount: due,
    copy: "Schedule is committed. Policy settles at the full remaining balance.",
  };
}

function blankPlayer(team: OsTeam, invite: OsTeam["invites"][number]): OsPlayer {
  return {
    id: uid(),
    teamId: team.id,
    name: invite.name,
    number: 0,
    positions: invite.position,
    bats: "R",
    throws: "R",
    gradYear: 2031,
    school: "Broken Arrow HS",
    height: `5'10"`,
    weight: 155,
    email: invite.email,
    parents: [
      {
        name: `Parent of ${invite.name.split(" ")[0]}`,
        rel: "Parent",
        phone: "918-555-0400",
        email: invite.email,
      },
    ],
    familyId: `fam-${invite.id}`,
    roleType: "full",
    coachChild: null,
    joinedOn: iso(new Date(2026, 8, 15)),
    withdrawn: null,
    credits: [],
    agreement: null,
    prefs: { email: true, sms: true },
    feeLock: null,
    amendments: [],
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    publicProfile: { enabled: false, bio: "", video: [], slug: "" },
    reenroll: null,
    uniformWaived: false,
    docs: { waiver: false, birthCert: false, insurance: false, physical: false },
    order: { number: 0, sizes: {}, submitted: false },
    depositPaid: false,
    depositCharge: null,
    planType: "monthly",
    cards: [],
    payments: [],
    cageOverage: 0,
    stats: {
      gp: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0,
      avg: 0, obp: 0, ops: 0, ev: 0, pop: null, velo: null,
      ip: 0, er: 0, so: 0, era: 0, whip: 0,
    },
  };
}

export type SignInput = {
  teamId: string;
  playerId?: string | null;
  inviteId?: string | null;
  legalName: string;
  number: number;
  planType: "monthly" | "full";
  actor: string;
};

export function applySign(club: ClubOs, input: SignInput): { club: ClubOs; playerId: string } {
  const team = club.teams.find((t) => t.id === input.teamId);
  if (!team) throw new Error("Team not found");
  let player: OsPlayer | undefined;
  if (input.inviteId) {
    const invite = team.invites.find((i) => i.id === input.inviteId);
    if (!invite) throw new Error("Invite not found");
    player = blankPlayer(team, invite);
    team.roster.push(player);
  } else if (input.playerId) {
    player = team.roster.find((p) => p.id === input.playerId);
  }
  if (!player) throw new Error("Player not found");

  const taken = takenNumbers(team, player.id);
  if (taken.has(String(input.number))) throw new Error("Jersey number is taken");

  const charge = depositChargeFor(club, team);
  player.number = input.number;
  player.order = { ...player.order, number: input.number };
  player.planType = input.planType;
  player.agreement = {
    version: club.settings.policy.version,
    signedBy: input.legalName.trim(),
    signedAt: iso(new Date(2026, 8, 15)),
  };
  player.joinedOn = player.joinedOn || iso(new Date(2026, 8, 15));
  player.feeLock = lockFee(club, team, player, club.settings.policy.version);
  player.planLock = lockPlan(club, team, player);
  player.depositPaid = true;
  player.depositCharge = charge;
  player.payments = [
    ...(player.payments || []),
    {
      amount: charge.totalCharged,
      date: iso(new Date(2026, 8, 15)),
      label: "Roster deposit",
    },
  ];
  if (!player.cards?.length) {
    player.cards = [
      { id: uid(), brand: "Visa", last4: "4242", exp: "09/29", primary: true },
    ];
  }

  if (input.inviteId) {
    const invite = team.invites.find((i) => i.id === input.inviteId);
    if (invite) {
      invite.status = "accepted";
      invite.charge = charge;
    }
  }

  logAudit(
    club,
    input.actor,
    "sign",
    `${player.name} signed policy v${club.settings.policy.version}; deposit ${charge.amount}, fee ${charge.fee}, total ${charge.totalCharged}`,
  );
  notify(
    club,
    team.id,
    "Roster locked",
    `${player.name} signed. Deposit ${charge.amount} plus card fee ${charge.fee} charged as ${charge.totalCharged}.`,
    "money",
    "admin",
  );
  return { club, playerId: player.id };
}

export function applyWithdraw(
  club: ClubOs,
  teamId: string,
  playerId: string,
  actor: string,
  reason: string,
  forgive: boolean,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) throw new Error("Player not found");
  const settle = withdrawSettlement(club, team, player);
  player.withdrawn = iso(new Date(2026, 8, 15));
  if (forgive) {
    const left = Number(playerBalance(club, team, player)) || 0;
    if (left > 0) {
      player.credits = [
        ...(player.credits || []),
        {
          id: uid(),
          type: "exception",
          amount: left,
          note: reason,
          date: iso(new Date(2026, 8, 15)),
        },
      ];
    }
    logAudit(
      club,
      actor,
      "withdraw-forgive",
      `${player.name} withdrawn. Exception: ${reason}. Forgave ${left}.`,
    );
  } else {
    logAudit(
      club,
      actor,
      "withdraw",
      `${player.name} withdrawn. Policy ${settle.owes} · ${settle.amount}. ${reason}`,
    );
  }
  notify(
    club,
    team.id,
    "Withdrawal",
    `${player.name} is off the roster.`,
    "roster",
    "all",
  );
  return club;
}

export function applyRemind(
  club: ClubOs,
  teamId: string,
  filter: RosterFilter,
  names: string[],
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  const note = reminderFor(filter, team.name, names);
  notify(club, team.id, note.title, note.body, "chase", "all");
  logAudit(club, actor, "remind", `${note.title}: ${names.join(", ")}`);
  return club;
}

export function feeBreakdown(club: ClubOs, team: OsTeam, player: OsPlayer) {
  const lock =
    player.feeLock || lockFee(club, team, player, club.settings.policy.version);
  const c = lock.components || {};
  return {
    total: Number(lock.amount) || Number(playerFee(club, team, player)) || 0,
    lines: [
      { label: "Team and event costs", amount: Number(c.team) || 0 },
      { label: "Coaching and instruction", amount: Number(c.coaching) || 0 },
      {
        label: "Program and membership",
        amount: (Number(c.program) || 0) + (Number(c.membership) || 0),
      },
      { label: "Uniform", amount: Number(c.uniform) || 0 },
    ],
  };
}
