import { useEffect, useState } from "react";
import {
  loadTrainingInbox,
  loadTrainingQuality,
  reviewTrainingQuality,
} from "@/lib/pd/training-api";
import { useReadOnlyPreview } from "@/lib/pd/preview";
import { Button } from "../ui/button";
export function TrainingInbox() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof loadTrainingInbox>>>([]),
    [error, setError] = useState("");
  const preview = useReadOnlyPreview();
  useEffect(() => {
    if (preview) return;
    let active = true;
    const refresh = () =>
      void loadTrainingInbox()
        .then((v) => {
          if (active) {
            setItems(v);
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError("Training notices could not refresh. Open My Training to check readiness.");
        });
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [preview]);
  if (preview) return null;
  return (
    <>
      {error && <p role="status">{error}</p>}
      {items.length > 0 && (
        <section role="alert" className="my-3 rounded-xl border border-maroon bg-maroon/10 p-4">
          <h3 className="font-semibold">Training safety notices</h3>
          {items.map((x) => (
            <p key={x.id} className="my-2">
              <strong>
                {x.name} · {x.title}
              </strong>
              : {x.message}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
export function TrainingQuality({ athleteId }: { athleteId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTrainingQuality>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const preview = useReadOnlyPreview();
  useEffect(() => {
    let active = true;
    setData(undefined);
    void loadTrainingQuality({ data: { athleteId } })
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [athleteId]);
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary>Academy coaching quality review</summary>
      <p>
        Review documentation and decisions in context. These checks do not rank coaches or penalize
        slow athlete progress.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.lessons.map((l) => (
        <details key={l.id}>
          <summary>
            Lesson {l.bookingId} · {l.status}
          </summary>
          <p>Objective: {l.objective || "Missing"}</p>
          <p>{l.practiceRecords} practice records</p>
          <p>Recap: {l.recap || "Missing"}</p>
          <p>Follow-up: {l.homework || "Missing"}</p>
          <p>Next lesson: {l.nextSteps || "Missing"}</p>
        </details>
      ))}
      {data?.plans.map((p) => (
        <article key={p.id} className="my-3 rounded border p-3">
          <h4>
            {p.title} · {p.coach}
          </h4>
          <p>Goal: {p.goal}</p>
          <p>Baseline: {p.baseline}</p>
          <p>Reason: {p.reason}</p>
          <p>Workload review: {p.workload}</p>
          <p>
            Coach observations: {p.observations} · Review due: {p.reviewDate}
          </p>
          {p.drills.map((d, i) => (
            <p key={i}>
              {d.name}: {d.purpose}
            </p>
          ))}
        </article>
      ))}
      {data && data.plans.length > 0 && !preview && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await reviewTrainingQuality({
                data: {
                  assignmentId: String(f.get("assignment")),
                  requestId,
                  feedback: String(f.get("feedback")),
                  checks: f.getAll("checks") as (
                    | "objective alignment"
                    | "prior work reviewed"
                    | "homework appropriate"
                    | "evidence supports progression"
                    | "safeguarding reviewed"
                  )[],
                },
              });
              setData(await loadTrainingQuality({ data: { athleteId } }));
              setRequestId(crypto.randomUUID());
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Assignment to review
            <select className="min-h-11 w-full border p-2" name="assignment">
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {[
            "objective alignment",
            "prior work reviewed",
            "homework appropriate",
            "evidence supports progression",
            "safeguarding reviewed",
          ].map((c) => (
            <label key={c}>
              <input type="checkbox" name="checks" value={c} /> Reviewed {c}
            </label>
          ))}
          <label>
            Constructive feedback and development action
            <textarea
              className="w-full border p-2"
              name="feedback"
              minLength={10}
              maxLength={3000}
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Save academy review
          </Button>
        </form>
      )}
      {data?.reviews.map((r) => (
        <p key={r.id} className="my-2">
          Academy feedback: {r.document.feedback}
        </p>
      ))}
    </details>
  );
}
