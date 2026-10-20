import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/organization-events-api";
import {
  operationalEventCreateInput,
  operationalEventSettingsInput,
  operationalEventSessionCreateInput,
  operationalEventEnrollmentInput,
  type OperationalEventWorkspace,
} from "@/lib/coordinator/organization-events-contracts";
const field = "min-h-11 rounded border border-line p-2";
function text(f: FormData, key: string) {
  return String(f.get(key) || "").trim();
}
export function OrganizationEvents() {
  const [data, setData] = useState<OperationalEventWorkspace>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  const request = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const next = await api.getOrganizationEvents();
      if (version === generation.current) setData(next);
    } catch (e) {
      if (version === generation.current) setData(undefined);
      throw e;
    }
  }, []);
  useEffect(() => {
    const epoch = generation;
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load events."));
    return () => {
      epoch.current++;
    };
  }, [load]);
  async function run(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice("Operational event saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save event.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>, work: (form: FormData) => Promise<unknown>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(() => work(form));
  }
  function inputs() {
    return (
      <>
        <label>
          Name
          <input className={field} name="name" required minLength={3} maxLength={120} />
        </label>
        <label>
          Description
          <textarea name="description" required minLength={10} maxLength={5000} />
        </label>
        <label>
          Location
          <input name="location" required minLength={3} maxLength={300} />
        </label>
      </>
    );
  }
  function coaches(ids: string[] = []) {
    return (
      <fieldset>
        <legend>Instructors</legend>
        {data?.coaches.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              name="coachIds"
              value={c.id}
              defaultChecked={ids.includes(c.id)}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
    );
  }
  const reason = (
    <label>
      Operational reason
      <input name="reason" required minLength={5} maxLength={1000} />
    </label>
  );
  return (
    <section aria-label="Operational camps and clinics" className="grid gap-4">
      <h2>Camps & Clinics</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>Event workspace unavailable.</p>
      ) : (
        <>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const payload = {
                  name: text(f, "name"),
                  description: text(f, "description"),
                  location: text(f, "location"),
                  type: text(f, "type"),
                  sport: text(f, "sport"),
                  capacity: Number(f.get("capacity")),
                  coachIds: f.getAll("coachIds").map(String),
                  reason: text(f, "reason"),
                };
                const fingerprint = JSON.stringify(payload);
                if (request.current?.fingerprint !== fingerprint)
                  request.current = { fingerprint, id: crypto.randomUUID() };
                const result = await api.createOperationalEvent({
                  data: operationalEventCreateInput.parse({
                    ...payload,
                    requestId: request.current.id,
                  }),
                });
                request.current = undefined;
                return result;
              })
            }
          >
            <fieldset disabled={busy}>
              <legend>Create operational event</legend>
              {inputs()}
              <label>
                Type
                <select name="type">
                  {operationalEventCreateInput.shape.type.options.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Sport
                <select name="sport">
                  <option>Baseball</option>
                  <option>Softball</option>
                  <option>Both</option>
                </select>
              </label>
              <label>
                Capacity
                <input type="number" name="capacity" min={1} max={1000} defaultValue={20} />
              </label>
              {coaches()}
              {reason}
              <button>Create event draft</button>
            </fieldset>
          </form>
          {data.events.map((event) => (
            <article className="grid gap-3 rounded border p-4" key={event.id}>
              <h3>{event.name}</h3>
              <p>
                {event.sport} · {event.type} · {event.publication}
              </p>
              <form
                key={`${event.id}:${event.revision}`}
                onSubmit={(e) =>
                  submit(e, (f) =>
                    api.saveOperationalEventSettings({
                      data: operationalEventSettingsInput.parse({
                        eventId: event.id,
                        revision: event.revision,
                        capacity: Number(f.get("capacity")),
                        coachIds: f.getAll("coachIds").map(String),
                        publication: text(f, "publication"),
                        ...(event.metadataEditable
                          ? {
                              name: text(f, "name"),
                              description: text(f, "description"),
                              location: text(f, "location"),
                            }
                          : {}),
                        reason: text(f, "reason"),
                      }),
                    }),
                  )
                }
              >
                <fieldset disabled={busy}>
                  <legend>Event settings</legend>
                  {event.metadataEditable && (
                    <>
                      <label>
                        Name
                        <input name="name" defaultValue={event.name} required minLength={3} />
                      </label>
                      <label>
                        Description
                        <textarea
                          name="description"
                          defaultValue={event.description}
                          required
                          minLength={10}
                        />
                      </label>
                      <label>
                        Location
                        <input
                          name="location"
                          defaultValue={event.location}
                          required
                          minLength={3}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Capacity
                    <input
                      name="capacity"
                      type="number"
                      defaultValue={event.capacity}
                      min={1}
                      max={1000}
                    />
                  </label>
                  {coaches(event.coachIds)}
                  <label>
                    Publication
                    <select name="publication" defaultValue={event.publication}>
                      {["draft", "open", "closed", "archived"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  {reason}
                  <button>Save event settings</button>
                </fieldset>
              </form>
              <form
                onSubmit={(e) =>
                  submit(e, (f) =>
                    api.addOperationalEventSession({
                      data: operationalEventSessionCreateInput.parse({
                        eventId: event.id,
                        revision: event.revision,
                        date: text(f, "date"),
                        start: text(f, "start"),
                        end: text(f, "end"),
                        location: text(f, "location"),
                        reason: text(f, "reason"),
                      }),
                    }),
                  )
                }
              >
                <fieldset disabled={busy}>
                  <legend>Add session</legend>
                  <label>
                    Date
                    <input type="date" name="date" required />
                  </label>
                  <label>
                    Start
                    <input type="time" name="start" step={300} required />
                  </label>
                  <label>
                    End
                    <input type="time" name="end" step={300} required />
                  </label>
                  <label>
                    Location
                    <input name="location" required minLength={3} />
                  </label>
                  {reason}
                  <button>Add event session</button>
                </fieldset>
              </form>
              {event.sessions.map((session) => (
                <section key={session.sessionKey}>
                  <h4>
                    {session.date} {session.start}–{session.end} · {session.status}
                  </h4>
                  <form
                    onSubmit={(e) =>
                      submit(e, (f) => {
                        const athleteId = text(f, "athleteId");
                        return api.saveOperationalEventEnrollment({
                          data: operationalEventEnrollmentInput.parse({
                            eventId: event.id,
                            sessionKey: session.sessionKey,
                            sessionRevision: session.revision,
                            athleteId,
                            revision:
                              session.enrollments.find((row) => row.athleteId === athleteId)
                                ?.revision || 0,
                            action: "enroll",
                            reason: text(f, "reason"),
                          }),
                        });
                      })
                    }
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Athlete
                        <select name="athleteId" required>
                          <option value="">Choose athlete</option>
                          {data.athletes.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {reason}
                      <button>Enroll athlete</button>
                    </fieldset>
                  </form>
                  {session.enrollments.map((enrollment) => (
                    <form
                      key={enrollment.athleteId}
                      onSubmit={(e) =>
                        submit(e, (f) =>
                          api.saveOperationalEventEnrollment({
                            data: operationalEventEnrollmentInput.parse({
                              eventId: event.id,
                              sessionKey: session.sessionKey,
                              sessionRevision: session.revision,
                              athleteId: enrollment.athleteId,
                              revision: enrollment.revision,
                              action: text(f, "action"),
                              reason: text(f, "reason"),
                            }),
                          }),
                        )
                      }
                    >
                      <fieldset disabled={busy}>
                        <legend>
                          {enrollment.name} · {enrollment.status}
                          {enrollment.checkedIn ? " · Checked in" : ""}
                        </legend>
                        <label>
                          Action
                          <select name="action">
                            <option value="check-in">Check in</option>
                            <option value="unenroll">Remove enrollment</option>
                          </select>
                        </label>
                        {reason}
                        <button>Save enrollment</button>
                      </fieldset>
                    </form>
                  ))}
                </section>
              ))}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
