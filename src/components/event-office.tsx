import { useEffect, useState } from "react";
import { getEventOffice, saveEvent } from "@/lib/training-events-api";
import { campPriceLabel, type TrainingEvent } from "@/lib/training-events-contracts";
import { Button } from "./ui/button";
import { formatMoney } from "@/lib/pricing";
const control = "office-control min-w-0 w-full";
export function EventOffice() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getEventOffice>>>(),
    [edit, setEdit] = useState<TrainingEvent>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setData(await getEventOffice());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const update = (p: Partial<TrainingEvent>) => setEdit((e) => (e ? { ...e, ...p } : e));
  return (
    <section className="grid min-w-0 gap-4">
      <header>
        <h2 className="text-3xl">Camps & Clinics</h2>
        <p>
          Create events, assign coaches, and review paid player registrations. Times are Central
          Time. Published events appear under Train → Camps.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Button
        onClick={() => {
          setError("");
          setNotice("");
          setEdit({
            id: crypto.randomUUID(),
            revision: 0,
            name: "",
            type: "camp",
            sport: "Baseball",
            description: "",
            priceCents: 0,
            pricingMode: "package",
            dayPriceCents: 0,
            location: "",
            sessions: [{ date: "", start: "09:00", end: "12:00" }],
            coachIds: [],
            capacity: 20,
            status: "draft",
            policy: "",
          });
        }}
      >
        Create event
      </Button>
      {!data ? (
        <p>Loading events…</p>
      ) : (
        <div className="grid gap-3">
          {!data.events.length && <p>No camps or clinics created yet.</p>}
          {data.events.map((e) => (
            <article key={e.id} className="rounded-xl border bg-white p-4">
              <h3 className="text-xl">{e.name}</h3>
              <p>
                {e.type} · {e.sport} · {e.status} · {campPriceLabel(e)} per player
              </p>
              <p>
                {e.sessions.map((s) => s.date).join(", ")} ·{" "}
                {
                  data.registrations.filter((r) => r.event_id === e.id && r.status === "confirmed")
                    .length
                }
                registrations · capacity {e.capacity} per day
              </p>
              <Button
                variant="outlineDark"
                onClick={() => {
                  setEdit(structuredClone(e));
                  setError("");
                  setNotice("");
                }}
              >
                Edit event
              </Button>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer">Registered players</summary>
                {data.registrations
                  .filter((r) => r.event_id === e.id)
                  .map((r) => (
                    <div className="border-b py-3" key={r.id}>
                      <strong>{r.player}</strong>
                      <p>
                        {r.email} · {r.status} · {formatMoney(r.total_cents)}
                        <span className="block">
                          Days: {r.sessions?.map((s) => s.date).join(", ")}
                        </span>
                      </p>
                    </div>
                  ))}
              </details>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <form
          key={edit.id}
          className="grid min-w-0 gap-4 rounded-xl border bg-white p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNotice("");
            try {
              setEdit(await saveEvent({ data: edit }));
              await load();
              setNotice("Event saved. Published events are now visible under Train → Camps.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="text-2xl">{edit.revision ? "Edit event" : "New event"}</h3>
          <label>
            Event name
            <input
              className={control}
              required
              minLength={3}
              maxLength={120}
              value={edit.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Event type
              <select
                className={control}
                value={edit.type}
                onChange={(e) => update({ type: e.target.value as TrainingEvent["type"] })}
              >
                <option value="camp">Camp</option>
                <option value="clinic">Clinic</option>
              </select>
            </label>
            <label>
              Sport
              <select
                className={control}
                value={edit.sport}
                onChange={(e) => update({ sport: e.target.value as TrainingEvent["sport"] })}
              >
                {["Baseball", "Softball", "Both"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              className={control}
              required
              minLength={10}
              maxLength={5000}
              rows={4}
              value={edit.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <label>
            Location
            <input
              className={control}
              required
              value={edit.location}
              onChange={(e) => update({ location: e.target.value })}
            />
          </label>
          <label>
            Registration pricing
            <select
              className={control}
              value={edit.pricingMode || "package"}
              onChange={(e) =>
                update({ pricingMode: e.target.value as TrainingEvent["pricingMode"] })
              }
            >
              <option value="package">Full camp only</option>
              <option value="days">Choose individual days only</option>
              <option value="both">Full camp or individual days</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(edit.pricingMode || "package") !== "days" && (
              <label>
                Full-camp price per player ($)
                <input
                  className={control}
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={edit.priceCents / 100}
                  onChange={(e) => update({ priceCents: Math.round(Number(e.target.value) * 100) })}
                />
              </label>
            )}
            {edit.pricingMode && edit.pricingMode !== "package" && (
              <label>
                Price per selected day per player ($)
                <input
                  className={control}
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={(edit.dayPriceCents || 0) / 100}
                  onChange={(e) =>
                    update({ dayPriceCents: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </label>
            )}
            <label>
              Player capacity per day
              <input
                className={control}
                type="number"
                min={1}
                max={1000}
                required
                value={edit.capacity}
                onChange={(e) => update({ capacity: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="text-sm">
            Full-camp pricing covers every listed day. Per-day pricing charges once for each
            selected calendar date and includes all sessions that day. You can offer both, such as
            $125 for the full camp or $50 per day. Include processing costs in your prices. Existing
            paid registrations keep their purchased dates and price.
          </p>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="font-semibold">Camp days & times · Central Time</legend>
            <p>
              Add a separate date for each camp day—for example Monday, Wednesday and Friday. Each
              day can have its own times.
            </p>
            {edit.sessions.length > 1 && (
              <Button
                type="button"
                variant="outlineDark"
                onClick={() =>
                  update({
                    sessions: edit.sessions.map((s) => ({
                      ...s,
                      start: edit.sessions[0].start,
                      end: edit.sessions[0].end,
                    })),
                  })
                }
              >
                Copy first day’s times to all days
              </Button>
            )}
            {edit.sessions.map((s, i) => (
              <div className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-3" key={i}>
                {(["date", "start", "end"] as const).map((k) => (
                  <label key={k} className="block min-w-0">
                    {k === "date" ? `Day ${i + 1} date` : k === "start" ? "Start time" : "End time"}
                    <input
                      className={control + " block appearance-none"}
                      type={k === "date" ? "date" : "time"}
                      step={k === "date" ? undefined : 300}
                      required
                      value={s[k]}
                      onChange={(e) =>
                        update({
                          sessions: edit.sessions.map((row, j) =>
                            i === j ? { ...row, [k]: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {edit.sessions.length > 1 && (
                  <Button
                    type="button"
                    variant="outlineDark"
                    onClick={() => update({ sessions: edit.sessions.filter((_, j) => j !== i) })}
                  >
                    Remove day
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="maroon"
              className="w-full"
              disabled={edit.sessions.length >= 30}
              onClick={() =>
                update({
                  sessions: [
                    ...edit.sessions,
                    {
                      date: "",
                      start: edit.sessions.at(-1)?.start || "09:00",
                      end: edit.sessions.at(-1)?.end || "12:00",
                    },
                  ],
                })
              }
            >
              Add another camp day
            </Button>
          </fieldset>
          <fieldset>
            <legend className="font-semibold">Assigned coaches</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {data?.coaches.map((c) => (
                <label className="flex min-h-11 items-center gap-3" key={c.id}>
                  <input
                    type="checkbox"
                    checked={edit.coachIds.includes(c.id)}
                    onChange={(e) =>
                      update({
                        coachIds: e.target.checked
                          ? [...edit.coachIds, c.id]
                          : edit.coachIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.name}
                  {data.coaches.filter((other) => other.name === c.name).length > 1
                    ? ` · ${c.email}`
                    : ""}
                </label>
              ))}
            </div>
            <p className="text-sm">
              Published sessions block these coaches’ lesson availability. At least one coach is
              required.
            </p>
          </fieldset>
          <label>
            Registration and cancellation policy
            <textarea
              className={control}
              required
              minLength={5}
              maxLength={3000}
              rows={4}
              value={edit.policy}
              onChange={(e) => update({ policy: e.target.value })}
            />
          </label>
          <label>
            Publication status
            <select
              className={control}
              value={edit.status}
              onChange={(e) => update({ status: e.target.value as TrainingEvent["status"] })}
            >
              <option value="draft">Draft — admin only</option>
              <option value="published">Published — registration open</option>
              <option value="closed">Closed — visible, registration closed</option>
              <option value="cancelled">Cancelled — removed from upcoming events</option>
            </select>
          </label>
          <p className="text-sm">
            Once players register, session dates, location and accepted policy are protected. Close
            registration and coordinate changes or refunds through Payments before replacing an
            event.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save event"}
            </Button>
            <Button type="button" variant="outlineDark" onClick={() => setEdit(undefined)}>
              Close editor
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
