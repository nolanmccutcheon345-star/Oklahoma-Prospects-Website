import type { DevelopmentData } from "./types";
import type { TrainingAssignment, TrainingLog } from "./training";
import { developmentPrograms, compatibleProgram } from "./development-programs";
import { skillBands } from "./training-catalog";
import type { LessonSport } from "./lesson-templates";
export type Evidence = {
  id: string;
  kind: string;
  date: string;
  text: string;
  source: "coach record" | "family intake" | "recorded workload" | "self-report" | "recorded data";
};
const recent = <T extends { date: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
export function developmentEvidence(file: DevelopmentData, athleteId: string, today: string) {
  const a = file.athletes.find((a) => a.id === athleteId);
  const evidence: Evidence[] = [];
  const add = (
    id: string,
    kind: string,
    date: string,
    text: string,
    source: Evidence["source"] = "coach record",
  ) => {
    if (text.trim()) evidence.push({ id, kind, date, text, source });
  };
  for (const x of file.goals.filter((x) => x.athleteId === athleteId))
    add(x.id, "Goal", "", `${x.title}: ${x.target}`, "recorded data");
  for (const x of recent(
    file.evaluations.filter((x) => x.athleteId === athleteId && x.date <= today),
  ))
    add(x.id, "Evaluation", x.date, x.summary);
  for (const x of recent(
    file.scorecards.filter((x) => x.athleteId === athleteId && x.date <= today),
  ))
    add(
      x.id,
      "Technical assessment",
      x.date,
      x.categories.map((c) => `${c.name}: ${c.score}`).join("; "),
    );
  for (const x of recent(file.lessons.filter((x) => x.athleteId === athleteId && x.date <= today)))
    add(x.id, "Lesson", x.date, `${x.focus}: ${x.notes}`);
  for (const x of recent(file.bullpens.filter((x) => x.athleteId === athleteId && x.date <= today)))
    add(x.id, "TCI / bullpen", x.date, `${x.pitches} pitches; recorded TCI ${x.tci}. ${x.notes}`);
  for (const x of file.intake.filter((x) => x.athleteId === athleteId))
    add(
      `intake:${athleteId}`,
      "Intake",
      "",
      `Goals: ${x.goals || "not recorded"}. Restrictions: ${x.health || "not recorded"}.`,
      "family intake",
    );
  for (const x of recent(file.metrics.filter((x) => x.athleteId === athleteId && x.date <= today)))
    add(
      x.id,
      "Recorded measurement",
      x.date,
      `${x.name}: ${x.value}. This view does not confer recruiting verification.`,
      "recorded data",
    );
  return {
    position: a?.position || "Not recorded",
    evidence,
    missing: [
      ...(!a?.position ? ["Position"] : []),
      ...(!file.intake.some((x) => x.athleteId === athleteId && x.complete)
        ? ["Completed intake"]
        : []),
      ...(!file.evaluations.some((x) => x.athleteId === athleteId) ? ["Coach evaluation"] : []),
      ...(!file.scorecards.some((x) => x.athleteId === athleteId) ? ["Technical baseline"] : []),
      ...(!file.goals.some((x) => x.athleteId === athleteId) ? ["Development goal"] : []),
      "Confirm available equipment, family time, team activity and restrictions with the family before assignment",
    ],
  };
}
export function recommendPrograms(
  context: ReturnType<typeof developmentEvidence>,
  sport: LessonSport,
  age: number,
  skill: (typeof skillBands)[number],
) {
  return developmentPrograms
    .filter((p) => compatibleProgram(p, sport, age, skillBands.indexOf(skill)))
    .map((p) => {
      const matched = context.evidence.filter((e) =>
        p.keywords.some((k) =>
          new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(e.text),
        ),
      );
      return {
        programId: p.id,
        name: p.name,
        findings: matched.map((e) => ({ id: e.id, kind: e.kind, date: e.date, text: e.text })),
        reason: matched.length
          ? `Consider after reviewing ${matched.length} matching recorded finding(s); a keyword match is a review aid, not a diagnosis or confirmed weakness.`
          : "No matching finding recorded. Observe the baseline before considering this program.",
        evaluate: p.baseline,
        limitations: [...context.missing, p.recovery],
        score: p.keywords.filter((k) => matched.some((e) => e.text.toLowerCase().includes(k)))
          .length,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
const daysBetween = (a: string, b: string) =>
  Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);
export function pitchingRest(age: number, pitches: number) {
  if (age < 7 || age > 18) return null;
  const thresholds =
    age <= 14
      ? [20, 35, 50, 65]
      : age <= 16
        ? [30, 45, 60, 75]
        : age <= 18
          ? [30, 45, 60, 80]
          : [30, 45, 60, 80, 105];
  const days = thresholds.findIndex((n) => pitches <= n);
  return days < 0 ? thresholds.length : days;
}
export function developmentWorkload(
  file: DevelopmentData,
  athleteId: string,
  assignments: TrainingAssignment[],
  logs: TrainingLog[],
  today: string,
  sport: string,
  age: number | null,
) {
  const warnings: string[] = [];
  const games = file.outings.filter(
    (x) =>
      x.athleteId === athleteId &&
      daysBetween(today, x.date) >= 0 &&
      daysBetween(today, x.date) <= 14,
  );
  const workload = file.workload.filter(
    (x) =>
      x.athleteId === athleteId &&
      daysBetween(today, x.date) >= 0 &&
      daysBetween(today, x.date) <= 14,
  );
  const lessons = file.bookings
    .filter(
      (x) =>
        x.athleteId === athleteId &&
        x.status !== "cancelled" &&
        Math.abs(daysBetween(x.date, today)) <= 14,
    )
    .map((x) => ({ id: x.id, date: x.date, serviceId: x.serviceId, status: x.status }));
  const throwing = file.throwingDays.filter(
    (x) => x.athleteId === athleteId && Math.abs(daysBetween(x.date, today)) <= 14,
  );
  const strength = file.strengthAssignments
    .filter((x) => x.athleteId === athleteId && x.status === "published")
    .map((x) => ({
      id: x.id,
      createdAt: x.createdAt,
      phase: x.program.phase,
      sessionNote: x.program.sessionNote,
    }));
  const active = assignments.filter((a) => ["active", "paused"].includes(a.status));
  if (active.some((a) => a.status === "paused"))
    warnings.push(
      "A training hold is active. Resolve the documented concern before prescribing more activity.",
    );
  const counts: Record<string, number> = {};
  for (const a of active)
    for (const t of a.document.tasks)
      if (t.date >= today) counts[t.date] = (counts[t.date] || 0) + 1;
  const overlaps = Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([date, count]) => ({ date, count }));
  if (overlaps.length)
    warnings.push(
      "Multiple assigned tasks share dates. Coaches must coordinate dose and recovery; task count does not measure physiological load.",
    );
  if (strength.length || throwing.length)
    warnings.push(
      "Existing throwing or strength prescriptions are present. Review their calendar and loading before adding this plan.",
    );
  if (!games.length && !workload.length)
    warnings.push(
      "Recent game/throwing workload is missing. Missing data does not mean zero activity.",
    );
  if (
    file.armCare.some(
      (x) =>
        x.athleteId === athleteId &&
        daysBetween(today, x.date) >= 0 &&
        daysBetween(today, x.date) <= 7 &&
        x.feel >= 7,
    )
  )
    warnings.push("A recent arm-care entry needs a coach readiness review.");
  let restUntil: string | null = null;
  if (sport === "baseball" && age !== null) {
    // Only records explicitly classified as game pitching drive Pitch Smart rest.
    // Home throw counts and bullpen pitches remain separate, never added as duplicate game pitches.
    const daily = new Map<string, number>();
    for (const g of games)
      if (g.pitches !== undefined) daily.set(g.date, (daily.get(g.date) || 0) + g.pitches);
    for (const [date, n] of daily) {
      const max = age <= 8 ? 50 : age <= 10 ? 75 : age <= 12 ? 85 : age <= 16 ? 95 : 105;
      if (age >= 7 && age <= 18 && n > max)
        warnings.push(
          `Recorded game pitching on ${date} exceeds the age-band daily limit. Stop additional pitching and obtain a qualified workload review; the rest date is not clearance.`,
        );
      const days = pitchingRest(age, n);
      if (days === null) {
        warnings.push(
          "No built-in Pitch Smart band for this age. A qualified coach must establish appropriate guidance.",
        );
        continue;
      }
      const until = new Date(Date.parse(date) + (days + 1) * 86400000).toISOString().slice(0, 10);
      if (days > 0 && until > today && (!restUntil || until > restUntil)) restUntil = until;
    }
    if (restUntil)
      warnings.push(
        `Recorded baseball game pitching indicates no additional pitching before ${restUntil}, subject to stricter league rules and readiness review.`,
      );
  } else if (sport === "softball")
    warnings.push(
      "Windmill workload requires separate softball review. Baseball pitch-count/rest bands are not applied.",
    );
  return {
    games,
    workload,
    lessons,
    throwing,
    strength,
    overlaps,
    restUntil,
    warnings,
    homeReports: logs.map((l) => ({
      assignmentId: l.assignment_id,
      taskId: l.task_id,
      throws: l.document.throws,
      minutes: l.document.minutes,
      rpe: l.document.rpe,
      fatigue: l.document.fatigue,
      pain: l.document.pain,
      source: l.document.source,
    })),
    note: "These are separate reported and scheduled records, not a verified combined throw total. Check duplicate reports, unrecorded team activity and league-specific restrictions.",
  };
}
