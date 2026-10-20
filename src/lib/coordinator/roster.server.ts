import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { z } from "zod";
import {
  secured,
  authority,
  requireTeam,
  teamScope,
  audit,
  CoordinatorDenied,
} from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { savePlayerInTransaction } from "./organization.server";
import {
  rosterCandidateInput,
  rosterClearanceInput,
  rosterClearanceRevokeInput,
  rosterEligibleInput,
  rosterAdmissionInput,
  rosterInformationInput,
} from "./roster-contracts";
type Identity = {
  athlete_id: string;
  name: string;
  household_id: string;
  guardian_id: string;
  guardian_name: string;
  guardian_email: string;
};
async function identity(tx: Sql, athleteId: string, guardianId: string) {
  const [row] =
    await tx<Identity>`select a.id athlete_id,a.name,a.household_id,u.id guardian_id,u.name guardian_name,lower(trim(u.email)) guardian_email from club_athletes a join club_households h on h.id=a.household_id join "user" u on u.id=${guardianId} join profiles p on p.user_id=u.id where a.id=${athleteId} and u."emailVerified" and u."disabledAt" is null and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id) or (p.role<>'player' and h.primary_email=lower(trim(u.email)) and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id))) for share of a,h,u,p`;
  if (!row)
    throw Error(
      "A current verified guardian relationship is required. Review the household first.",
    );
  return row;
}
const identityDigest = (person: Identity) =>
  createHash("sha256").update(JSON.stringify(person)).digest("hex");
async function fingerprint(tx: Sql, person: Identity, teamId: string) {
  const team = await teamScope(tx, teamId);
  const [row] = await tx<{
    age: string;
    season: string;
  }>`select t->>'age' age,t->>'seasonLabel' season from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId}`;
  return createHash("sha256")
    .update(
      JSON.stringify({
        person,
        team: { id: team.id, sport: team.sport, age: row.age, season: row.season },
      }),
    )
    .digest("hex");
}
export async function ownerRosterEligibility(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterCandidateInput>,
) {
  const v = rosterCandidateInput.parse(raw);
  return secured(sql, userId, "staff.roster-eligibility.read", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const candidates = await tx<{
      id: string;
      name: string;
      guardianId: string;
      guardianName: string;
    }>`select distinct a.id,a.name,u.id "guardianId",u.name "guardianName" from club_athletes a join club_households h on h.id=a.household_id join "user" u on u."emailVerified" and u."disabledAt" is null join profiles p on p.user_id=u.id where (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id) or (p.role<>'player' and h.primary_email=lower(trim(u.email)) and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id))) and (a.name ilike ${"%" + v.search + "%"} or a.id=${v.search}) and not exists(select 1 from recruiting_roster_links l where l.athlete_id=a.id) order by a.name,a.id,u.name limit 100`;
    const clearances = await tx<{
      id: string;
      name: string;
      teamId: string;
      status: string;
      revision: number;
      expiresAt: string;
    }>`select c.id,a.name,c.team_id "teamId",c.status,c.revision,c.expires_at::text "expiresAt" from coordinator_roster_clearances c join club_athletes a on a.id=c.athlete_id where a.name ilike ${"%" + v.search + "%"} or a.id=${v.search} order by c.created_at desc limit 100`;
    const teams = await tx<{
      id: string;
      name: string;
      sport: string;
    }>`select t->>'id' id,t->>'name' name,t->>'sport' sport from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true' and t->>'sport' in ('baseball','softball') order by name`;
    const reviewedCandidates = [];
    for (const candidate of candidates) {
      const person = await identity(tx, candidate.id, candidate.guardianId);
      reviewedCandidates.push({ ...candidate, identityDigest: identityDigest(person) });
    }
    const [club] = await tx<{
      rev: number;
    }>`select rev from club_state where id='oklahoma-prospects' and not demo`;
    await audit(tx, userId, "staff.roster-eligibility.read", "", "allowed", {
      count: candidates.length,
    });
    return { candidates: reviewedCandidates, clearances, teams, clubRevision: club?.rev || 0 };
  });
}
export async function clearRosterEligibility(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterClearanceInput>,
) {
  const v = rosterClearanceInput.parse(raw);
  return secured(sql, userId, "staff.roster-eligibility.approve", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const team = await teamScope(tx, v.teamId),
      person = await identity(tx, v.athleteId, v.guardianId);
    if (new Date(v.expiresAt) <= new Date()) throw Error("Choose a future eligibility expiry.");
    const [club] = await tx<{
      rev: number;
    }>`select rev from club_state where id='oklahoma-prospects' and not demo for share`;
    if (club?.rev !== v.clubRevision || identityDigest(person) !== v.identityDigest)
      throw Error("The athlete, guardian or team changed. Refresh and review again.");
    const digest = await fingerprint(tx, person, team.id);
    const [prior] = await tx<{
      same: boolean;
    }>`select athlete_id=${v.athleteId} and guardian_id=${v.guardianId} and team_id=${v.teamId} and reviewed_by=${userId} and identity_digest=${digest} and expires_at=${v.expiresAt}::timestamptz and reason=${v.reason} as same from coordinator_roster_clearances where id=${v.id}`;
    if (prior) {
      if (!prior.same) throw Error("This eligibility reference was already used.");
      return { ok: true };
    }
    if (
      (await tx`select athlete_id from recruiting_roster_links where athlete_id=${v.athleteId}`)
        .length
    )
      throw Error("This athlete already has a roster identity. Use the reviewed transfer process.");
    await tx`insert into coordinator_roster_clearances(id,athlete_id,team_id,guardian_id,reviewed_by,identity_digest,status,reason,expires_at) values(${v.id},${v.athleteId},${team.id},${v.guardianId},${userId},${digest},'approved',${v.reason},${v.expiresAt})`;
    await audit(
      tx,
      userId,
      "staff.roster-eligibility.approve",
      v.id,
      "allowed",
      { athleteId: v.athleteId, expiresAt: v.expiresAt },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
export async function revokeRosterEligibility(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterClearanceRevokeInput>,
) {
  const v = rosterClearanceRevokeInput.parse(raw);
  return secured(sql, userId, "staff.roster-eligibility.revoke", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const rows =
      await tx`update coordinator_roster_clearances set status='revoked',revision=revision+1,updated_at=now() where id=${v.id} and revision=${v.revision} and status='approved' returning id`;
    if (!rows.length) throw Error("This eligibility decision changed. Refresh first.");
    await audit(tx, userId, "staff.roster-eligibility.revoke", v.id, "allowed", {
      reason: v.reason,
    });
    return { ok: true };
  });
}
export async function eligibleRosterAthletes(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterEligibleInput>,
) {
  const v = rosterEligibleInput.parse(raw);
  return secured(sql, userId, "rosters.eligible.read", async (tx) => {
    const team = await requireTeam(tx, userId, "rosters.add", v.teamId);
    const rows = await tx<{
      id: string;
      athleteId: string;
      name: string;
      revision: number;
      createdAt: string;
    }>`select c.id,c.athlete_id "athleteId",a.name,c.revision,to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') "createdAt" from coordinator_roster_clearances c join club_athletes a on a.id=c.athlete_id where c.team_id=${team.id} and c.status='approved' and c.expires_at>now() and (${v.before?.at || null}::timestamptz is null or (c.created_at,c.id)<(${v.before?.at || null}::timestamptz,${v.before?.id || null}::uuid)) order by c.created_at desc,c.id desc limit 101`;
    const [club] = await tx<{
      rev: number;
    }>`select rev from club_state where id='oklahoma-prospects' and not demo`;
    const last = rows.slice(0, 100).at(-1);
    await audit(
      tx,
      userId,
      "rosters.eligible.read",
      team.id,
      "allowed",
      { count: Math.min(rows.length, 100) },
      team.sport,
      team.id,
    );
    return {
      items: rows.slice(0, 100),
      clubRevision: club.rev,
      nextCursor: rows.length > 100 && last ? { at: last.createdAt, id: last.id } : null,
    };
  });
}
export async function addEligibleRosterAthlete(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterAdmissionInput>,
) {
  const v = rosterAdmissionInput.parse(raw);
  return secured(
    sql,
    userId,
    "rosters.add",
    async (tx) => {
      const team = await requireTeam(tx, userId, "rosters.add", v.teamId);
      const [c] = await tx<{
        athlete_id: string;
        team_id: string;
        guardian_id: string;
        reviewed_by: string;
        identity_digest: string;
        status: string;
        revision: number;
        roster_id: string;
        valid: boolean;
      }>`select *,expires_at>now() valid from coordinator_roster_clearances where id=${v.id} for update`;
      if (!c || c.team_id !== team.id) throw new CoordinatorDenied();
      if (c.status === "used" && c.revision === v.revision + 1)
        return { ok: true, playerId: c.roster_id };
      if (c.status !== "approved" || c.revision !== v.revision || !c.valid)
        throw Error("Eligibility changed or expired. Ask an owner to review it.");
      await authority(tx, c.reviewed_by, "staff_approvals.review");
      const person = await identity(tx, c.athlete_id, c.guardian_id);
      if ((await fingerprint(tx, person, team.id)) !== c.identity_digest)
        throw Error("The athlete, guardian or team changed. Request a fresh eligibility review.");
      if (
        (await tx`select athlete_id from recruiting_roster_links where athlete_id=${c.athlete_id}`)
          .length
      )
        throw Error("This athlete already has a roster identity. Request a transfer.");
      const playerId = randomUUID();
      await savePlayerInTransaction(
        tx,
        userId,
        {
          revision: v.clubRevision,
          teamId: team.id,
          playerId,
          changes: {
            name: person.name,
            parents: [
              {
                name: person.guardian_name,
                rel: "guardian",
                email: person.guardian_email,
                phone: "",
              },
            ],
          },
        },
        person.household_id,
      );
      await tx`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${c.athlete_id},${team.id},${playerId},${c.reviewed_by})`;
      await tx`insert into coordinator_publication_controls(kind,target_id,team_id) values('roster',${playerId},${team.id}),('photo',${c.athlete_id},${team.id}) on conflict do nothing`;
      await tx`update coordinator_roster_clearances set status='used',roster_id=${playerId},revision=revision+1,updated_at=now() where id=${v.id}`;
      await audit(
        tx,
        userId,
        "rosters.add",
        playerId,
        "allowed",
        { athleteId: c.athlete_id, clearanceId: v.id },
        team.sport,
        team.id,
      );
      return { ok: true, playerId };
    },
    lockFinancialExecution,
  );
}
export async function saveRosterInformation(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof rosterInformationInput>,
) {
  const v = rosterInformationInput.parse(raw);
  return secured(
    sql,
    userId,
    "rosters.information",
    async (tx) => {
      const team = await requireTeam(tx, userId, "rosters.information", v.teamId);
      const [row] = await tx<{
        old: Record<string, string>;
      }>`select jsonb_build_object('bats',p->>'bats','throws',p->>'throws','gradYear',p->>'gradYear','school',p->>'school') old from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${team.id} and p->>'id'=${v.playerId} and coalesce(p->>'withdrawn','false')<>'true' for update of c`;
      if (!row) throw new CoordinatorDenied();
      const { teamId, playerId, revision, ...changes } = v;
      const result = await savePlayerInTransaction(tx, userId, {
        teamId,
        playerId,
        revision,
        changes,
      });
      await audit(
        tx,
        userId,
        "rosters.information",
        v.playerId,
        "allowed",
        { before: row.old, after: changes },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}
