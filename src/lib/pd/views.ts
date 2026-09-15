import type { RecordGroupDef, RecordViewId, ViewerRole } from "./types";

export const RECORD_GROUPS: RecordGroupDef[] = [
  {
    id: "development",
    label: "Development",
    views: [
      { id: "overview", label: "Overview" },
      { id: "plan", label: "Development Plan" },
      { id: "diagnose", label: "Diagnose" },
      { id: "cohort", label: "Cohort" },
      { id: "scorecard", label: "Scorecard" },
      { id: "game-iq", label: "Game IQ", coachOnly: true },
      { id: "evaluations", label: "Evaluations" },
      { id: "report-card", label: "Report Card" },
      { id: "peer-benchmarks", label: "Peer Benchmarks" },
      { id: "velocity", label: "Velocity Potential" },
      { id: "goals", label: "Goals" },
      { id: "arsenal", label: "Arsenal" },
      { id: "pitch-design", label: "Pitch Design" },
    ],
  },
  {
    id: "training",
    label: "Training",
    views: [
      { id: "skill-plan", label: "Skill Plan" },
      { id: "strength", label: "Strength" },
      { id: "warmups", label: "Warm-Ups" },
      { id: "bullpens", label: "Bullpens/TCI" },
      { id: "workload", label: "Workload" },
      { id: "points", label: "Activity Points" },
      { id: "leaderboard", label: "Leaderboard" },
      { id: "arm-care", label: "Arm Care" },
      { id: "physical", label: "Physical Testing" },
      { id: "metrics", label: "Metrics" },
    ],
  },
  {
    id: "record",
    label: "Record",
    views: [
      { id: "lessons", label: "Lessons" },
      { id: "game-film", label: "Game Film" },
      { id: "video-standards", label: "Video Standards" },
      { id: "reports", label: "Reports" },
      { id: "recruiting", label: "Recruiting Profile" },
      { id: "intake", label: "Intake" },
      { id: "videos", label: "Videos" },
      { id: "documents", label: "Documents" },
      { id: "messages", label: "Messages" },
    ],
  },
];

export const ALL_RECORD_VIEW_IDS: RecordViewId[] = RECORD_GROUPS.flatMap((g) =>
  g.views.map((v) => v.id),
);

export const COACH_ONLY_VIEWS: RecordViewId[] = RECORD_GROUPS.flatMap((g) =>
  g.views.filter((v) => v.coachOnly).map((v) => v.id),
);

if (ALL_RECORD_VIEW_IDS.length !== 32) {
  throw new Error(
    `PD OS: expected 32 athlete record views, got ${ALL_RECORD_VIEW_IDS.length}`,
  );
}

export function groupForView(id: RecordViewId) {
  return RECORD_GROUPS.find((group) => group.views.some((view) => view.id === id));
}

export function viewsForRole(role: ViewerRole) {
  const coach = role === "admin" || role === "coach";
  return RECORD_GROUPS.map((group) => ({
    ...group,
    views: group.views.filter((view) => (view.coachOnly ? coach : true)),
  })).filter((group) => group.views.length > 0);
}
