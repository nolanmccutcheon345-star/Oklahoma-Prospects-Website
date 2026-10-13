import { useState } from "react";
import { reviewAcademyCurriculum, type getTrainingContent } from "@/lib/pd/training-api";
import { Button } from "../ui/button";
type Catalog = NonNullable<Awaited<ReturnType<typeof getTrainingContent>>["builtins"]>;
export function AcademyStandards({
  catalog,
  onChanged,
}: {
  catalog: Catalog;
  onChanged: () => Promise<void>;
}) {
  const [selection, setSelection] = useState("drill:" + catalog.drills[0].id),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const split = selection.indexOf(":"),
    kind = selection.slice(0, split) as "drill" | "program",
    id = selection.slice(split + 1);
  const drill = kind === "drill" ? catalog.drills.find((d) => d.id === id) : undefined;
  const program = kind === "program" ? catalog.programs.find((p) => p.id === id) : undefined;
  const content = drill || program,
    decision = catalog.controls.find((c) => c.kind === kind && c.content_id === id);
  const current = decision?.content_version === content?.version;
  const control = "min-h-11 w-full rounded-lg border border-line bg-white p-2";
  if (!content) return null;
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-semibold">
        Academy standards: built-in drills and programs
      </summary>
      <p className="my-2">
        Review the complete content before recording a decision. Retirement prevents new
        assignments; saved athlete instructions remain available. A new content version requires a
        new approval.
      </p>
      <label className="grid gap-1">
        Content to review
        <select
          className={control}
          value={selection}
          onChange={(e) => {
            setSelection(e.target.value);
            setNotice("");
            setError("");
          }}
        >
          <optgroup label="Drills">
            {catalog.drills.map((d) => (
              <option key={d.id} value={"drill:" + d.id}>
                {d.name} · {d.sports.join(" / ")}
              </option>
            ))}
          </optgroup>
          <optgroup label="Programs">
            {catalog.programs.map((p) => (
              <option key={p.id} value={"program:" + p.id}>
                {p.name} · {p.sport}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <article className="my-3 grid gap-2 rounded-lg bg-cream p-3">
        <h5 className="font-semibold">{content.name}</h5>
        <p>
          {content.discipline} · Age {content.minAge}+ · Minimum skill{" "}
          {["beginner", "developing", "intermediate", "advanced", "elite"][content.minimumSkill]}
        </p>
        {drill && (
          <>
            <p>{drill.purpose}</p>
            <ol className="list-decimal pl-5">
              {drill.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {[
              ["Equipment", drill.equipment],
              ["Cues", drill.cue],
              ["Correction", drill.correction],
              ["Easier version", drill.regression],
              ["Progression", drill.progression],
              ["Measure", drill.measure],
              ["Dose", drill.dose],
              ["Supervision", drill.supervision],
              ["Safety", drill.safety],
              ["Source", drill.provenance],
            ].map(([label, value]) => (
              <p key={label}>
                <strong>{label}:</strong> {value}
              </p>
            ))}
          </>
        )}
        {program && (
          <>
            <p>{program.objective}</p>
            <p>Baseline: {program.baseline}</p>
            <p>Equipment: {program.equipment}</p>
            {program.phases.map((p, i) => (
              <section key={i}>
                <h6 className="font-semibold">
                  Phase {i + 1}: {p.name}
                </h6>
                <p>
                  {p.drillIds
                    .map((id) => catalog.drills.find((d) => d.id === id)?.name || id)
                    .join("; ")}
                </p>
                <p>Checkpoint: {p.checkpoint}</p>
                <p>Easier: {p.regression}</p>
              </section>
            ))}
            <p>{program.frequency}</p>
            <p>{program.recovery}</p>
            <p>Completion: {program.completion}</p>
            <p>Next: {program.next}</p>
            <p>Review each listed drill using the selector above before approving this sequence.</p>
          </>
        )}
        <p>
          Version {content.version} ·{" "}
          {decision?.status === "retired"
            ? "retired"
            : current
              ? decision?.status
              : "qualified review required"}
        </p>
        {decision && (
          <p>
            Last decision: {decision.review_note} ·{" "}
            {new Date(decision.reviewed_at).toLocaleDateString()}
          </p>
        )}
      </article>
      <form
        key={selection + (decision?.revision || 0)}
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const f = new FormData(e.currentTarget);
          try {
            await reviewAcademyCurriculum({
              data: {
                kind,
                id,
                version: content.version,
                revision: decision?.revision || 0,
                status: String(f.get("status")) as "review-required" | "approved" | "retired",
                recommended: f.get("recommended") === "on",
                reason: String(f.get("reason")),
                qualifiedReview: true,
              },
            });
            await onChanged();
            setNotice("Academy decision saved. Existing athlete snapshots are preserved.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Academy content decision
          <select
            className={control}
            name="status"
            defaultValue={current ? decision?.status : "review-required"}
          >
            <option value="review-required">Require individual qualified review</option>
            <option value="approved">Academy reviewed</option>
            <option value="retired">Retire from future assignments</option>
          </select>
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="recommended"
            defaultChecked={current && decision?.recommended}
          />
          Mark approved version as academy recommended
        </label>
        <label>
          Reviewer qualifications, findings and reason
          <textarea className={control} name="reason" required minLength={10} maxLength={2000} />
        </label>
        <label className="flex gap-2">
          <input type="checkbox" required />I am qualified to review this discipline and have
          reviewed the full instructions, prerequisites and safety constraints.
        </label>
        <Button type="submit" disabled={busy}>
          Save academy content decision
        </Button>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </form>
    </details>
  );
}
