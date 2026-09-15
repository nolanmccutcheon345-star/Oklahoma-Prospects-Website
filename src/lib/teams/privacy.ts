import type { ClubRecord, Player, Team } from "./types";

function dropPayment(player: Player): Player {
  const { feeLock: _f, planLock: _p, credits: _c, payments: _pay, cards: _cards, ...rest } = player;
  return rest as Player;
}

function stripMedical(player: Player): Player {
  return {
    ...player,
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    parents: player.parents.map((p) => ({ ...p, phone: "", email: "" })),
  };
}

function publicTeammate(player: Player): Player {
  return stripMedical(dropPayment({ ...player, depositPaid: false }));
}

export function scopeClub(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
): ClubRecord {
  if (role === "admin") return club;

  const next: ClubRecord = {
    ...club,
    settings: {
      ...club.settings,
      membershipMonthly: 0,
      facilityMonthly: 0,
      orgFeeFloor: 0,
      orgFeeCeiling: 0,
    },
  };

  if (role === "coach") {
    const teams = club.teams
      .filter(
        (team) =>
          team.coachEmail.trim().toLowerCase() === identity.email ||
          team.staff.some((s) => s.email.trim().toLowerCase() === identity.email),
      )
      .map((team) => ({
        ...team,
        roster: team.roster.map(dropPayment),
      }));
    return {
      ...next,
      teams,
      leads: [],
      audit: [],
    };
  }

  const mine = club.teams.flatMap((team) =>
    team.roster.filter((p) => p.familyId && p.familyId === identity.familyId),
  );
  const familyIds = new Set(mine.map((p) => p.familyId));
  const teams: Team[] = club.teams
    .filter((team) => team.roster.some((p) => familyIds.has(p.familyId)))
    .map((team) => ({
      ...team,
      staff: team.staff.map((s) => ({ ...s, monthly: 0, applyAmount: 0 })),
      orgFee: 0,
      coachMonthly: 0,
      eventBudget: 0,
      otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
      roster: team.roster.map((p) =>
        familyIds.has(p.familyId)
          ? role === "player"
            ? dropPayment(p)
            : p
          : publicTeammate(p),
      ),
    }));
  return {
    ...next,
    teams,
    leads: [],
    audit: [],
  };
}

export function mergeSave(
  stored: ClubRecord,
  incoming: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
): ClubRecord {
  if (role === "admin") return { ...incoming, _rev: stored._rev + 1, _savedAt: new Date().toISOString() };

  if (role === "coach") {
    const next = structuredClone(stored);
    for (const team of incoming.teams) {
      const idx = next.teams.findIndex((t) => t.id === team.id);
      if (idx < 0) continue;
      const owned =
        next.teams[idx].coachEmail.trim().toLowerCase() === identity.email ||
        next.teams[idx].staff.some((s) => s.email.trim().toLowerCase() === identity.email);
      if (!owned) continue;
      next.teams[idx] = {
        ...next.teams[idx],
        tournamentIds: team.tournamentIds,
        practices: team.practices,
        announcements: team.announcements,
        messages: team.messages,
        attendance: team.attendance,
        pitchLog: team.pitchLog,
        record: team.record,
        notes: team.notes,
        staff: next.teams[idx].staff.map((s) => {
          const incomingStaff = team.staff.find((x) => x.id === s.id);
          if (incomingStaff && s.email === identity.email) {
            return { ...s, applyAmount: incomingStaff.applyAmount };
          }
          return s;
        }),
        roster: next.teams[idx].roster.map((p) => {
          const incomingP = team.roster.find((x) => x.id === p.id);
          if (!incomingP) return p;
          return {
            ...p,
            number: incomingP.number,
            order: incomingP.order,
            rsvp: incomingP.rsvp,
          };
        }),
      };
    }
    next._rev = stored._rev + 1;
    next._savedAt = new Date().toISOString();
    return next;
  }

  if (role === "player") {
    const next = structuredClone(stored);
    for (const team of next.teams) {
      team.roster = team.roster.map((p) => {
        if (p.familyId !== identity.familyId) return p;
        const incomingTeam = incoming.teams.find((t) => t.id === team.id);
        const incomingP = incomingTeam?.roster.find((x) => x.id === p.id);
        if (!incomingP) return p;
        return {
          ...p,
          rsvp: incomingP.rsvp,
          publicProfile: incomingP.publicProfile,
        };
      });
    }
    next._rev = stored._rev + 1;
    next._savedAt = new Date().toISOString();
    return next;
  }

  const next = structuredClone(stored);
  for (const team of next.teams) {
    team.roster = team.roster.map((p) => {
      if (p.familyId !== identity.familyId) return p;
      const incomingTeam = incoming.teams.find((t) => t.id === team.id);
      const incomingP = incomingTeam?.roster.find((x) => x.id === p.id);
      if (!incomingP) return p;
      return {
        ...p,
        order: incomingP.order,
        docs: incomingP.docs,
        prefs: incomingP.prefs,
        planType: incomingP.planType,
        cards: incomingP.cards,
        publicProfile: incomingP.publicProfile,
        rsvp: incomingP.rsvp,
        reenroll: incomingP.reenroll,
      };
    });
  }
  next._rev = stored._rev + 1;
  next._savedAt = new Date().toISOString();
  return next;
}

export function coachHoldsTeam(club: ClubRecord, email: string, teamId: string) {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return false;
  return (
    team.coachEmail.trim().toLowerCase() === email.trim().toLowerCase() ||
    team.staff.some((s) => s.email.trim().toLowerCase() === email.trim().toLowerCase())
  );
}

export function familyHoldsPlayer(club: ClubRecord, familyId: string, playerId: string) {
  return club.teams.some((t) => t.roster.some((p) => p.id === playerId && p.familyId === familyId));
}

export function canFetchTeam(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
  teamId: string,
): boolean {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return false;
  if (role === "admin") return true;
  if (role === "coach") return coachHoldsTeam(club, identity.email, teamId);
  return team.roster.some((p) => p.familyId === identity.familyId);
}

export function canFetchPlayer(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
  playerId: string,
): boolean {
  if (role === "admin") {
    return club.teams.some((t) => t.roster.some((p) => p.id === playerId));
  }
  if (role === "coach") {
    const team = club.teams.find((t) => t.roster.some((p) => p.id === playerId));
    return team ? coachHoldsTeam(club, identity.email, team.id) : false;
  }
  if (role === "parent") return familyHoldsPlayer(club, identity.familyId, playerId);
  const e = identity.email.toLowerCase();
  return club.teams.some((t) =>
    t.roster.some((p) => p.id === playerId && p.email.toLowerCase() === e),
  );
}

/** Crafted roster request. Returns null instead of leaking another team's names. */
export function fetchTeamRecord(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
  teamId: string,
): Team | null {
  if (!canFetchTeam(club, role, identity, teamId)) return null;
  const scoped = scopeClub(club, role, identity);
  return scoped.teams.find((t) => t.id === teamId) ?? null;
}

/** Crafted player request. Returns null instead of leaking another family's record. */
export function fetchPlayerRecord(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
  playerId: string,
): Player | null {
  if (!canFetchPlayer(club, role, identity, playerId)) return null;
  const scoped = scopeClub(club, role, identity);
  return scoped.teams.flatMap((t) => t.roster).find((p) => p.id === playerId) ?? null;
}
