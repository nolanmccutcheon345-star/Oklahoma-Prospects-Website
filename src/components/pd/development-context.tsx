import type { loadTraining } from "@/lib/pd/training-api";
import { recommendPrograms } from "@/lib/pd/development-evidence";
import { skillBands } from "@/lib/pd/training-catalog";
import { useState } from "react";
type Data = Awaited<ReturnType<typeof loadTraining>>;
export function DevelopmentContext({ data }: { data: Data }) {
  const [skill, setSkill] = useState<(typeof skillBands)[number]>("beginner");
  if (!data.coach || !data.context) return null;
  const recommendations =
    data.age !== null && ["baseball", "softball"].includes(data.sport)
      ? recommendPrograms(
          data.context,
          data.sport as "baseball" | "softball",
          data.age,
          skill,
        ).filter((r) =>
          data.programs.some(
            (p) =>
              p.id === r.programId &&
              p.phases.every((phase) =>
                phase.drillIds.every((id) => data.drills.some((d) => d.id === id)),
              ),
          ),
        )
      : [];
  return (
    <details className="rounded-xl border border-line bg-white p-4">
      <summary className="cursor-pointer font-semibold">
        Recorded findings, recommendations and workload review
      </summary>
      <p className="my-2">
        Suggestions require your review. They do not establish a diagnosis, skill level or
        permission to increase workload.
      </p>
      <label className="grid gap-1">
        Skill level to consider
        <select
          className="min-h-11 rounded border p-2"
          value={skill}
          onChange={(e) => setSkill(e.target.value as typeof skill)}
        >
          {skillBands.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <p>Position: {data.context.position}</p>
      <ul className="my-3 list-disc pl-5">
        {data.context.missing.map((m) => (
          <li key={m}>Confirm: {m}</li>
        ))}
      </ul>
      {recommendations.map((r) => (
        <article key={r.programId} className="my-3 rounded-lg border p-3">
          <h4 className="font-semibold">{r.name}</h4>
          <p>{r.reason}</p>
          <p>Evaluate: {r.evaluate}</p>
          <ul className="list-disc pl-5">
            {r.findings.map((e) => (
              <li key={`${e.kind}:${e.id}`}>
                {e.kind} {e.date}: {e.text}
              </li>
            ))}
          </ul>
          <p>{r.limitations.at(-1)}</p>
        </article>
      ))}
      <details>
        <summary>All available evidence</summary>
        {data.context.evidence.map((e) => (
          <p key={`${e.kind}:${e.id}`} className="my-2">
            <strong>
              {e.kind} {e.date}
            </strong>{" "}
            · {e.source}: {e.text}
          </p>
        ))}
      </details>
      {data.workload && (
        <section className="mt-4">
          <h4 className="font-semibold">Combined workload review</h4>
          {data.workload.warnings.map((w) => (
            <p key={w} className="my-2 rounded bg-maroon/10 p-2">
              {w}
            </p>
          ))}
          <p>{data.workload.note}</p>
          <p>
            {data.workload.games.length} recent game records · {data.workload.workload.length}{" "}
            throwing records · {data.workload.lessons.length} nearby bookings ·{" "}
            {data.workload.throwing.length} scheduled throwing days ·{" "}
            {data.workload.strength.length} strength prescriptions
          </p>
          <details>
            <summary>Review scheduled and reported work</summary>
            {data.workload.games.map((g) => (
              <p key={g.id}>
                Game {g.date}: {g.pitches ?? "unknown"} pitches
              </p>
            ))}
            {data.workload.workload.map((w) => (
              <p key={w.id}>
                Throwing {w.date}: {w.throws} reported throws · effort {w.rpe}
              </p>
            ))}
            {data.workload.lessons.map((b) => (
              <p key={b.id}>
                Booking {b.date}: {b.serviceId} · {b.status}
              </p>
            ))}
            {data.workload.throwing.map((d) => (
              <p key={d.id}>
                Throwing plan {d.date}: {d.dayType}
              </p>
            ))}
            {data.workload.strength.map((s) => (
              <p key={s.id}>
                Strength {s.phase}: {s.sessionNote}
              </p>
            ))}
            {data.workload.homeReports.map((r) => (
              <p key={`${r.assignmentId}:${r.taskId}`}>
                Home record · {r.source}: {r.throws} throws, {r.minutes} minutes, effort {r.rpe};{" "}
                {r.pain ? "pain reported" : r.fatigue}
              </p>
            ))}
          </details>
        </section>
      )}
    </details>
  );
}
