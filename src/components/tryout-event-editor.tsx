import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { getAdminTryoutEvents, saveTryoutEvent } from "@/lib/tryout-events-api";
import type { TryoutEvent, TryoutEventInput } from "@/lib/tryout-events-contracts";
const field = "mt-1 min-h-11 w-full rounded-md border bg-paper px-3";
const blank = (): TryoutEventInput => ({
  id: crypto.randomUUID(),
  revision: 0,
  sport: "Baseball",
  season: "",
  ageGroups: [],
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  capacity: 20,
  status: "draft",
});
export function TryoutEventEditor() {
  const [events, setEvents] = useState<TryoutEvent[]>([]);
  const [draft, setDraft] = useState(blank);
  const [ages, setAges] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setEvents(await getAdminTryoutEvents());
  }
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load events."));
  }, []);
  function edit(event?: TryoutEvent) {
    setDraft(event ? { ...event } : blank());
    setAges(event?.ageGroups.join(", ") || "");
    setError("");
    setNotice("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveTryoutEvent({
        data: {
          ...draft,
          ageGroups: ages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      await load();
      setNotice("Event saved. Only published upcoming events appear on the tryout page.");
      setDraft(blank());
      setAges("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Event did not save. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-8 rounded-xl border bg-paper-2 p-5">
      <h2 className="text-3xl">Tryout schedule</h2>
      <p className="mt-2 text-sm">
        Owner-managed events. Times are America/Chicago. Saving an event does not enroll or notify
        applicants yet.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-maroon">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3">
          {notice}
        </p>
      ) : null}
      <div className="my-4 flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => edit()}>
          New event
        </Button>
        <Button
          disabled={busy}
          variant="outlineDark"
          onClick={() => void load().catch((e) => setError(String(e)))}
        >
          Refresh events
        </Button>
      </div>
      <ul className="mb-4 grid gap-2">
        {events.map((event) => (
          <li key={event.id} className="rounded-md border p-3">
            <strong>
              {event.sport} · {event.season} · {event.ageGroups.join(", ")}
            </strong>
            <p>
              {event.date} · {event.startTime}–{event.endTime} CT · {event.location} · Capacity{" "}
              {event.capacity} · {event.status}
            </p>
            <Button disabled={busy} variant="outlineDark" onClick={() => edit(event)}>
              Edit event
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label>
          Sport
          <select
            className={field}
            value={draft.sport}
            onChange={(e) =>
              setDraft({ ...draft, sport: e.target.value as "Baseball" | "Softball" })
            }
          >
            <option>Baseball</option>
            <option>Softball</option>
          </select>
        </label>
        <label>
          Season
          <input
            required
            maxLength={120}
            className={field}
            value={draft.season}
            onChange={(e) => setDraft({ ...draft, season: e.target.value })}
            placeholder="For example, Spring 2027"
          />
        </label>
        <label>
          Age groups, separated by commas
          <input
            required
            className={field}
            value={ages}
            onChange={(e) => setAges(e.target.value)}
            placeholder="For example, 9U, 10U"
          />
        </label>
        <label>
          Date
          <input
            required
            type="date"
            className={field}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
        <label>
          Start time (Central)
          <input
            required
            type="time"
            className={field}
            value={draft.startTime}
            onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
          />
        </label>
        <label>
          End time (Central)
          <input
            required
            type="time"
            className={field}
            value={draft.endTime}
            onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
          />
        </label>
        <label>
          Location
          <input
            required
            maxLength={500}
            className={field}
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </label>
        <label>
          Capacity
          <input
            required
            type="number"
            min={1}
            max={1000}
            className={field}
            value={draft.capacity}
            onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
          />
        </label>
        <label>
          Status
          <select
            className={field}
            value={draft.status}
            onChange={(e) =>
              setDraft({ ...draft, status: e.target.value as TryoutEventInput["status"] })
            }
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <Button type="submit" disabled={busy} className="self-end">
          {busy ? "Saving…" : draft.revision ? "Save changes" : "Create event"}
        </Button>
      </form>
    </section>
  );
}
