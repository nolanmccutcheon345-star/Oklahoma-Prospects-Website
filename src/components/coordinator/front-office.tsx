import { ContentDrafts } from "./content-drafts";
import { EligibleRosterAthletes, RoutinePlayerInformation } from "./roster-management";
import { TryoutScheduling } from "./tryout-scheduling";
import { ProgramEvents } from "./program-events";
import { TeamOperations } from "./team-operations";
import { RecruitingWorkflow } from "./recruiting-workflow";
import { UserButton } from "@/lib/auth/gates";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import * as api from "@/lib/coordinator/api";
import {
  capabilities,
  type Capability,
  type Sport,
  type HistoryCursor,
} from "@/lib/coordinator/contracts";
import { TRYOUT_STATUSES } from "@/lib/tryout-center-contracts";
import { OrganizationOffice } from "./organization-office";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
const text = (f: FormData, key: string) => String(f.get(key) || "");
export function CoordinatorFrontOffice() {
  const [home, setHome] = useState<Awaited<ReturnType<typeof api.getCoordinatorHome>>>();
  const [error, setError] = useState("");
  const [sport, setSport] = useState<Sport>("softball"),
    [teamId, setTeamId] = useState(""),
    [tab, setTab] = useState("overview");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api
        .getCoordinatorHome()
        .then((r) => {
          if (active) {
            setHome(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setHome(undefined);
            setError(e.message);
          }
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (error)
    return (
      <main id="main" className="mx-auto max-w-4xl p-6">
        <h1>Coordinator Front Office</h1>
        <p role="alert">{error}</p>
        <a href="/login?next=%2Fcoordinator" className="underline">
          Sign in
        </a>
      </main>
    );
  if (!home)
    return (
      <main id="main" className="p-6" role="status">
        Loading coordinator access…
      </main>
    );
  if (home.organizationOperations) return <OrganizationOffice />;
  if (home.financialRestricted && !home.scopedReady)
    return (
      <main id="main" className="p-6">
        <h1>Coordinator Front Office</h1>
        <p role="alert">
          An owner must withdraw your previous access and explicitly configure your coordinator
          permissions.
        </p>
        <UserButton />
      </main>
    );
  const g = home.assignments.find((a) => a.sport === sport && a.status === "active");
  const allowed = (p: Capability) =>
    Boolean(
      g &&
      g.permissions.includes(p) &&
      (g.coverage === "sport" || Boolean(teamId && g.team_ids.includes(teamId))),
    );
  const enabled = home.assignments.some((a) => a.status === "active" && a.permissions.length);
  const tabs = [
    ["overview", "Overview", true],
    [
      "recruiting",
      "Recruiting",
      allowed("recruiting.read") || allowed("tryouts.read") || allowed("recruiting.create"),
    ],
    [
      "rosters",
      "Teams & Rosters",
      allowed("rosters.read") ||
        allowed("rosters.add") ||
        allowed("teams.openings") ||
        allowed("teams.needs") ||
        allowed("teams.statistics"),
    ],
    ["events", "Practices & Events", allowed("events.read") || allowed("practices.create")],
    [
      "programs",
      "Camps & Clinics",
      allowed("events.read") || allowed("camps.create") || allowed("clinics.create"),
    ],
    ["tryout-schedule", "Tryout Schedule", allowed("events.read") || allowed("tryouts.create")],
    ["cages", "Cage Availability", allowed("cages.read")],
    [
      "messages",
      "Communications",
      allowed("communications.read") || allowed("communications.team.send"),
    ],
    [
      "drafts",
      "Website Content",
      Object.keys(capabilities).some((p) => p.startsWith("content.") && allowed(p as Capability)),
    ],
    [
      "reports",
      "Operational Reports",
      Object.keys(capabilities).some((p) => p.startsWith("reports.") && allowed(p as Capability)),
    ],
    ["activity", "My Activity", allowed("activity.read")],
  ] as const;
  const current = tabs.find((t) => t[0] === tab && t[2]) ? tab : "overview";
  return (
    <main id="main" className="bg-paper pb-12">
      <header className="border-b-4 border-maroon bg-ink p-6 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-powder">PROSPECTS SPORTS ACADEMY</p>
          <h1 className="text-3xl">Coordinator Front Office</h1>
          <p>Recruiting, teams, and operations within your approved access.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-5 p-5">
        {!enabled ? (
          <section className="rounded-xl bg-white p-6">
            <h2 className="text-2xl">No operational modules enabled</h2>
            <p>
              Your role does not grant access by itself. Nolan or Steve must explicitly enable
              permissions and scope.
            </p>
          </section>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Program
                <select
                  className={field}
                  value={sport}
                  onChange={(e) => {
                    setSport(e.target.value as Sport);
                    setTeamId("");
                    setTab("overview");
                  }}
                >
                  <option value="softball">Softball</option>
                  <option value="baseball">Baseball</option>
                </select>
              </label>
              <label>
                Team scope
                <select
                  className={field}
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value);
                    setTab("overview");
                  }}
                >
                  <option value="">
                    {g?.coverage === "sport" ? "Sport-wide records" : "Select an authorized team"}
                  </option>
                  {home.targets
                    .filter((t) => t.sport === sport)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <nav aria-label="Coordinator modules" className="flex flex-wrap gap-2">
              {tabs
                .filter((t) => t[2])
                .map(([key, label]) => (
                  <Button
                    key={key}
                    variant={current === key ? "primary" : "outlineDark"}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </Button>
                ))}
            </nav>
            {current === "overview" ? (
              <section className="rounded-xl bg-white p-5">
                <h2 className="text-2xl">Your approved access</h2>
                <p>
                  Choose a team to open its roster, schedule, and communications. Grants are checked
                  again by the server for every action.
                </p>
                <ul className="mt-4 list-disc pl-5">
                  {g?.permissions.map((p) => (
                    <li key={p}>{capabilities[p]}</li>
                  ))}
                </ul>
                {!g && <p>No active role for this sport.</p>}
              </section>
            ) : current === "drafts" ? (
              <ContentDrafts
                key={sport + teamId + g?.revision}
                sport={sport}
                teamId={teamId}
                allowed={allowed}
              />
            ) : current === "tryout-schedule" ? (
              <TryoutScheduling
                key={sport + teamId + g?.revision}
                teamId={teamId}
                allowed={allowed}
              />
            ) : current === "programs" ? (
              <ProgramEvents key={sport + teamId + g?.revision} teamId={teamId} allowed={allowed} />
            ) : (
              <CoordinatorModule
                key={sport + teamId + current + g?.revision}
                tab={current}
                sport={sport}
                teamId={teamId}
                allowed={allowed}
                teamName={home.targets.find((t) => t.id === teamId)?.name || ""}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
function CoordinatorModule({
  tab,
  sport,
  teamId,
  allowed,
  teamName,
}: {
  tab: string;
  sport: Sport;
  teamId: string;
  allowed: (p: Capability) => boolean;
  teamName: string;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [recruits, setRecruits] = useState<
    Awaited<ReturnType<typeof api.getCoordinatorRecruiting>>["items"]
  >([]);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof api.getCoordinatorRoster>>>([]);
  const [schedule, setSchedule] = useState<Awaited<ReturnType<typeof api.getCoordinatorSchedule>>>(
    [],
  );
  const [messages, setMessages] = useState<
    Awaited<ReturnType<typeof api.getCoordinatorMessages>>["items"]
  >([]);
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.getCoordinatorReports>>>();
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof api.getCoordinatorActivity>>>(
    [],
  );
  const [occupied, setOccupied] = useState<Awaited<ReturnType<typeof api.getCoordinatorCages>>>([]);
  const [before, setBefore] = useState<HistoryCursor>();
  const [nextCursor, setNextCursor] = useState<HistoryCursor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (tab === "recruiting" && (allowed("recruiting.read") || allowed("tryouts.read"))) {
      const page = await api.getCoordinatorRecruiting({ data: { sport, teamId, before } });
      setRecruits(page.items);
      setNextCursor(page.nextCursor);
    }
    if (tab === "rosters" && teamId && allowed("rosters.read"))
      setRoster(await api.getCoordinatorRoster({ data: teamId }));
    if (tab === "events" && teamId && allowed("events.read"))
      setSchedule(await api.getCoordinatorSchedule({ data: teamId }));
    if (tab === "messages" && teamId && allowed("communications.read")) {
      const page = await api.getCoordinatorMessages({ data: { teamId, before } });
      setMessages(page.items);
      setNextCursor(page.nextCursor);
    }
    if (tab === "reports") setReport(await api.getCoordinatorReports({ data: { sport, teamId } }));
    if (tab === "activity")
      setActivity(await api.getCoordinatorActivity({ data: { sport, teamId } }));
  }, [tab, teamId, sport, allowed, before]);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setRecruits([]);
    setMessages([]);
    setNextCursor(null);
    setError("");
    void load()
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [load]);
  async function run(work: () => Promise<unknown>, success = "Saved.") {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await work();
      await load();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the action.");
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    work: (f: FormData) => Promise<unknown>,
    success?: string,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    void run(() => work(new FormData(form)), success);
  }
  return (
    <section className="grid gap-4 rounded-xl border border-line bg-white p-5">
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loaded && !error && <p role="status">Loading authorized records…</p>}
      {["recruiting", "messages"].includes(tab) && (before || nextCursor) && (
        <nav aria-label="Record history" className="flex flex-wrap gap-3">
          <Button
            variant="outlineDark"
            disabled={!before || !loaded || busy}
            onClick={() => setBefore(undefined)}
          >
            Newest records
          </Button>
          <Button
            variant="outlineDark"
            disabled={!nextCursor || !loaded || busy}
            onClick={() => nextCursor && setBefore(nextCursor)}
          >
            Older records
          </Button>
        </nav>
      )}
      {["rosters", "events", "messages"].includes(tab) && !teamId ? (
        <p>Select a team above to open this module.</p>
      ) : (
        <>
          {tab === "recruiting" && (
            <>
              <h2 className="text-2xl">Recruiting & Tryout Registrations</h2>
              {loaded &&
                (allowed("recruiting.read") || allowed("tryouts.read")) &&
                !recruits.length && <p>No registrations in this scope.</p>}
              {recruits.map((r) => (
                <article className="grid gap-2 rounded border p-4" key={r.id}>
                  <h3 className="text-xl">
                    {r.player} · {r.age}
                  </h3>
                  <p>
                    {r.positions} · {r.status}
                  </p>
                  {r.email && (
                    <p>
                      Guardian: {r.parent} · {r.email} · {r.phone}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {allowed(r.kind === "tryout" ? "tryouts.status" : "recruiting.status") && (
                      <label>
                        Status
                        <select
                          className={field}
                          disabled={busy}
                          value={r.status}
                          onChange={(e) =>
                            void run(() =>
                              api.editCoordinatorRequest({
                                data: {
                                  action: "status",
                                  id: r.id,
                                  revision: r.work_revision,
                                  status: e.target.value as (typeof TRYOUT_STATUSES)[number],
                                },
                              }),
                            )
                          }
                        >
                          {TRYOUT_STATUSES.filter(
                            (s) =>
                              !["attended", "no-show"].includes(s) ||
                              (r.kind === "tryout" && allowed("tryouts.attendance")) ||
                              s === r.status,
                          ).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {allowed("recruiting.notes") && (
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={() => {
                          const note = window.prompt(
                            "Recruiting note (no medical or financial information):",
                          );
                          if (note)
                            void run(() =>
                              api.editCoordinatorRequest({
                                data: {
                                  action: "note",
                                  id: r.id,
                                  note,
                                  actionId: crypto.randomUUID(),
                                },
                              }),
                            );
                        }}
                      >
                        Add Note
                      </Button>
                    )}
                    {allowed("recruiting.update") && (
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={() => {
                          const positions = window.prompt("Player positions:", r.positions || "");
                          if (positions !== null)
                            void run(() =>
                              api.editCoordinatorRequest({
                                data: {
                                  action: "update",
                                  id: r.id,
                                  revision: r.revision,
                                  positions,
                                  age: r.age,
                                },
                              }),
                            );
                        }}
                      >
                        Edit Positions
                      </Button>
                    )}
                    {allowed("communications.recruit.send") && r.email && (
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={() => {
                          const subject = window.prompt("Email subject:");
                          if (!subject) return;
                          const body = window.prompt("Message to this guardian:");
                          if (
                            !body ||
                            !window.confirm(
                              `Send to ${r.parent || "guardian"} at ${r.email}?\n\n${subject}\n\n${body}`,
                            )
                          )
                            return;
                          void run(
                            () =>
                              api.sendCoordinatorEmail({
                                data: {
                                  id: crypto.randomUUID(),
                                  requestId: r.id,
                                  subject,
                                  body,
                                  confirmedEmail: r.email!,
                                },
                              }),
                            "Email queued. Delivery is handled by the existing notification worker.",
                          );
                        }}
                      >
                        Email Guardian
                      </Button>
                    )}
                  </div>
                  <RecruitingWorkflow
                    key={r.id + ":" + r.work_revision}
                    requestId={r.id}
                    kind={r.kind}
                    revision={r.work_revision}
                    allowed={allowed}
                    onSaved={load}
                  />
                </article>
              ))}
              {allowed("recruiting.create") && (
                <details className="rounded border p-4">
                  <summary className="min-h-11 font-semibold">Add prospect</summary>
                  <form
                    className="grid gap-3"
                    onSubmit={(e) =>
                      submit(e, (f) =>
                        api.addCoordinatorProspect({
                          data: {
                            id: crypto.randomUUID(),
                            sport,
                            teamId,
                            player: text(f, "player"),
                            age: text(f, "age"),
                            positions: text(f, "positions"),
                            parent: text(f, "parent"),
                            email: text(f, "email"),
                            phone: text(f, "phone"),
                          },
                        }),
                      )
                    }
                  >
                    {[
                      ["player", "Player name"],
                      ["age", "Age division"],
                      ["positions", "Positions"],
                      ["parent", "Guardian name"],
                      ["email", "Guardian email"],
                      ["phone", "Guardian phone"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          className={field}
                          name={key}
                          type={key === "email" ? "email" : "text"}
                          required={!["phone", "positions"].includes(key)}
                        />
                      </label>
                    ))}
                    <Button type="submit" disabled={busy}>
                      Add Prospect
                    </Button>
                  </form>
                </details>
              )}
            </>
          )}
          {tab === "rosters" && (
            <>
              <h2 className="text-2xl">{teamName} Roster</h2>
              {allowed("rosters.add") && <EligibleRosterAthletes teamId={teamId} onAdded={load} />}
              {(allowed("teams.openings") ||
                allowed("teams.needs") ||
                allowed("teams.statistics")) && (
                <TeamOperations teamId={teamId} allowed={allowed} />
              )}
              {allowed("rosters.read") && !roster.length && loaded && (
                <p>No active roster players.</p>
              )}
              {roster.map((p) => (
                <article key={p.id} className="grid gap-2 rounded border p-4">
                  <h3 className="text-xl">
                    #{p.number} {p.name}
                  </h3>
                  <p>{p.positions?.join(", ")}</p>
                  {allowed("rosters.information") && (
                    <RoutinePlayerInformation
                      key={p.id + ":" + p.revision}
                      teamId={teamId}
                      player={p}
                      onSaved={load}
                    />
                  )}
                  {p.parents.map((g, i) => (
                    <p key={i}>
                      {g.name} · {g.email} · {g.phone}
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {allowed("rosters.number") && (
                      <Button
                        disabled={busy}
                        variant="outlineDark"
                        onClick={() => {
                          const value = window.prompt("Jersey number:", p.number || "");
                          if (value !== null)
                            void run(() =>
                              api.saveCoordinatorRoster({
                                data: {
                                  teamId,
                                  playerId: p.id,
                                  revision: p.revision,
                                  field: "number",
                                  value,
                                },
                              }),
                            );
                        }}
                      >
                        Edit Number
                      </Button>
                    )}
                    {allowed("rosters.positions") && (
                      <Button
                        disabled={busy}
                        variant="outlineDark"
                        onClick={() => {
                          const value = window.prompt(
                            "Positions, separated by commas:",
                            p.positions?.join(", ") || "",
                          );
                          if (value !== null)
                            void run(() =>
                              api.saveCoordinatorRoster({
                                data: {
                                  teamId,
                                  playerId: p.id,
                                  revision: p.revision,
                                  field: "positions",
                                  value: value
                                    .split(",")
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                },
                              }),
                            );
                        }}
                      >
                        Edit Positions
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
          {tab === "events" && (
            <>
              <h2 className="text-2xl">{teamName} Schedule</h2>
              {schedule.map((e) => (
                <article className="grid gap-2 rounded border p-4" key={e.id}>
                  <h3 className="text-xl">{e.title}</h3>
                  <p>
                    {e.date} · {e.time}–{e.end_time} Central · {e.location} · {e.status}
                  </p>
                  {e.lane_ids.length > 0 && <p>Cages: {e.lane_ids.join(", ")}</p>}
                  {e.kind === "practice" && e.status === "scheduled" && (
                    <div className="flex flex-wrap gap-2">
                      {allowed("practices.update") && (
                        <Button
                          disabled={busy}
                          variant="outlineDark"
                          onClick={() => {
                            const date = window.prompt("New date (YYYY-MM-DD):", e.date);
                            if (!date) return;
                            const time = window.prompt("New start time (24-hour Central):", e.time);
                            if (!time) return;
                            const duration =
                              Number(e.end_time.slice(0, 2)) * 60 +
                              Number(e.end_time.slice(3)) -
                              (Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3)));
                            void run(() =>
                              api.saveCoordinatorPractice({
                                data: {
                                  id: e.id,
                                  teamId,
                                  revision: e.revision,
                                  title: e.title,
                                  date,
                                  time,
                                  duration,
                                  location: e.location,
                                  laneIds: e.lane_ids as ("1" | "2" | "3-4" | "5" | "6" | "7")[],
                                },
                              }),
                            );
                          }}
                        >
                          Reschedule
                        </Button>
                      )}
                      {allowed("events.cancel.request") && (
                        <Button
                          variant="outlineDark"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Reason for cancellation request:");
                            if (reason)
                              void run(
                                () =>
                                  api.requestCoordinatorApproval({
                                    data: {
                                      id: crypto.randomUUID(),
                                      kind: "cancel-event",
                                      targetId: e.id,
                                      teamId,
                                      destinationTeamId: "",
                                      reason,
                                    },
                                  }),
                                "Cancellation request submitted to the owners.",
                              );
                          }}
                        >
                          Request Cancellation
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {allowed("practices.create") && (
                <details className="rounded border p-4">
                  <summary className="min-h-11 font-semibold">Create practice</summary>
                  <form
                    className="grid gap-3"
                    onSubmit={(e) =>
                      submit(e, (f) =>
                        api.saveCoordinatorPractice({
                          data: {
                            id: crypto.randomUUID(),
                            revision: 0,
                            teamId,
                            title: text(f, "title"),
                            date: text(f, "date"),
                            time: text(f, "time"),
                            duration: Number(f.get("duration")),
                            location: text(f, "location"),
                            laneIds: f.getAll("lanes") as ("1" | "2" | "3-4" | "5" | "6" | "7")[],
                          },
                        }),
                      )
                    }
                  >
                    {[
                      ["title", "Title", "text"],
                      ["date", "Date", "date"],
                      ["time", "Start time (Central)", "time"],
                      ["location", "Location", "text"],
                    ].map(([name, label, type]) => (
                      <label key={name}>
                        {label}
                        <input className={field} name={name} type={type} required />
                      </label>
                    ))}
                    <label>
                      Duration
                      <select className={field} name="duration">
                        {[30, 60, 90, 120, 150, 180].map((n) => (
                          <option key={n} value={n}>
                            {n} minutes
                          </option>
                        ))}
                      </select>
                    </label>
                    {allowed("cages.reserve") && (
                      <fieldset>
                        <legend>Reserve cages (optional)</legend>
                        {["1", "2", "3-4", "5", "6", "7"].map((id) => (
                          <label className="mr-4 inline-flex min-h-11 items-center gap-2" key={id}>
                            <input type="checkbox" name="lanes" value={id} />
                            Cage {id}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <Button type="submit" disabled={busy}>
                      Create Practice
                    </Button>
                    <p>
                      Existing reservations take priority. A conflict rejects the entire change.
                    </p>
                  </form>
                </details>
              )}
            </>
          )}
          {tab === "messages" && (
            <>
              <h2 className="text-2xl">{teamName} Communications</h2>
              {allowed("communications.team.send") && (
                <form
                  className="grid gap-3"
                  onSubmit={(e) =>
                    submit(
                      e,
                      async (f) => {
                        const body = text(f, "body");
                        if (
                          !window.confirm(`Post to the ${teamName} team conversation?\n\n${body}`)
                        )
                          return;
                        return api.sendCoordinatorMessage({
                          data: { id: crypto.randomUUID(), teamId, confirmedTeamId: teamId, body },
                        });
                      },
                      "Message posted in the team conversation.",
                    )
                  }
                >
                  <label>
                    Message
                    <textarea className={field} name="body" required maxLength={3000} rows={5} />
                  </label>
                  <p>
                    Recipients: authenticated members of {teamName}. This posts in the team
                    conversation; it does not send a program-wide email.
                  </p>
                  <Button type="submit" disabled={busy}>
                    Preview & Confirm Message
                  </Button>
                </form>
              )}
              {messages.map((m) => (
                <article key={m.id} className="rounded border p-3">
                  <strong>{m.author}</strong>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <small>{new Date(m.created_at).toLocaleString()}</small>
                </article>
              ))}
            </>
          )}
        </>
      )}
      {tab === "cages" && (
        <>
          <h2 className="text-2xl">Shared Cage Availability</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) =>
              submit(
                e,
                async (f) =>
                  setOccupied(
                    await api.getCoordinatorCages({
                      data: { sport, teamId, date: text(f, "date") },
                    }),
                  ),
                "Occupancy loaded. Times below are unavailable.",
              )
            }
          >
            <label>
              Date
              <input className={field} type="date" name="date" required />
            </label>
            <Button type="submit" disabled={busy}>
              View Occupied Times
            </Button>
          </form>
          <p>
            Customer identities and payment details are not shown. Final availability is checked
            when the reservation is saved.
          </p>
          <div className="max-h-80 overflow-auto">
            {occupied.map((o) => (
              <p key={o.resource_id + String(o.slot_at)}>
                {o.resource_id.replace("lane:", "Cage ")} ·{" "}
                {new Date(o.slot_at).toLocaleTimeString("en-US", {
                  timeZone: "America/Chicago",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                Central
              </p>
            ))}
          </div>
        </>
      )}
      {tab === "reports" && report && (
        <>
          <h2 className="text-2xl">Nonfinancial Operations</h2>
          <dl className="grid grid-cols-2 gap-4">
            {Object.entries(report).map(([key, count]) => (
              <div className="rounded bg-paper p-4" key={key}>
                <dt className="capitalize">{key}</dt>
                <dd className="text-3xl">{count}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {tab === "activity" && (
        <>
          <h2 className="text-2xl">My Authorized Activity</h2>
          {activity.map((a, i) => (
            <p key={i}>
              {new Date(a.created_at).toLocaleString()} · {a.action} · {a.result}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
