import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/api";
import { Button } from "../ui/button";
import type { ProgramEventLaneIds } from "@/lib/coordinator/program-events-contracts";
import type { Capability, HistoryCursor } from "@/lib/coordinator/contracts";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
const text = (f: FormData, k: string) => String(f.get(k) || "");
type Workspace = Awaited<ReturnType<typeof api.getCoordinatorProgramEvents>>;
type Event = Workspace["items"][number];
type Session = Event["sessions"][number];
export function ProgramEvents({
  teamId,
  allowed,
}: {
  teamId: string;
  allowed: (p: Capability) => boolean;
}) {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [before, setBefore] = useState<HistoryCursor>();
  const pending = useRef(false);
  const creationId = useRef<string>(undefined);
  const refresh = useCallback(
    async () => setData(await api.getCoordinatorProgramEvents({ data: { teamId, before } })),
    [teamId, before],
  );
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    setData(undefined);
    setError("");
    void api
      .getCoordinatorProgramEvents({ data: { teamId, before } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId, before]);
  async function run(work: () => Promise<unknown>, message = "Saved.") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if ((await work()) === false) return;
      await refresh();
      setNotice(message);
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Could not complete event action.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    work: (f: FormData) => Promise<unknown>,
    message?: string,
  ) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() => work(f), message);
  }
  if (!teamId) return <p>Select an authorized team to manage its camps and clinics.</p>;
  return (
    <section className="grid gap-4 rounded-xl border bg-white p-5">
      <h2 className="text-2xl">Camps &amp; Clinics</h2>
      <p>
        New events stay private drafts. An owner reviews and publishes them through the existing
        event controls. Paid reservations and published-event changes require owner review.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading authorized events…</p>}
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={() => void run(async () => {}, "Events refreshed.")}
      >
        Refresh Events
      </Button>
      {data && (
        <>
          {(allowed("camps.create") || allowed("clinics.create")) && (
            <details>
              <summary className="min-h-11">Create event draft</summary>
              <form
                className="grid gap-3"
                onSubmit={(e) =>
                  submit(
                    e,
                    async (f) => {
                      const result = await api.createCoordinatorProgramEvent({
                        data: {
                          teamId,
                          requestId: (creationId.current ||= crypto.randomUUID()),
                          name: text(f, "name"),
                          description: text(f, "description"),
                          location: text(f, "location"),
                          type: text(f, "type") as "camp" | "clinic",
                          capacity: Number(f.get("capacity")),
                          coachIds: f.getAll("coaches").map(String),
                          reason: text(f, "reason"),
                        },
                      });
                      creationId.current = undefined;
                      return result;
                    },
                    "Private event draft created. Add its sessions and cages next.",
                  )
                }
              >
                <label>
                  Event type
                  <select className={field} name="type">
                    {allowed("camps.create") && <option value="camp">Camp</option>}
                    {allowed("clinics.create") && <option value="clinic">Clinic</option>}
                  </select>
                </label>
                <EventFields coaches={data.coaches} />
                <Button type="submit" disabled={busy}>
                  Create Private Event Draft
                </Button>
              </form>
            </details>
          )}
          {allowed("events.read") && !data.items.length && (
            <p>No authorized events on this page.</p>
          )}
          {data.items.map((event) => {
            const edit = allowed(event.type === "camp" ? "camps.update" : "clinics.update");
            return (
              <article
                className="grid gap-3 rounded border p-4"
                key={event.id + ":" + event.revision}
              >
                <h3 className="text-xl">
                  {event.name} · {event.type}
                </h3>
                <p>{event.description}</p>
                <p>
                  {event.location} · {event.publication} · Capacity {event.capacity}
                </p>
                {edit && event.editable && (
                  <details>
                    <summary className="min-h-11">Edit event draft</summary>
                    <form
                      className="grid gap-3"
                      onSubmit={(e) =>
                        submit(e, (f) =>
                          api.saveCoordinatorProgramEvent({
                            data: {
                              eventId: event.id,
                              revision: event.revision,
                              name: text(f, "name"),
                              description: text(f, "description"),
                              location: text(f, "location"),
                              capacity: Number(f.get("capacity")),
                              coachIds: f.getAll("coaches").map(String),
                              reason: text(f, "reason"),
                            },
                          }),
                        )
                      }
                    >
                      <EventFields event={event} coaches={data.coaches} />
                      <Button type="submit" disabled={busy}>
                        Save Event Draft
                      </Button>
                    </form>
                  </details>
                )}
                {allowed("events.cancel.request") && event.publication !== "archived" && (
                  <Button
                    disabled={busy}
                    variant="outlineDark"
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for requesting owner-reviewed cancellation:",
                      );
                      if (reason)
                        void run(
                          () =>
                            api.requestCoordinatorApproval({
                              data: {
                                id: crypto.randomUUID(),
                                kind: "cancel-event",
                                targetId: event.id,
                                teamId,
                                destinationTeamId: "",
                                reason,
                              },
                            }),
                          "Cancellation requested. The event remains unchanged until owner approval.",
                        );
                    }}
                  >
                    Request Event Cancellation
                  </Button>
                )}
                {event.sessions.map((session) => (
                  <div
                    className="grid gap-3 rounded bg-paper p-3"
                    key={session.sessionKey + ":" + session.revision}
                  >
                    <h4>
                      {session.date} · {session.start}–{session.end} · {session.status}
                    </h4>
                    <p>
                      {session.location} · Cages {session.laneIds.join(", ") || "none reserved"}
                    </p>
                    {edit && event.editable && session.status === "confirmed" && (
                      <details>
                        <summary className="min-h-11">Reschedule session and cages</summary>
                        <form
                          className="grid gap-3"
                          onSubmit={(e) =>
                            submit(e, (f) =>
                              api.moveCoordinatorProgramSession({
                                data: {
                                  eventId: event.id,
                                  sessionKey: session.sessionKey,
                                  revision: session.revision,
                                  action: "reschedule",
                                  date: text(f, "date"),
                                  start: text(f, "start"),
                                  end: text(f, "end"),
                                  location: text(f, "location"),
                                  laneIds: f.getAll("lanes").map(String) as ProgramEventLaneIds,
                                  reason: text(f, "reason"),
                                },
                              }),
                            )
                          }
                        >
                          <SessionFields
                            session={session}
                            canReserve={
                              session.laneIds.length
                                ? allowed("cages.update") || allowed("cages.release")
                                : allowed("cages.reserve")
                            }
                          />
                          <Button type="submit" disabled={busy}>
                            Save Session and Cages
                          </Button>
                        </form>
                      </details>
                    )}
                    {(allowed("events.assign") || allowed("events.attendance")) &&
                      session.participants.map((p) => (
                        <div key={p.athleteId} className="flex flex-wrap items-center gap-2">
                          <span>
                            {p.name} · {p.status}
                            {p.checkedIn ? " · checked in" : ""}
                          </span>
                          {allowed("events.attendance") &&
                            p.status === "active" &&
                            !p.checkedIn && (
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Check in ${p.name} for ${event.name} on ${session.date}?`,
                                    )
                                  )
                                    void run(
                                      () =>
                                        api.saveCoordinatorProgramEnrollment({
                                          data: {
                                            eventId: event.id,
                                            sessionKey: session.sessionKey,
                                            sessionRevision: session.revision,
                                            athleteId: p.athleteId,
                                            revision: p.revision,
                                            action: "check-in",
                                            reason: "Coordinator confirmed participant attendance",
                                          },
                                        }),
                                      "Attendance saved.",
                                    );
                                }}
                              >
                                Check In
                              </Button>
                            )}
                          {allowed("events.assign") && p.status === "active" && !p.checkedIn && (
                            <Button
                              disabled={busy}
                              variant="outlineDark"
                              onClick={() => {
                                if (window.confirm(`Withdraw ${p.name} from this event session?`))
                                  void run(() =>
                                    api.saveCoordinatorProgramEnrollment({
                                      data: {
                                        eventId: event.id,
                                        sessionKey: session.sessionKey,
                                        sessionRevision: session.revision,
                                        athleteId: p.athleteId,
                                        revision: p.revision,
                                        action: "unenroll",
                                        reason: "Coordinator reviewed session withdrawal",
                                      },
                                    }),
                                  );
                              }}
                            >
                              Withdraw From Session
                            </Button>
                          )}
                        </div>
                      ))}
                    {allowed("events.assign") &&
                      event.publication === "open" &&
                      session.status === "confirmed" && (
                        <form
                          className="grid gap-2"
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const athleteId = text(f, "athlete"),
                                athlete = data.athletes.find((a) => a.id === athleteId);
                              if (
                                !athlete ||
                                !window.confirm(
                                  `Enroll ${athlete.name} in ${event.name} on ${session.date}?`,
                                )
                              )
                                return;
                              const prior = session.participants.find(
                                (p) => p.athleteId === athleteId,
                              );
                              await api.saveCoordinatorProgramEnrollment({
                                data: {
                                  eventId: event.id,
                                  sessionKey: session.sessionKey,
                                  sessionRevision: session.revision,
                                  athleteId,
                                  revision: prior?.revision || 0,
                                  action: "enroll",
                                  reason: "Coordinator confirmed eligible roster participant",
                                },
                              });
                            })
                          }
                        >
                          <label>
                            Eligible athlete
                            <select className={field} required name="athlete">
                              <option value="">Choose a linked roster athlete</option>
                              {data.athletes.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p>
                            Only current team members with an owner-reviewed athlete identity link
                            appear.
                          </p>
                          <Button type="submit" disabled={busy}>
                            Review Athlete Assignment
                          </Button>
                        </form>
                      )}
                  </div>
                ))}
                {edit && event.editable && (
                  <details>
                    <summary className="min-h-11">Add session and reserve cages</summary>
                    <form
                      className="grid gap-3"
                      onSubmit={(e) =>
                        submit(e, (f) =>
                          api.addCoordinatorProgramSession({
                            data: {
                              eventId: event.id,
                              revision: event.revision,
                              date: text(f, "date"),
                              start: text(f, "start"),
                              end: text(f, "end"),
                              location: text(f, "location"),
                              laneIds: f.getAll("lanes").map(String) as ProgramEventLaneIds,
                              reason: text(f, "reason"),
                            },
                          }),
                        )
                      }
                    >
                      <SessionFields canReserve={allowed("cages.reserve")} />
                      <Button type="submit" disabled={busy}>
                        Add Session and Cages
                      </Button>
                    </form>
                  </details>
                )}
              </article>
            );
          })}
          <nav className="flex gap-3" aria-label="Event history">
            <Button
              variant="outlineDark"
              disabled={busy || !before}
              onClick={() => setBefore(undefined)}
            >
              Newest Events
            </Button>
            <Button
              variant="outlineDark"
              disabled={busy || !data.nextCursor}
              onClick={() => data.nextCursor && setBefore(data.nextCursor)}
            >
              Older Events
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
function EventFields({ event, coaches }: { event?: Event; coaches: Workspace["coaches"] }) {
  return (
    <>
      <label>
        Event name
        <input
          required
          className={field}
          name="name"
          minLength={3}
          maxLength={120}
          defaultValue={event?.name}
        />
      </label>
      <label>
        Description
        <textarea
          required
          className={field}
          name="description"
          minLength={10}
          maxLength={5000}
          defaultValue={event?.description}
        />
      </label>
      <label>
        Location
        <input
          required
          className={field}
          name="location"
          minLength={3}
          maxLength={300}
          defaultValue={event?.location}
        />
      </label>
      <label>
        Capacity
        <input
          required
          className={field}
          name="capacity"
          type="number"
          min={1}
          max={1000}
          defaultValue={event?.capacity || 20}
        />
      </label>
      <fieldset>
        <legend>Instructors — select at least one</legend>
        {coaches.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="coaches"
              value={c.id}
              defaultChecked={event?.coachIds.includes(c.id)}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <label>
        Reason
        <input required className={field} name="reason" minLength={5} maxLength={1000} />
      </label>
    </>
  );
}
function SessionFields({ session, canReserve }: { session?: Session; canReserve: boolean }) {
  return (
    <>
      <label>
        Date
        <input required className={field} name="date" type="date" defaultValue={session?.date} />
      </label>
      <label>
        Start
        <input
          required
          className={field}
          name="start"
          type="time"
          step={300}
          defaultValue={session?.start}
        />
      </label>
      <label>
        End
        <input
          required
          className={field}
          name="end"
          type="time"
          step={300}
          defaultValue={session?.end}
        />
      </label>
      <label>
        Session location
        <input
          required
          className={field}
          name="location"
          minLength={3}
          maxLength={300}
          defaultValue={session?.location}
        />
      </label>
      {canReserve ? (
        <fieldset>
          <legend>Cages — conflicting reservations will be rejected</legend>
          {["1", "2", "3-4", "5", "6", "7"].map((id) => (
            <label className="flex min-h-11 items-center gap-2" key={id}>
              <input
                type="checkbox"
                name="lanes"
                value={id}
                defaultChecked={session?.laneIds.includes(id)}
              />
              Cage {id}
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          {session?.laneIds.map((id) => (
            <input key={id} type="hidden" name="lanes" value={id} />
          ))}
          <p>Your current grants do not allow cage changes.</p>
        </>
      )}
      <label>
        Reason
        <input required className={field} name="reason" minLength={5} maxLength={1000} />
      </label>
    </>
  );
}
