import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { chicagoDate } from "./scheduling";
import { coachHoldsTeam } from "./teams/privacy";
import type { ClubRecord } from "./teams/types";
import {
  evaluationInput,
  normalizedEvaluationAge,
  type EvaluationInput,
  type EvaluationCandidate,
  type EvaluationTeam,
  type SavedEvaluation,
  type EvaluationPayload,
  type EvaluationWorkspace,
} from "./tryout-evaluation-contracts";

async function evaluationAccess(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin" && me.role !== "coach" && !me.canTeamCoach)
    throw new Error("Coach or owner access is required.");
  if (me.role !== "admin") {
    const staff =
      await sql`select id from club_staff where lower(trim(email))=${me.email} and active=true
      and (role in ('coach','admin') or ${Boolean(me.canTeamCoach)}) and (user_id='' or user_id=${userId})`;
    if (!staff.length) throw new Error("An active staff assignment is required. Ask a club owner.");
  }
  const [state] = await sql<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects'`;
  const club = state
    ? typeof state.payload === "string"
      ? (JSON.parse(state.payload) as ClubRecord)
      : state.payload
    : null;
  const allTeams = club?.teams ?? [];
  const teams: EvaluationTeam[] = allTeams
    .filter(
      (t) => !t.closed && (me.role === "admin" || (club && coachHoldsTeam(club, me.email, t.id))),
    )
    .map((t) => ({ id: t.id, name: t.name, age: t.age, sport: t.sport }));
  // Owners retain historical results when a team closes. Coaches lose results
  // when their team assignment is removed, even if they authored them.
  return { me, teams };
}

type RequestRow = { id: string; kind: string; payload: Record<string, unknown> };
function candidateFor(row: RequestRow, teams: EvaluationTeam[]): EvaluationCandidate {
  const text = (k: string) =>
    typeof row.payload[k] === "string" ? (row.payload[k] as string) : "";
  const age = text("age"),
    sport = text("sport").toLowerCase(),
    assigned = text("teamId");
  const teamIds = teams
    .filter((t) =>
      assigned
        ? t.id === assigned
        : t.sport === sport && normalizedEvaluationAge(t.age) === normalizedEvaluationAge(age),
    )
    .map((t) => t.id);
  return { id: row.id, name: text("player"), age, sport, session: text("session"), teamIds };
}
type EvaluationRow = {
  id: string;
  registration_id: string | null;
  team_id: string;
  evaluator_id: string;
  evaluator_name: string;
  player_name: string;
  age_group: string;
  sport: "baseball" | "softball";
  evaluation_date: string | Date;
  status: "draft" | "submitted";
  recommendation: EvaluationInput["recommendation"];
  payload: EvaluationPayload;
  revision: number;
  updated_at: string | Date;
};
const iso = (value: string | Date) => new Date(value).toISOString();
function saved(row: EvaluationRow, userId: string): SavedEvaluation {
  return {
    id: row.id,
    registrationId: row.registration_id,
    teamId: row.team_id,
    evaluatorId: row.evaluator_id,
    evaluatorName: row.evaluator_name,
    playerName: row.player_name,
    ageGroup: row.age_group,
    sport: row.sport,
    evaluationDate:
      typeof row.evaluation_date === "string"
        ? row.evaluation_date.slice(0, 10)
        : iso(row.evaluation_date).slice(0, 10),
    status: row.status,
    recommendation: row.recommendation,
    payload: row.payload,
    revision: row.revision,
    updatedAt: iso(row.updated_at),
    canEdit: row.evaluator_id === userId,
  };
}
export async function evaluationWorkspaceFor(
  sql: Sql,
  userId: string,
): Promise<EvaluationWorkspace> {
  const { me, teams } = await evaluationAccess(sql, userId);
  const requests =
    await sql<RequestRow>`select id,kind,payload from club_requests where kind in ('tryout','team-inquiry') order by created_at desc,id desc`;
  const candidates = requests
    .map((row) => candidateFor(row, teams))
    .filter((c) => c.name && (me.role === "admin" || c.teamIds.length));
  const rows =
    me.role === "admin"
      ? await sql<EvaluationRow>`select * from tryout_evaluations order by evaluation_date desc,updated_at desc,id`
      : await sql<EvaluationRow>`select * from tryout_evaluations where team_id=any(${teams.map((t) => t.id)}::text[]) or (team_id='' and evaluator_id=${userId}) order by evaluation_date desc,updated_at desc,id`;
  return {
    owner: me.role === "admin",
    name: me.name,
    teams,
    candidates,
    evaluations: rows.map((r) => ({
      ...saved(r, userId),
      canEdit: r.evaluator_id === userId && (!r.team_id || teams.some((t) => t.id === r.team_id)),
    })),
  };
}

export async function saveEvaluationFor(
  sql: Sql,
  userId: string,
  raw: EvaluationInput,
): Promise<SavedEvaluation> {
  const input = evaluationInput.parse(raw);
  const { me, teams } = await evaluationAccess(sql, userId);
  const team = input.teamId
    ? teams.find((t) => t.id === input.teamId)
    : {
        id: "",
        name: "General tryout",
        age: normalizedEvaluationAge(input.ageGroup),
        sport: input.sport,
      };
  if (!team) throw new Error("Choose one of your assigned active teams.");
  if (!team.age && !input.registrationId)
    throw new Error("Enter an age group for this general tryout.");
  if (input.status === "submitted" && input.evaluationDate > chicagoDate())
    throw new Error("A future evaluation can be saved as a draft, but cannot be submitted yet.");
  if (
    input.status === "submitted" &&
    Object.values(input.payload.ratings).every((v) => v === null) &&
    input.recommendation !== "incomplete"
  )
    throw new Error("Record at least one rating, or choose Incomplete evaluation.");
  return sql.transaction(async (tx) => {
    await tx.query("select set_config('app.actor_id',$1,true)", [userId]);
    let playerName = input.playerName;
    if (input.registrationId) {
      const [request] =
        await tx<RequestRow>`select id,kind,payload from club_requests where id=${input.registrationId} and kind in ('tryout','team-inquiry') for share`;
      if (!request) throw new Error("Registration not found.");
      const candidate = candidateFor(request, teams);
      if (
        input.teamId
          ? !candidate.teamIds.includes(team.id)
          : me.role !== "admin" && !candidate.teamIds.length
      )
        throw new Error("This registration does not match your assigned teams.");
      playerName = candidate.name;
      if (!playerName) throw new Error("This registration has no player name.");
      if (!input.teamId) {
        if (!candidate.age.trim() || !["baseball", "softball"].includes(candidate.sport))
          throw new Error("This registration needs an age group and sport before evaluation.");
        team.age = normalizedEvaluationAge(candidate.age);
        team.sport = candidate.sport as "baseball" | "softball";
      }
    }
    const [existing] =
      await tx<EvaluationRow>`select * from tryout_evaluations where id=${input.id} for update`;
    if (
      existing &&
      (existing.evaluator_id !== userId ||
        (existing.team_id && !teams.some((t) => t.id === existing.team_id)))
    )
      throw new Error(
        "Only the original evaluator can edit this evaluation while assigned to its team.",
      );
    if (
      existing &&
      (existing.registration_id !== input.registrationId || existing.team_id !== input.teamId)
    )
      throw new Error("Start a new evaluation to change the player registration or team.");
    const same = (row: EvaluationRow) =>
      row.evaluator_id === userId &&
      row.team_id === team.id &&
      row.registration_id === input.registrationId &&
      row.player_name === playerName &&
      (input.teamId !== "" || (row.age_group === team.age && row.sport === team.sport)) &&
      saved(row, userId).evaluationDate === input.evaluationDate &&
      row.status === input.status &&
      row.recommendation === input.recommendation &&
      JSON.stringify(evaluationInput.shape.payload.parse(row.payload)) ===
        JSON.stringify(input.payload);
    if (existing && existing.revision !== input.baseRevision) {
      if (same(existing)) return saved(existing, userId); // A lost response may be retried without duplicating or overwriting.
      throw new Error(
        "This evaluation changed in another window. Reopen the latest saved version before editing.",
      );
    }
    if (!existing && input.baseRevision !== 0)
      throw new Error("Evaluation not found. Refresh the results.");
    let rows: EvaluationRow[];
    if (existing) {
      rows =
        await tx<EvaluationRow>`update tryout_evaluations set player_name=${playerName},evaluation_date=${input.evaluationDate}::date,
        status=${input.status},recommendation=${input.recommendation},payload=${JSON.stringify(input.payload)}::jsonb,
        age_group=${input.teamId ? existing.age_group : team.age},sport=${input.teamId ? existing.sport : team.sport},
        revision=revision+1,updated_at=now() where id=${input.id} and evaluator_id=${userId} and revision=${input.baseRevision} returning *`;
    } else {
      rows =
        await tx<EvaluationRow>`insert into tryout_evaluations(id,registration_id,team_id,evaluator_id,evaluator_name,player_name,age_group,sport,evaluation_date,status,recommendation,payload)
        values(${input.id},${input.registrationId},${team.id},${userId},${me.name},${playerName},${team.age},${team.sport},${input.evaluationDate}::date,${input.status},${input.recommendation},${JSON.stringify(input.payload)}::jsonb)
        on conflict(id) do nothing returning *`;
      if (!rows.length) {
        const [retry] =
          await tx<EvaluationRow>`select * from tryout_evaluations where id=${input.id}`;
        if (retry && same(retry)) return saved(retry, userId);
        throw new Error(
          "This evaluation request already exists with different details. Refresh the results.",
        );
      }
    }
    if (!rows[0]) throw new Error("This evaluation changed. Reopen the saved version.");
    return saved(rows[0], userId);
  });
}
