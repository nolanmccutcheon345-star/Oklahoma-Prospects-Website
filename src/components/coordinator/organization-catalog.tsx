import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { OrganizationServices } from "./organization-services";
import { eventTypes } from "@/lib/training-events-contracts";
import {
  getOrganizationCatalog,
  saveOrganizationTrainingEventMetadata,
} from "@/lib/coordinator/organization-catalog-api";
import {
  organizationTrainingEventMetadataInput,
  type OrganizationCatalog,
  type OrganizationCatalogEvent,
  type OrganizationTrainingEventMetadataInput,
} from "@/lib/coordinator/organization-catalog-contracts";

const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request. Please try again.";
function EventForm({
  event,
  busy,
  onSave,
}: {
  event: OrganizationCatalogEvent;
  busy: boolean;
  onSave: (input: OrganizationTrainingEventMetadataInput) => Promise<void>;
}) {
  const [input, setInput] = useState<OrganizationTrainingEventMetadataInput>(() => ({
    id: event.id,
    revision: event.revision,
    editToken: event.editToken,
    name: event.name,
    description: event.description,
  }));
  const [error, setError] = useState("");
  async function submit(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (busy) return;
    const parsed = organizationTrainingEventMetadataInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the event details.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={(submission) => void submit(submission)}>
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <legend className="mb-3 text-lg font-semibold">Edit published event details</legend>
        <p className="text-sm">
          {eventTypes[event.type as keyof typeof eventTypes] || "Event"} · {event.sport} ·{" "}
          {event.status} · {event.location}
        </p>
        <ul className="text-sm">
          {event.sessions.map((session, index) => (
            <li key={index}>
              {session.date} · {session.start}–{session.end} Central Time
            </li>
          ))}
        </ul>
        <label className="grid gap-1">
          Event name
          <input
            className={field}
            required
            minLength={3}
            maxLength={120}
            value={input.name}
            onChange={(change) => setInput({ ...input, name: change.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Public event description
          <textarea
            className={field}
            required
            rows={5}
            minLength={10}
            maxLength={5000}
            value={input.description}
            onChange={(change) => setInput({ ...input, description: change.target.value })}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Saving updates the public event copy immediately.
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="justify-self-start">
          {busy ? "Saving…" : "Save Event Details"}
        </Button>
      </fieldset>
    </form>
  );
}

export function OrganizationCatalog({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const [workspace, setWorkspace] = useState<OrganizationCatalog | null>(null);
  const [tab, setTab] = useState<"services" | "events">("services");
  const [eventId, setEventId] = useState("");
  const [sport, setSport] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const request = useRef(0);
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getOrganizationCatalog();
      if (mounted.current && id === request.current) setWorkspace(next);
    } catch (cause) {
      if (mounted.current && id === request.current) {
        setWorkspace(null);
        setError(message(cause));
      }
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [load]);
  async function save(action: () => Promise<unknown>, notice: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await action();
      if (!mounted.current) return;
      setSuccess(notice);
      await load();
      if (mounted.current && onSaved) await onSaved();
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const events =
    workspace?.events.filter(
      (row) => sport === "all" || row.sport === sport || row.sport === "Both",
    ) || [];
  const event = events.find((row) => row.id === eventId) || events[0];
  const registrations = workspace?.registrations.filter((row) => row.eventId === event?.id) || [];
  return (
    <section
      aria-label="Service catalog and training events"
      className="grid min-w-0 gap-4 rounded-xl border border-line bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Services & Camps</h2>
        <Button
          type="button"
          variant="outline"
          disabled={loading || saving}
          onClick={() => {
            setSuccess("");
            void load();
          }}
        >
          Reload Catalog
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage service drafts and descriptions, and review event details and rosters.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Catalog section">
        <Button
          type="button"
          variant={tab === "services" ? "primary" : "outline"}
          disabled={saving}
          aria-pressed={tab === "services"}
          onClick={() => {
            setTab("services");
            setError("");
            setSuccess("");
          }}
        >
          Services
        </Button>
        <Button
          type="button"
          variant={tab === "events" ? "primary" : "outline"}
          disabled={saving}
          aria-pressed={tab === "events"}
          onClick={() => {
            setTab("events");
            setError("");
            setSuccess("");
          }}
        >
          Camps & Clinics
        </Button>
      </div>
      {success && (
        <p role="status" className="text-green-800">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {tab === "services" ? (
        <OrganizationServices onSaved={onSaved} onBusyChange={setSaving} />
      ) : loading ? (
        <p role="status">Loading catalog…</p>
      ) : !workspace ? null : (
        <>
          <label className="grid gap-1">
            Sport
            <select
              className={field}
              disabled={saving}
              value={sport}
              onChange={(change) => {
                setSport(change.target.value);
                setEventId("");
                setError("");
                setSuccess("");
              }}
            >
              <option value="all">Baseball & Softball</option>
              <option value="Baseball">Baseball</option>
              <option value="Softball">Softball</option>
            </select>
          </label>
          {!event ? (
            <p>No published camps or clinics are available for this sport.</p>
          ) : (
            <>
              <label className="grid gap-1">
                Published event
                <select
                  className={field}
                  disabled={saving}
                  value={event.id}
                  onChange={(change) => {
                    setEventId(change.target.value);
                    setError("");
                    setSuccess("");
                  }}
                >
                  {events.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.sport}
                    </option>
                  ))}
                </select>
              </label>
              <EventForm
                key={`${event.id}:${event.revision}:${event.editToken}`}
                event={event}
                busy={saving}
                onSave={(input) =>
                  save(
                    () => saveOrganizationTrainingEventMetadata({ data: input }),
                    "Published event details saved.",
                  )
                }
              />
              <div className="grid gap-2 border-t border-line pt-4">
                <h3 className="text-lg font-semibold">Event roster</h3>
                <p className="text-sm">
                  {registrations.filter((row) => row.status === "confirmed").length} confirmed
                  registrations
                </p>
                {!registrations.length ? (
                  <p>No registrations yet.</p>
                ) : (
                  registrations.map((row) => (
                    <article key={row.id} className="rounded-lg border border-line p-3">
                      <p className="font-medium">
                        {row.player} · {row.status}
                      </p>
                      {row.sessions.length ? (
                        <ul className="text-sm">
                          {row.sessions.map((session, index) => (
                            <li key={index}>
                              {session.date} · {session.start}–{session.end} Central Time
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm">No active booked sessions.</p>
                      )}
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        New service drafts require owner review before purchase. Archiving preserves existing
        paid bookings and prepared purchases.
      </p>
    </section>
  );
}
