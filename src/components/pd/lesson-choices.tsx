import { getTrainingContent } from "@/lib/pd/training-api";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { lessonChoices, type LessonChoiceInput } from "@/lib/pd/lesson-choices";
import { skillBands, trainingDrills } from "@/lib/pd/training-catalog";
import { chooseLesson, getLessonPresets, reviewLessonPreset } from "@/lib/pd/lesson-session-api";
import type { resolveTemplate } from "@/lib/pd/lesson-templates";
const control = "w-full min-w-0 min-h-11 rounded-lg border border-line bg-white p-2";
export function LessonChoices({
  bookingId,
  revision,
  template,
  canReview,
  disabled,
  onSaved,
}: {
  bookingId: string;
  revision: number;
  template: ReturnType<typeof resolveTemplate>;
  canReview: boolean;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const choices = lessonChoices(
    template.sport,
    template.discipline,
    template.minutes,
    template.adaptation.age,
    template.adaptation.level,
    template.adaptation.priorities,
  );
  const [approach, setApproach] = useState<LessonChoiceInput["approach"]>("foundations"),
    [skill, setSkill] = useState<LessonChoiceInput["skill"]>("beginner"),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [presets, setPresets] = useState<Awaited<ReturnType<typeof getLessonPresets>>>([]),
    [preset, setPreset] = useState<LessonChoiceInput>();
  const choice = choices.find((c) => c.approach === approach)!;
  useEffect(() => {
    void getLessonPresets({ data: { bookingId } })
      .then(setPresets)
      .catch((e) => setError(e.message));
  }, [bookingId, revision]);
  const [library, setLibrary] = useState(trainingDrills);
  useEffect(() => {
    let active = true;
    void getTrainingContent()
      .then((d) => {
        if (active) setLibrary(d.drills);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const compatible = library.filter(
    (d) =>
      d.sports.includes(template.sport) &&
      d.discipline === template.discipline &&
      d.minAge <= template.adaptation.age &&
      d.minimumSkill <= skillBands.indexOf(skill),
  );
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-semibold">Choose or customize this lesson</summary>
      <p className="mt-3">
        Booked sport, discipline and {template.minutes}-minute duration stay fixed. Save current
        notes before changing curriculum.
      </p>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      <fieldset disabled={disabled || busy} className="grid gap-3">
        <label>
          Personal and academy templates
          <select
            className={control}
            value=""
            onChange={(e) => {
              const p = presets.find((p) => p.id === e.target.value);
              if (p) {
                setPreset(p.document);
                setApproach(p.document.approach);
                setSkill(p.document.skill);
                setSelected(p.document.drillIds);
              }
            }}
          >
            <option value="">Choose a saved template</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Approach
          <select
            className={control}
            value={approach}
            onChange={(e) => {
              setApproach(e.target.value as typeof approach);
              setPreset(undefined);
            }}
          >
            {choices.map((c) => (
              <option key={c.approach}>{c.approach}</option>
            ))}
          </select>
        </label>
        <p>{choice.rationale}</p>
        <label>
          Reviewed skill level
          <select
            className={control}
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value as typeof skill);
              setSelected([]);
            }}
          >
            {skillBands.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <form
          key={preset?.saveAs || approach}
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await chooseLesson({
                data: {
                  bookingId,
                  revision,
                  approach,
                  skill,
                  drillIds: selected,
                  objective: String(f.get("objective")),
                  dose: String(f.get("dose")),
                  reason: String(f.get("reason")),
                  qualifiedReview: true,
                  timing: template.stages.map((_, i) => Number(f.get("time" + i))),
                  saveAs: String(f.get("saveAs") || ""),
                },
              });
              await onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Objective
            <textarea
              className={control}
              name="objective"
              minLength={5}
              maxLength={500}
              required
              defaultValue={preset?.objective || choice.objective}
            />
          </label>
          <fieldset>
            <legend>Compatible drills — choose up to six</legend>
            {compatible.map((d) => (
              <label key={d.id} className="flex items-start gap-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, d.id] : s.filter((id) => id !== d.id),
                    )
                  }
                />
                <span>
                  <strong>{d.name}</strong> · {d.purpose}
                  <br />
                  <span className="text-sm">
                    {d.steps.join(" ")} · {d.safety}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Individual drill dose, intensity and rest
            <textarea
              className={control}
              name="dose"
              minLength={5}
              maxLength={1000}
              required
              defaultValue={preset?.dose}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {template.stages.map((s, i) => (
              <label key={s.name} className="text-sm">
                {s.name} minutes
                <input
                  className={control}
                  name={"time" + i}
                  type="number"
                  min="1"
                  max="60"
                  required
                  defaultValue={preset?.timing[i] || s.minutes}
                />
              </label>
            ))}
          </div>
          <label>
            Reason and readiness/workload review
            <textarea className={control} name="reason" required minLength={5} maxLength={1000} />
          </label>
          <label>
            Save a new personal template version (optional)
            <input name="saveAs" className={control} maxLength={100} />
          </label>
          <label className="flex gap-2">
            <input type="checkbox" required />
            <span>
              I am qualified in this discipline and approve the selected drills, individual dose and
              progression for this athlete after reviewing workload and restrictions.
            </span>
          </label>
          <Button type="submit" disabled={!selected.length}>
            Use reviewed lesson plan
          </Button>
        </form>
        {canReview &&
          presets
            .filter((p) => p.status === "personal" || p.status === "approved")
            .map((p) => (
              <form
                key={p.id}
                className="grid gap-2 border-t pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const f = new FormData(e.currentTarget);
                  try {
                    await reviewLessonPreset({
                      data: {
                        id: p.id,
                        status: String(f.get("status")) as "approved" | "retired",
                        reason: String(f.get("reason")),
                      },
                    });
                    setPresets(await getLessonPresets({ data: { bookingId } }));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <strong>Academy review: {p.name}</strong>
                <label>
                  Decision
                  <select className={control} name="status">
                    <option value="approved">Approve academy use after qualified review</option>
                    <option value="retired">Retire from future selection</option>
                  </select>
                </label>
                <label>
                  Reviewer qualifications and findings
                  <textarea
                    className={control}
                    required
                    minLength={10}
                    maxLength={1000}
                    name="reason"
                  />
                </label>
                <Button type="submit">Record academy review</Button>
              </form>
            ))}
      </fieldset>
    </details>
  );
}
