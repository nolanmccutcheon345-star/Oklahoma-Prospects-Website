import type { ClubRecord, Player, Team } from "./types";

const norm = (value:string) => value.trim().toLowerCase();
function ownsPlayer(player:Player, identity:{email:string;familyId:string;familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[]}) {
 if(identity.familyIds)return identity.familyIds.includes(player.familyId);
 return Boolean(identity.email) && (player.familyId===identity.familyId
   && (player.parents.some(parent=>norm(parent.email)===norm(identity.email)) || norm(player.email)===norm(identity.email)));
}
function visiblePlayer(player:Player,role:string,identity:{email:string;familyId:string;familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[]}) {
 return role==='player' ? Boolean(identity.playerIds?.includes(player.id)||identity.guardianHouseholdIds?.includes(player.familyId)||(norm(identity.email)&&norm(player.email)===norm(identity.email))) : ownsPlayer(player,identity)||Boolean(identity.playerIds?.includes(player.id));
}
function visibleNotifications(club:ClubRecord,teams:Team[],role:string) {
 const teamIds=new Set(teams.map(t=>t.id));
 // Scoped teams contain only authorized athletes for parent/player viewers.
 // A team-wide "family" notice has no recipient identity and must never
 // be exposed to every household merely because they share a roster.
 const familyIds=new Set(teams.flatMap(t=>t.roster.map(p=>p.familyId)));
 return club.notifications.filter(n=>{
  if(!teamIds.has(n.teamId))return false;
  if(role==='coach')return n.audience==='all'||n.audience==='coach';
  if(n.audience==='all')return true;
  return n.audience==='family' && Boolean(n.recipientFamilyId) && familyIds.has(n.recipientFamilyId!);
 });
}
function dropPlayerBilling(player: Player): Player {
  return { ...dropPayment(player), planType: "", depositPaid: false, uniformWaived: false, cageOverage: 0 };
}
function dropPayment(player: Player): Player {
  const { feeLock: _f, planLock: _p, credits: _c, payments: _pay, cards: _cards, ...rest } = player;
  return rest as Player;
}

export function scopeClub(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
): ClubRecord {
  if (role === "admin") return club;

  const next: ClubRecord = {
    teams: [], catalog: club.catalog, uniforms: club.uniforms, alumni: club.alumni,
    leads: [], notifications: [], audit: [], onboarding: club.onboarding,
    _rev: club._rev, _savedAt: club._savedAt, _demo: club._demo,
    settings: {
      ...club.settings,
      // Cost models, salary bands, margins, fees and pricing levers belong
      // to owners. Non-admin views use signed player fees and published
      // public catalog data instead of the organization-wide cost model.
      contingencyPct: 0,
      membershipMonthly: 0,
      facilityMonthly: 0,
      fundingPlayers: 0,
      cardFeePct: 0,
      orgFeeFloor: 0,
      orgFeeCeiling: 0,
      coachPayMin: 0,
      coachPayMax: 0,
      cageHourly: 0,
      roundTo: 0,
    },
  };

  if (role === "coach") {
    const teams = club.teams
      .filter(team => coachHoldsTeam(club, identity.email, team.id))
      .map((team) => ({
        ...team,
        // A coach needs their own pay, not coworkers' wages or HR records.
        staff: team.staff.map(member =>
          norm(member.email) === norm(identity.email)
            ? member
            : { ...member, monthly: 0, applyAmount: 0, childId: "", w9: false,
                backgroundCheck: false, safeSport: false, expires: "" },
        ),
        orgFee: 0,
        coachMonthly: 0,
        eventBudget: 0,
        otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
        roster: team.roster.map(dropPayment),
      }));
    return {
      ...next,
      teams,
      notifications: visibleNotifications(club,teams,role),
      leads: [],
      audit: [],
    };
  }

  const teams: Team[] = club.teams
    .filter((team) => team.roster.some((p) => visiblePlayer(p,role,identity)))
    .map((team) => {
      const roster = team.roster.filter(p => visiblePlayer(p,role,identity)).map(p =>
        role === "player" || !ownsPlayer(p,identity) ? dropPlayerBilling(p) : p);
      const permittedPlayerIds = new Set(roster.map(player => player.id));
      // Roster scoping alone is not enough: team-level records may carry
      // another family's attendance, health-related workload, or staff notes.
      return {
        ...team,
        staff: team.staff.map((s) => ({ ...s, monthly: 0, applyAmount: 0, childId: "", w9: false, backgroundCheck: false, safeSport: false, expires: "" })),
        orgFee: 0,
        coachMonthly: 0,
        eventBudget: 0,
        otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
        notes: "",
        messages: [],
        attendance: Object.fromEntries(Object.entries(team.attendance).map(
          ([practiceId, attendance]) => [
            practiceId,
            Object.fromEntries(Object.entries(attendance).filter(([playerId]) => permittedPlayerIds.has(playerId))),
          ],
        )),
        pitchLog: team.pitchLog.filter(outing => permittedPlayerIds.has(outing.playerId)),
        roster,
      };
    });
  return {
    ...next,
    teams,
    notifications: visibleNotifications(club,teams,role),
    leads: [],
    audit: [],
  };
}

export function mergeSave(
  stored: ClubRecord,
  incoming: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
): ClubRecord {
  if (role === "admin") return { ...incoming, audit: stored.audit, _rev: stored._rev + 1, _savedAt: new Date().toISOString() };

  if (role === "coach") {
    const next = structuredClone(stored);
    for (const team of incoming.teams) {
      const idx = next.teams.findIndex((t) => t.id === team.id);
      if (idx < 0) continue;
      const owned = coachHoldsTeam(stored, identity.email, team.id);
      if (!owned) continue;
      next.teams[idx] = {
        ...next.teams[idx],
        tournamentIds: [...next.teams[idx].tournamentIds.filter(id=>stored.catalog.some(e=>e.id===id&&e.org==='Team schedule')), ...team.tournamentIds.filter(id=>!stored.catalog.some(e=>e.id===id&&e.org==='Team schedule'))],
        // UUID activities are owned by the shared schedule API, not bulk desk saves.
        practices: [...next.teams[idx].practices.filter(p=>/^[a-f0-9-]{36}$/.test(p.id)), ...team.practices.filter(p=>!/^[a-f0-9-]{36}$/.test(p.id))],
        announcements: team.announcements,

        attendance: team.attendance,
        pitchLog: team.pitchLog,

        notes: team.notes,
        roster: next.teams[idx].roster.map((p) => {
          const incomingP = team.roster.find((x) => x.id === p.id);
          if (!incomingP) return p;
          return {
            ...p,
            number: incomingP.number,
            name: incomingP.name,
            positions: incomingP.positions,
            bats: incomingP.bats,
            throws: incomingP.throws,
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
        if (!visiblePlayer(p,role,identity)) return p;
        const incomingTeam = incoming.teams.find((t) => t.id === team.id);
        const incomingP = incomingTeam?.roster.find((x) => x.id === p.id);
        if (!incomingP) return p;
        return {
          ...p,
          rsvp: incomingP.rsvp,
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
      if (!ownsPlayer(p,identity) && !identity.playerIds?.includes(p.id)) return p;
      const incomingTeam = incoming.teams.find((t) => t.id === team.id);
      const incomingP = incomingTeam?.roster.find((x) => x.id === p.id);
      if (!incomingP) return p;
      if(!ownsPlayer(p,identity))return {...p,rsvp:incomingP.rsvp};
      return {
        ...p,
        order: incomingP.order,
        prefs: incomingP.prefs,
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
  if (!team || !norm(email)) return false;
  return (
    team.coachEmail.trim().toLowerCase() === email.trim().toLowerCase() ||
    team.staff.some((s) => /coach/i.test(s.role) && s.email.trim().toLowerCase() === email.trim().toLowerCase())
  );
}

export function familyHoldsPlayer(club: ClubRecord, familyId: string, playerId: string) {
  return club.teams.some((t) => t.roster.some((p) => p.id === playerId && p.familyId === familyId));
}

export function canFetchTeam(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
  teamId: string,
): boolean {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return false;
  if (role === "admin") return true;
  if (role === "coach") return coachHoldsTeam(club, identity.email, teamId);
  return team.roster.some((p) => visiblePlayer(p,role,identity));
}

export function canFetchPlayer(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
  playerId: string,
): boolean {
  if (role === "admin") {
    return club.teams.some((t) => t.roster.some((p) => p.id === playerId));
  }
  if (role === "coach") {
    const team = club.teams.find((t) => t.roster.some((p) => p.id === playerId));
    return team ? coachHoldsTeam(club, identity.email, team.id) : false;
  }
  if (role === "parent") return club.teams.some(t=>t.roster.some(p=>p.id===playerId&&visiblePlayer(p,role,identity)));
  return club.teams.some(t=>t.roster.some(p=>p.id===playerId&&visiblePlayer(p,role,identity)));
}

/** Crafted roster request. Returns null instead of leaking another team's names. */
export function fetchTeamRecord(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
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
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
  playerId: string,
): Player | null {
  if (!canFetchPlayer(club, role, identity, playerId)) return null;
  const scoped = scopeClub(club, role, identity);
  return scoped.teams.flatMap((t) => t.roster).find((p) => p.id === playerId) ?? null;
}

/** Match both request identifiers before returning any roster data to the caller. */
export function fetchPlayerRecordForTeam(
  club: ClubRecord,
  role: "admin" | "coach" | "parent" | "player",
  identity: { email: string; familyId: string; familyIds?:string[];playerIds?:string[];guardianHouseholdIds?:string[] },
  teamId: string,
  playerId: string,
): Player | null {
  const team = fetchTeamRecord(club, role, identity, teamId);
  return team?.roster.find(player => player.id === playerId && player.teamId === teamId) ?? null;
}
