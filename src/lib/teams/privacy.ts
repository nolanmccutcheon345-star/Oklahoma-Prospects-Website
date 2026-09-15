import type { ClubRecord, Player, Team } from "./types";

function stripFamilySecrets(player: Player): Player {
  return {
    ...player,
    feeLock: null,
    planLock: null,
    credits: [],
    payments: [],
    cards: [],
  };
}

function coachView(player: Player): Player {
  return {
    ...player,
    planLock: null,
    credits: [],
    payments: [],
    cards: [],
    feeLock: player.feeLock
      ? {
          amount: player.feeLock.amount,
          lockedAt: player.feeLock.lockedAt,
          policyVersion: "",
          components: {},
        }
      : null,
    emergency: player.emergency,
  };
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
  return stripMedical(stripFamilySecrets({ ...player, depositPaid: false }));
}

export function scopeClub(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string },
): ClubRecord {
  if (role === "admin") return club;

  if (role === "coach") {
    const teams = club.teams
      .filter(
        (team) =>
          team.coachEmail === identity.email ||
          team.staff.some((s) => s.email === identity.email),
      )
      .map((team) => ({
        ...team,
        roster: team.roster.map(coachView),
      }));
    return {
      ...club,
      teams,
      settings: {
        ...club.settings,
        membershipMonthly: 0,
        orgFeeFloor: 0,
        orgFeeCeiling: 0,
      },
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
            ? stripFamilySecrets(p)
            : p
          : publicTeammate(p),
      ),
    }));
  return {
    ...club,
    teams,
    settings: {
      ...club.settings,
      membershipMonthly: 0,
      facilityMonthly: 0,
      orgFeeFloor: 0,
      orgFeeCeiling: 0,
    },
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
        next.teams[idx].coachEmail === identity.email ||
        next.teams[idx].staff.some((s) => s.email === identity.email);
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
