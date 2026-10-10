import { useState } from "react";
import { getLessonMetrics, saveLessonMetric } from "@/lib/recruiting-api";
import { metricDefinitions, type MetricKey } from "@/lib/recruiting-contracts";
import { Button } from "./ui/button";
export function LessonRecruitingMetrics({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getLessonMetrics>>>(),
    [open, setOpen] = useState(false),
    [key, setKey] = useState<MetricKey>("pitchVelocity"),
    [value, setValue] = useState(""),
    [method, setMethod] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const d = await getLessonMetrics({ data: { bookingId } });
    setData(d);
    return d;
  }
  const old = data?.metrics.find((m) => m.metric === key);
  return (
    <section className="my-3 rounded-xl border bg-white p-3 text-ink">
      <Button
        type="button"
        variant="outlineDark"
        disabled={busy}
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          setBusy(true);
          setError("");
          try {
            const d = await load();
            const m = d.metrics.find((m) => m.metric === key);
            setValue(m?.value.toString() || "");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {open ? "Close lesson metrics" : "Record verified player metric"}
      </Button>
      {open && (
        <div className="mt-3 grid min-w-0 gap-3">
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {data ? (
            <>
              <h3 className="text-xl">
                {data.lesson.name} · {data.lesson.date}
              </h3>
              <p className="text-sm">
                Save measurements you personally observed in this lesson. They are automatically
                verified on the player’s profile; public visibility still requires guardian consent.
              </p>
              {!data.canRecord ? (
                <p>Recording opens when this lesson starts.</p>
              ) : (
                <form
                  className="grid min-w-0 gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    setNotice("");
                    try {
                      await saveLessonMetric({
                        data: {
                          bookingId,
                          id: old?.id || "",
                          revision: old?.revision || 0,
                          metric: key,
                          value: Number(value),
                          method,
                          evidence: "",
                        },
                      });
                      await load();
                      setNotice("Saved to the player’s profile as verified.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Measurement
                    <select
                      className="office-control"
                      value={key}
                      onChange={(e) => {
                        const k = e.target.value as MetricKey;
                        setKey(k);
                        setValue(data.metrics.find((m) => m.metric === k)?.value.toString() || "");
                        setNotice("");
                      }}
                    >
                      {Object.entries(metricDefinitions).map(([k, d]) => (
                        <option key={k} value={k}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Value ({metricDefinitions[key].unit})
                    <input
                      className="office-control"
                      type="number"
                      min={0.01}
                      max={metricDefinitions[key].max}
                      step="0.01"
                      required
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </label>
                  <label>
                    How you measured it (shown publicly)
                    <input
                      className="office-control"
                      maxLength={500}
                      required
                      placeholder="Observed with facility radar"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    />
                  </label>
                  {old && (
                    <p className="text-sm">
                      This replaces the current {metricDefinitions[key].label.toLowerCase()}:{" "}
                      {old.value} {metricDefinitions[key].unit}.
                    </p>
                  )}
                  <Button type="submit" disabled={busy}>
                    Save verified metric
                  </Button>
                  <Button
                    type="button"
                    variant="outlineDark"
                    disabled={busy}
                    onClick={() => void load().catch((e) => setError(e.message))}
                  >
                    Reload latest measurement
                  </Button>
                </form>
              )}
            </>
          ) : !error ? (
            <p>Loading lesson metrics…</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
