import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  getTrainingContent,
  submitTrainingDrill,
  reviewTrainingDrill,
} from "@/lib/pd/training-api";
import type { TrainingDrill } from "@/lib/pd/training-catalog";
import type { DrillSubmission } from "@/lib/pd/training-content";
import { useReadOnlyPreview } from "@/lib/pd/preview";
import { AcademyStandards } from "./academy-standards";
const control = "w-full min-w-0 min-h-11 rounded-lg border border-line bg-white p-2";
export function CurriculumEditor({ onChanged }: { onChanged: () => Promise<void> }) {
  const readOnly = useReadOnlyPreview(),
    [data, setData] = useState<Awaited<ReturnType<typeof getTrainingContent>>>(),
    [editing, setEditing] = useState<TrainingDrill>(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [submissionId, setSubmissionId] = useState("");
  useEffect(() => {
    let active = true;
    void getTrainingContent()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    setData(await getTrainingContent());
    await onChanged();
  }
  if (readOnly || !data?.canSubmit) return null;
  const labels = {
    purpose: "Purpose and problem addressed",
    equipment: "Equipment and space",
    cue: "Coaching cue",
    correction: "Common errors and corrections",
    regression: "Easier version",
    progression: "Prerequisites and harder version",
    measure: "Tracking and mastery criteria",
    supervision: "Home suitability and supervision",
    safety: "Safety and stop conditions",
    dose: "Dose, intensity and rest guidance",
    provenance: "Source, authorship and review context",
  };
  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <h4 className="text-xl">Curriculum versions</h4>
      {data.builtins && <AcademyStandards catalog={data.builtins} onChanged={refresh} />}
      <p>
        Submissions remain drafts until academy approval. Editing creates a new version; assigned
        snapshots stay unchanged.
      </p>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Button
        type="button"
        variant="outlineDark"
        onClick={() => {
          setEditing(undefined);
          setSubmissionId(crypto.randomUUID());
          setOpen(!open);
        }}
      >
        {open ? "Close new drill" : "Submit a new drill"}
      </Button>
      {open && (
        <form
          key={editing?.version || "new"}
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget),
              text = (k: string) => String(f.get(k) || "");
            try {
              const input: DrillSubmission = {
                id: submissionId,
                ...(editing ? { parentId: editing.version } : {}),
                name: text("name"),
                discipline: text("discipline") as DrillSubmission["discipline"],
                sports: f.getAll("sports") as DrillSubmission["sports"],
                steps: text("steps")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                minimumSkill: Number(f.get("minimumSkill")),
                minAge: Number(f.get("minAge")),
                demoUrl: text("demoUrl") || null,
                ...Object.fromEntries(Object.keys(labels).map((k) => [k, text(k)])),
              } as DrillSubmission;
              await submitTrainingDrill({ data: input });
              await refresh();
              setOpen(false);
              setNotice("New drill version submitted for academy review.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Drill name
            <input
              className={control}
              name="name"
              required
              minLength={3}
              maxLength={120}
              defaultValue={editing?.name}
            />
          </label>
          <label>
            Discipline
            <select
              className={control}
              name="discipline"
              defaultValue={editing?.discipline || "Hitting"}
            >
              {["Pitching", "Hitting", "Catching", "Fielding", "Strength/Speed"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Sports</legend>
            {["baseball", "softball"].map((s) => (
              <label key={s} className="mr-4 inline-flex gap-2">
                <input
                  type="checkbox"
                  name="sports"
                  value={s}
                  defaultChecked={editing?.sports.includes(s as "baseball" | "softball")}
                />
                {s}
              </label>
            ))}
          </fieldset>
          <label>
            Step-by-step instructions (one per line)
            <textarea
              className={control}
              name="steps"
              required
              minLength={5}
              maxLength={12000}
              defaultValue={editing?.steps.join("\n")}
            />
          </label>
          {Object.entries(labels).map(([key, label]) => (
            <label className="grid gap-1" key={key}>
              {label}
              <textarea
                className={control}
                name={key}
                required
                minLength={5}
                maxLength={2000}
                defaultValue={(editing?.[key as keyof TrainingDrill] as string) || ""}
              />
            </label>
          ))}
          <label>
            Minimum age
            <input
              className={control}
              name="minAge"
              type="number"
              min={5}
              max={19}
              defaultValue={editing?.minAge || 5}
              required
            />
          </label>
          <label>
            Minimum skill
            <select
              className={control}
              name="minimumSkill"
              defaultValue={editing?.minimumSkill || 0}
            >
              {["beginner", "developing", "intermediate", "advanced", "elite"].map((s, i) => (
                <option key={s} value={i}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Existing demonstration video (optional HTTPS link)
            <input
              className={control}
              name="demoUrl"
              type="url"
              maxLength={1000}
              defaultValue={editing?.demoUrl || ""}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Submit version for review
          </Button>
        </form>
      )}
      {data.submissions.map((v) => (
        <details key={v.id} className="rounded-lg border bg-white p-3">
          <summary className="cursor-pointer">
            {v.document.name} · {v.status}
          </summary>
          <p>{v.document.purpose}</p>
          <p>{v.document.steps.join(" ")}</p>
          <p>Equipment: {v.document.equipment}</p>
          <p>Cue: {v.document.cue}</p>
          <p>Correction: {v.document.correction}</p>
          <p>Easier: {v.document.regression}</p>
          <p>Progression: {v.document.progression}</p>
          <p>Measure: {v.document.measure}</p>
          <p>Dose: {v.document.dose}</p>
          <p>
            Age {v.document.minAge}+ · Skill {v.document.minimumSkill} ·{" "}
            {v.document.sports.join(", ")}
          </p>
          <p>{v.document.supervision}</p>
          <p>{v.document.safety}</p>
          <p>{v.document.provenance}</p>
          {v.document.demoUrl && (
            <a className="underline" href={v.document.demoUrl} target="_blank" rel="noreferrer">
              Review demonstration video
            </a>
          )}
          <p>Review: {v.review_note || "Pending"}</p>
          <Button
            type="button"
            variant="outlineDark"
            onClick={() => {
              setEditing(v.document);
              setSubmissionId(crypto.randomUUID());
              setOpen(true);
            }}
          >
            Create revised version
          </Button>
          {data.canApprove && (
            <form
              className="mt-3 grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  await reviewTrainingDrill({
                    data: {
                      id: v.id,
                      status: String(f.get("status")) as "approved" | "retired",
                      reason: String(f.get("reason")),
                    },
                  });
                  await refresh();
                  setNotice("Academy decision saved; assigned snapshots are unchanged.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Academy decision
                <select className={control} name="status">
                  <option value="approved">Approve for individual coach selection</option>
                  <option value="retired">Retire from future selection</option>
                </select>
              </label>
              <label>
                Qualified reviewer, findings and reason
                <textarea
                  className={control}
                  required
                  minLength={10}
                  maxLength={2000}
                  name="reason"
                />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" required />I am qualified to review this discipline and have
                reviewed the full content and safety constraints.
              </label>
              <Button type="submit" disabled={busy}>
                Record curriculum decision
              </Button>
            </form>
          )}
        </details>
      ))}
    </section>
  );
}
