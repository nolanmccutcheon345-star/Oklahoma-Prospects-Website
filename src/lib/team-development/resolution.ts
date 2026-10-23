export type TeamDevAssignmentScope = "team" | "position" | "selected" | "override";
export type TeamDevResolvedAssignment = {
  id: string;
  program_type: string;
  scope: TeamDevAssignmentScope;
  created_at: Date | string;
  targets: { athlete_id?: string | null; position?: string | null; target_key: string }[];
};
const RANK: Record<TeamDevAssignmentScope,number> = {team:1,position:2,selected:3,override:4};

export function assignmentApplies(
  assignment: TeamDevResolvedAssignment,
  athleteId: string,
  positions: string[],
  teamId: string,
) {
  return assignment.targets.some(target => {
    if (target.athlete_id) return target.athlete_id === athleteId;
    if (assignment.scope === "position" && target.position)
      return positions.includes(target.position);
    if (assignment.scope === "team")
      return target.target_key === "team:"+teamId;
    return false;
  });
}

export function resolveEffectiveAssignments(
  assignments: TeamDevResolvedAssignment[],
  athleteId: string,
  positions: string[],
  teamId: string,
) {
  const byType = new Map<string,TeamDevResolvedAssignment>();
  for (const assignment of assignments) {
    if (!assignmentApplies(assignment,athleteId,positions,teamId)) continue;
    const current=byType.get(assignment.program_type);
    if (!current || RANK[assignment.scope] > RANK[current.scope] ||
      (RANK[assignment.scope]===RANK[current.scope] && new Date(assignment.created_at).getTime()>new Date(current.created_at).getTime()))
      byType.set(assignment.program_type,assignment);
  }
  return [...byType.values()];
}
