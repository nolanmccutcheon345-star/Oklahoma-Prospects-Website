import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import {
  loadFinancialContextInTransaction,
  lockFinancialExecution,
  type FinancialContext,
} from "../finance/context.server";
import { mutateStoredClub, writeStoredClub } from "./club-store.server";
import { assertRosterAssignment } from "./po-roster.server";
import { assertPORosterSpace, inquiryRosterInput } from "./po-roster";
import { assertTeamInquiryPlacement } from "./inquiry-placement";
import { blankPlayer } from "./blank-player";
import { assignmentStatusByPlayer, type AssignmentStatus } from "./recipients.server";
import {
  ADDITIONAL_TEAM_REASON_MIN,
  assignToTeamInput,
  setAssignmentStatusInput,
  type AssignableCandidate,
  type AssignedMember,
  type AssignToTeamInput,
  type SetAssignmentStatusInput,
} from "./roster-assignment-contracts";
import type { ClubRecord, Player, Team } from "./types";

type Source = "registration" | "account" | "office" | "coach";

/** Server-side Front Office gate. Coaches, coordinators, parents, players and guests are refused. */
export async function requireFrontOffice(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Front office only.");
  return me;
}

const norm = (s: string | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** Guardian contact always comes from the household record, never from typed input,
 * and is never a player's own account. */
export async function householdGuardian(tx: Sql, householdId: string | null | undefined) {
  if (!householdId) throw new Error("No guardian household is on file for this player.");
  const [home] = await tx<{
    id: string;
    primary_email: string;
  }>`select id,primary_email from club_households where id=${householdId}`;
  if (!home?.primary_email) throw new Error("No guardian household is on file for this player.");
  const email = home.primary_email.trim().toLowerCase();
  const [account] = await tx<{
    name: string;
    role: string | null;
  }>`select u.name,p.role from "user" u left join profiles p on p.user_id=u.id where lower(trim(u.email))=${email} limit 1`;
  if (account?.role === "player")
    throw new Error(
      "The household contact on file is a player account. A guardian must add their own email before this player is assigned.",
    );
  return { householdId: home.id, email, name: account?.name || "Guardian" };
}

/** Other open teams where this athlete is already a live member. */
export async function liveTeamsFor(
  tx: Sql,
  club: ClubRecord,
  who: { teamId: string; athleteId?: string | null; householdId?: string | null; name: string },
) {
  const others = new Set<string>();
  if (who.athleteId) {
    const rows = await tx<{
      team_id: string;
      roster_id: string | null;
      status: string;
    }>`select team_id,roster_player_id roster_id,status from roster_assignments where athlete_id=${who.athleteId} and status<>'removed' and team_id<>${who.teamId}
       union select team_id,roster_id,'linked' from recruiting_roster_links where athlete_id=${who.athleteId} and team_id<>${who.teamId}`;
    for (const r of rows) {
      const team = club.teams.find((t) => t.id === r.team_id && !t.closed);
      if (!team) continue;
      if (r.status === "invited" || r.status === "accepted") continue;
      if (team.roster.some((p) => p.id === r.roster_id && !p.withdrawn)) others.add(team.id);
    }
  }
  if (who.householdId) {
    for (const team of club.teams) {
      if (team.id === who.teamId || team.closed) continue;
      const statuses = await assignmentStatusByPlayer(tx, team.id);
      if (
        team.roster.some(
          (p) =>
            !p.withdrawn &&
            p.familyId === who.householdId &&
            norm(p.name) === norm(who.name) &&
            statuses.get(p.id) !== "removed",
        )
      )
        others.add(team.id);
    }
  }
  return [...others];
}

export function assertSecondTeamReason(club: ClubRecord, others: string[], reason: string) {
  if (!others.length) return "";
  if (reason.trim().length < ADDITIONAL_TEAM_REASON_MIN) {
    const names = others.map((id) => club.teams.find((t) => t.id === id)?.name || "another team");
    throw new Error(
      `This player is already on ${names.join(", ")}. Enter a reason (at least ${ADDITIONAL_TEAM_REASON_MIN} characters) to place them on a second live team.`,
    );
  }
  return reason.trim();
}

/** Append-only status record. One row per (team, roster player); pre-roster offers key on the request. */
export async function recordAssignment(
  tx: Sql,
  a: {
    actor: string;
    action: string;
    teamId: string;
    status: AssignmentStatus;
    source: Source;
    rosterPlayerId?: string;
    athleteId?: string | null;
    requestId?: string | null;
    householdId?: string | null;
    reason?: string;
    additionalTeamReason?: string;
  },
) {
  const [existing] = a.rosterPlayerId
    ? await tx<{
        id: string;
        status: string;
      }>`select id,status from roster_assignments where team_id=${a.teamId} and roster_player_id=${a.rosterPlayerId} for update`
    : a.requestId
      ? await tx<{
          id: string;
          status: string;
        }>`select id,status from roster_assignments where request_id=${a.requestId} and status<>'removed' for update`
      : [];
  const [byRequest] =
    !existing && a.requestId
      ? await tx<{
          id: string;
          status: string;
        }>`select id,status from roster_assignments where request_id=${a.requestId} and status<>'removed' and roster_player_id is null for update`
      : [];
  const row = existing || byRequest;
  let id: string;
  if (row) {
    id = row.id;
    if (row.status === a.status && !a.rosterPlayerId === !existing) return id;
    await tx`update roster_assignments set status=${a.status},team_id=${a.teamId},
      roster_player_id=coalesce(${a.rosterPlayerId ?? null},roster_player_id),
      athlete_id=coalesce(${a.athleteId ?? null},athlete_id),
      household_id=coalesce(${a.householdId ?? null},household_id),
      additional_team_reason=case when ${a.additionalTeamReason || ""}='' then additional_team_reason else ${a.additionalTeamReason || ""} end,
      revision=revision+1,updated_by=${a.actor},updated_at=now() where id=${id}`;
  } else {
    id = randomUUID();
    await tx`insert into roster_assignments(id,team_id,roster_player_id,athlete_id,request_id,household_id,status,source,additional_team_reason,created_by,updated_by)
      values(${id},${a.teamId},${a.rosterPlayerId ?? null},${a.athleteId ?? null},${a.requestId ?? null},${a.householdId ?? null},${a.status},${a.source},${a.additionalTeamReason || ""},${a.actor},${a.actor})`;
  }
  await tx`insert into roster_assignment_audit(assignment_id,actor_id,action,from_status,to_status,reason)
    values(${id},${a.actor},${a.action},${row?.status ?? null},${a.status},${[a.reason, a.additionalTeamReason].filter(Boolean).join(" · ")})`;
  return id;
}

async function assertRole(tx: Sql, team: Team, role: "full" | "po", financial: FinancialContext, excludeRequest = "") {
  if (financial.mode === "basis") {
    if (role === "po") assertPORosterSpace(team);
  } else await assertRosterAssignment(tx, team, role, "", excludeRequest);
}

async function ensureGuardianInvite(
  tx: Sql,
  actor: string,
  teamId: string,
  guardian: { householdId: string; email: string },
) {
  // An invitation row grants nothing until the guardian accepts it, and is not an email.
  const [open] = await tx`select id from club_invites where family_id=${guardian.householdId} and lower(email)=${guardian.email} and role='parent' and (team_id=${teamId} or team_id is null or team_id='') and (status='accepted' or (status='pending' and expires_at>now())) limit 1`;
  if (!open)
    await tx`insert into club_invites(id,token_hash,email,team_id,family_id,invited_by,role,expires_at) values(${randomUUID()},${randomUUID()},${guardian.email},${teamId},${guardian.householdId},${actor},'parent',now()+interval '7 days')`;
}

/** Registration review (formerly inline in reviewTeamInquiry). Caller has checked Front Office. */
export async function reviewTeamInquiryForOffice(
  sql: Sql,
  userId: string,
  raw: z.input<typeof inquiryRosterInput>,
) {
  const data = inquiryRosterInput.parse(raw);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const financial = await loadFinancialContextInTransaction(tx, userId, "owner");
    const [request] = await tx<{
      kind: string;
      payload: {
        player: string;
        parent: string;
        email: string;
        sport: string;
        age: string;
        preferredTeamId?: string;
        preferredCoachId?: string;
        rosterPlayerId?: string;
        athleteId?: string;
        school?: string;
        graduationYear?: string;
      };
    }>`select kind,payload from club_requests where id=${data.id} for update`;
    if (!request || !["tryout", "team-inquiry"].includes(request.kind))
      throw new Error("Choose a tryout or team inquiry.");
    const [row] = await tx<{
      payload: ClubRecord;
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects' for update`;
    if (!row) throw new Error("Open the club record first.");
    const club = { ...row.payload, _rev: row.rev },
      team = club.teams.find((t) => t.id === data.teamId);
    if (!team) throw new Error("Choose a current team.");
    if (request.payload.rosterPlayerId)
      return { ok: true, message: "This registration is already on a roster." };
    assertTeamInquiryPlacement(request.payload, team, data.acknowledgePreferenceOverride);
    if (data.stage === "offer" || data.stage === "accepted")
      await assertRole(tx, team, data.rosterRole!, financial, data.id);
    const leadId = "inquiry-" + data.id,
      prior = club.leads.find((l) => l.id === leadId);
    const lead = {
      id: leadId,
      name: request.payload.player,
      age: request.payload.age,
      stage: data.stage,
      grades: prior?.grades || {},
      teamId: team.id,
    };
    club.leads = [...club.leads.filter((l) => l.id !== leadId), lead];
    let rosterPlayerId: string | undefined;
    if (data.stage === "accepted") {
      const email = z.string().email().parse(request.payload.email).toLowerCase();
      await tx`insert into club_households(id,primary_email) values(${"fam-" + randomUUID()},${email}) on conflict(primary_email) do nothing`;
      const [household] = await tx<{
        id: string;
      }>`select id from club_households where primary_email=${email}`;
      const guardian = await householdGuardian(tx, household.id);
      const others = await liveTeamsFor(tx, club, {
        teamId: team.id,
        athleteId: request.payload.athleteId,
        householdId: household.id,
        name: request.payload.player,
      });
      const additionalTeamReason = assertSecondTeamReason(club, others, data.additionalTeamReason);
      const player = blankPlayer({
        teamId: team.id,
        familyId: household.id,
        name: request.payload.player,
        parentName: request.payload.parent || guardian.name,
        parentEmail: guardian.email,
        rosterRole: data.rosterRole!,
      });
      player.school = request.payload.school || "";
      player.gradYear = /^\d{4}$/.test(request.payload.graduationYear || "")
        ? request.payload.graduationYear!
        : "";
      if (request.payload.athleteId) {
        const [current] = await tx<{
          school: string;
          graduation_year: number | null;
          education_confirmed_at: unknown;
        }>`select school,graduation_year,education_confirmed_at from club_athletes where id=${request.payload.athleteId}`;
        if (current?.education_confirmed_at) {
          player.school = current.school;
          player.gradYear = current.graduation_year?.toString() || "";
        }
        await tx`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${request.payload.athleteId},${team.id},${player.id},${userId})`;
      }
      team.roster.push(player);
      rosterPlayerId = player.id;
      await tx`insert into club_invites(id,token_hash,email,team_id,family_id,invited_by,role,expires_at) values(${randomUUID()},${randomUUID()},${email},${team.id},${household.id},${userId},'parent',now()+interval '7 days')`;
      await recordAssignment(tx, {
        actor: userId,
        action: "assign",
        teamId: team.id,
        status: "active",
        source: "registration",
        rosterPlayerId,
        athleteId: request.payload.athleteId || null,
        requestId: data.id,
        householdId: household.id,
        additionalTeamReason,
      });
    } else if (data.stage === "offer") {
      await recordAssignment(tx, {
        actor: userId,
        action: "offer",
        teamId: team.id,
        status: "invited",
        source: "registration",
        requestId: data.id,
        athleteId: request.payload.athleteId || null,
      });
    } else {
      const [live] = await tx`select id from roster_assignments where request_id=${data.id} and status='invited' and roster_player_id is null`;
      if (live)
        await recordAssignment(tx, {
          actor: userId,
          action: "stage",
          teamId: team.id,
          status: "removed",
          source: "registration",
          requestId: data.id,
          reason: `Registration stage changed to ${data.stage}.`,
        });
    }
    const revision = club._rev;
    club._rev++;
    club._savedAt = new Date().toISOString();
    await tx`update club_requests set status=case when ${data.stage}='accepted' then 'accepted' else status end,payload=payload||${JSON.stringify({ stage: data.stage, teamId: team.id, ...(data.rosterRole ? { rosterRole: data.rosterRole } : {}), ...(rosterPlayerId ? { rosterPlayerId } : {}) })}::jsonb where id=${data.id}`;
    await writeStoredClub(tx, club, revision);
    if (rosterPlayerId)
      await (
        await import("./fee-notifications.server")
      ).queueFeeReadyInTransaction(tx, userId, { teamId: team.id, playerId: rosterPlayerId });
    return {
      ok: true,
      message: rosterPlayerId
        ? "Added to the roster. Ask the guardian to sign in at /invitations to accept access."
        : "Registration stage saved.",
    };
  });
}

/** Front Office: put a registered athlete or a website account's athlete on a team. */
export async function assignToTeam(sql: Sql, userId: string, raw: AssignToTeamInput) {
  const data = assignToTeamInput.parse(raw);
  await requireFrontOffice(sql, userId);
  if (data.source.kind === "registration")
    return reviewTeamInquiryForOffice(sql, userId, {
      id: data.source.requestId,
      teamId: data.teamId,
      stage: "accepted",
      rosterRole: data.rosterRole,
      acknowledgePreferenceOverride: data.acknowledgePreferenceOverride,
      additionalTeamReason: data.additionalTeamReason,
    });
  const athleteId = data.source.athleteId;
  let playerId = "";
  await mutateStoredClub(sql, userId, "owner", undefined, async (tx, club, financial) => {
    const team = club.teams.find((t) => t.id === data.teamId);
    if (!team || team.closed) throw new Error("Choose a current team.");
    const [athlete] = await tx<{
      id: string;
      name: string;
      household_id: string | null;
      household_email: string;
      school: string;
      graduation_year: number | null;
      education_confirmed_at: unknown;
    }>`select id,name,household_id,household_email,school,graduation_year,education_confirmed_at from club_athletes where id=${athleteId} for update`;
    if (!athlete) throw new Error("Choose a registered athlete.");
    const [home] = athlete.household_id
      ? [{ id: athlete.household_id }]
      : await tx<{
          id: string;
        }>`select id from club_households where primary_email=${athlete.household_email.trim().toLowerCase()}`;
    const guardian = await householdGuardian(tx, home?.id);
    const [already] = await tx`select 1 from recruiting_roster_links l where l.athlete_id=${athlete.id} and l.team_id=${team.id}
      union select 1 from roster_assignments a where a.athlete_id=${athlete.id} and a.team_id=${team.id} and a.status<>'removed'`;
    if (already) throw new Error("This athlete is already assigned to this team.");
    const others = await liveTeamsFor(tx, club, {
      teamId: team.id,
      athleteId: athlete.id,
      householdId: guardian.householdId,
      name: athlete.name,
    });
    const additionalTeamReason = assertSecondTeamReason(club, others, data.additionalTeamReason);
    await assertRole(tx, team, data.rosterRole, financial);
    const player = blankPlayer({
      teamId: team.id,
      familyId: guardian.householdId,
      name: athlete.name,
      parentName: guardian.name,
      parentEmail: guardian.email,
      rosterRole: data.rosterRole,
    });
    if (athlete.education_confirmed_at) {
      player.school = athlete.school;
      player.gradYear = athlete.graduation_year?.toString() || "";
    }
    await tx`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${athlete.id},${team.id},${player.id},${userId})`;
    team.roster.push(player);
    playerId = player.id;
    await ensureGuardianInvite(tx, userId, team.id, guardian);
    await recordAssignment(tx, {
      actor: userId,
      action: "assign",
      teamId: team.id,
      status: "active",
      source: "account",
      rosterPlayerId: player.id,
      athleteId: athlete.id,
      householdId: guardian.householdId,
      additionalTeamReason,
    });
    club.audit.unshift({
      at: new Date().toISOString(),
      action: "roster-assign",
      detail: `Assigned a registered athlete to ${team.name}`,
    });
  });
  return {
    ok: true,
    playerId,
    message: "Assigned to the roster. Ask the guardian to sign in at /invitations to accept access.",
  };
}

function hasBillingRecords(player: Player) {
  return Boolean(
    player.payments.length || player.feeLock || player.planLock || player.credits.length,
  );
}

/** Front Office: remove a member from future team notices or reinstate them.
 * Removal is a soft withdrawal; billing history is never deleted, and fee-bearing
 * changes stay with the Fees roster-status controls. */
export async function setAssignmentStatus(sql: Sql, userId: string, raw: SetAssignmentStatusInput) {
  const data = setAssignmentStatusInput.parse(raw);
  await requireFrontOffice(sql, userId);
  await mutateStoredClub(sql, userId, "owner", undefined, async (tx, club, financial) => {
    const team = club.teams.find((t) => t.id === data.teamId);
    if (!team) throw new Error("Choose a current team.");
    const player = team.roster.find((p) => p.id === data.playerId);
    if (!player) throw new Error("Player not found.");
    const status = (await assignmentStatusByPlayer(tx, team.id)).get(player.id);
    const independent = financial.feePlans.some(
      (p) => p.team_id === team.id && p.payload.budget.fundingModel === "independent",
    );
    const feeBearing = financial.mode === "legacy" && !independent && hasBillingRecords(player);
    const [link] = await tx<{
      athlete_id: string;
    }>`select athlete_id from recruiting_roster_links where team_id=${team.id} and roster_id=${player.id}`;
    if (data.status === "removed") {
      if (player.withdrawn && status === "removed") return;
      if (feeBearing && !player.withdrawn)
        throw new Error(
          "This player has billing records. Use the Fees roster status (Removed) so balances and removal thresholds apply.",
        );
      const { endRosterDevelopmentLink } = await import("../team-development/runtime.server");
      await endRosterDevelopmentLink(tx, { teamId: team.id, rosterPlayerId: player.id, actorId: userId });
      player.withdrawn = true;
    } else {
      if (!player.withdrawn && (status === undefined || status === "active")) return;
      if (player.withdrawn && (feeBearing || financial.mode === "basis"))
        throw new Error(
          "Reinstate this player from the Fees roster status so the financial season is reviewed first.",
        );
      const others = await liveTeamsFor(tx, club, {
        teamId: team.id,
        athleteId: link?.athlete_id,
        householdId: player.familyId,
        name: player.name,
      });
      const additionalTeamReason = assertSecondTeamReason(club, others, data.additionalTeamReason);
      player.withdrawn = false;
      await recordAssignment(tx, {
        actor: userId,
        action: "reinstate",
        teamId: team.id,
        status: "active",
        source: "office",
        rosterPlayerId: player.id,
        athleteId: link?.athlete_id ?? null,
        householdId: player.familyId || null,
        reason: data.reason,
        additionalTeamReason,
      });
      club.audit.unshift({
        at: new Date().toISOString(),
        action: "roster-reinstate",
        detail: `Reinstated a player on ${team.name}`,
      });
      return;
    }
    await recordAssignment(tx, {
      actor: userId,
      action: "remove",
      teamId: team.id,
      status: "removed",
      source: "office",
      rosterPlayerId: player.id,
      athleteId: link?.athlete_id ?? null,
      householdId: (await tx`select 1 from club_households where id=${player.familyId}`).length
        ? player.familyId
        : null,
      reason: data.reason,
    });
    club.audit.unshift({
      at: new Date().toISOString(),
      action: "roster-remove",
      detail: `Removed a player from ${team.name}`,
    });
  });
  return { ok: true, message: data.status === "removed" ? "Removed from the team." : "Reinstated." };
}

/** Front Office picker data: names and age/grad year only — no contact details, birth dates or medical data. */
export async function listAssignableCandidates(sql: Sql, userId: string, teamId: string) {
  await requireFrontOffice(sql, userId);
  return sql.transaction(async (tx) => {
    await loadFinancialContextInTransaction(tx, userId, "owner");
    const [row] = await tx<{ payload: ClubRecord }>`select payload from club_state where id='oklahoma-prospects'`;
    const club = typeof row?.payload === "string" ? JSON.parse(row.payload) : row?.payload;
    const team = (club as ClubRecord | undefined)?.teams.find((t) => t.id === teamId);
    if (!club || !team) throw new Error("Choose a current team.");
    const teamName = (id: string) => club.teams.find((t: Team) => t.id === id)?.name || "Another team";
    const requests = await tx<{
      id: string;
      player: string;
      age: string;
      sport: string;
      stage: string | null;
      preferred: string | null;
      has_email: boolean;
      athlete_id: string | null;
    }>`select id,payload->>'player' player,coalesce(payload->>'age','') age,coalesce(payload->>'sport','') sport,payload->>'stage' stage,payload->>'preferredTeamId' preferred,
         coalesce(payload->>'email','')<>'' has_email,payload->>'athleteId' athlete_id
       from club_requests where kind in ('tryout','team-inquiry') and status not in ('resolved','accepted','archived')
         and coalesce(payload->>'rosterPlayerId','')='' and coalesce(payload->>'player','')<>''
       order by created_at desc limit 300`;
    const registrations: AssignableCandidate[] = [];
    for (const r of requests) {
      if (norm(r.sport) && norm(r.sport) !== norm(team.sport)) continue;
      registrations.push({
        kind: "registration",
        id: r.id,
        name: r.player,
        detail: [r.age, r.stage ? `Tryout · ${r.stage}` : "Tryout registration"].filter(Boolean).join(" · "),
        guardianOnFile: r.has_email,
        preferredOtherTeam: Boolean(r.preferred && r.preferred !== team.id),
        otherTeams: r.athlete_id
          ? (await liveTeamsFor(tx, club, { teamId: team.id, athleteId: r.athlete_id, name: r.player })).map(teamName)
          : [],
      });
    }
    const athletes = await tx<{
      id: string;
      name: string;
      graduation_year: number | null;
      household_id: string | null;
      on_team: boolean;
    }>`select a.id,a.name,a.graduation_year,coalesce(a.household_id,h.id) household_id,
         exists(select 1 from recruiting_roster_links l where l.athlete_id=a.id and l.team_id=${team.id})
           or exists(select 1 from roster_assignments x where x.athlete_id=a.id and x.team_id=${team.id} and x.status<>'removed') on_team
       from club_athletes a left join club_households h on h.primary_email=lower(trim(a.household_email))
       order by a.name limit 500`;
    const accounts: AssignableCandidate[] = [];
    for (const a of athletes) {
      if (a.on_team) continue;
      accounts.push({
        kind: "account",
        id: a.id,
        name: a.name,
        detail: a.graduation_year ? `Class of ${a.graduation_year}` : "Website account",
        guardianOnFile: Boolean(a.household_id),
        preferredOtherTeam: false,
        otherTeams: (
          await liveTeamsFor(tx, club, {
            teamId: team.id,
            athleteId: a.id,
            householdId: a.household_id,
            name: a.name,
          })
        ).map(teamName),
      });
    }
    const statuses = await assignmentStatusByPlayer(tx, team.id);
    const members: AssignedMember[] = [];
    for (const p of team.roster as Player[]) {
      const [link] = await tx<{
        athlete_id: string;
      }>`select athlete_id from recruiting_roster_links where team_id=${team.id} and roster_id=${p.id}`;
      members.push({
        playerId: p.id,
        name: p.name,
        roleType: p.roleType,
        status: p.withdrawn ? "removed" : statuses.get(p.id) || "active",
        otherTeams: (
          await liveTeamsFor(tx, club, {
            teamId: team.id,
            athleteId: link?.athlete_id,
            householdId: p.familyId,
            name: p.name,
          })
        ).map(teamName),
      });
    }
    return { teamId: team.id, teamName: team.name, registrations, accounts, members };
  });
}
