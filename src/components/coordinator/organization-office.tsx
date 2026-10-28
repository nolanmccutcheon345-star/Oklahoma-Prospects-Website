import { RegistrationProfileFilters } from "../registration-profile-filters";
import type { RegistrationFilters } from "@/lib/registration-filters";
import { RegistrationProfileSummary } from "@/components/registration-profile-summary";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../ui/button";
import { UserButton } from "@/lib/auth/gates";
import { LessonAssignments } from "@/components/commerce/lesson-assignments";
import { OrganizationPeople } from "./organization-people";
import { OrganizationEvents } from "./organization-events";
import { OrganizationBookings } from "./organization-bookings";
import { OrganizationContent } from "./organization-content";
import { TryoutEventEditor } from "@/components/tryout-event-editor";
import { OrganizationLessonCompletion } from "./organization-lesson-completion";
import { OrganizationDevelopment } from "@/components/coordinator/organization-development";
import { OrganizationCatalog } from "@/components/coordinator/organization-catalog";
import { OrganizationTournamentFinder } from "@/components/coordinator/organization-tournaments";
import { OrganizationGameResults } from "@/components/coordinator/organization-game-results";
import { EVALUATION_SKILLS, RECOMMENDATIONS } from "@/lib/tryout-evaluation-contracts";
import * as api from "@/lib/coordinator/organization-api";
import {
  sendOrganizationRecruitingEmail,
  getOrganizationDrafts,
  saveOrganizationDraft,
  getOrganizationOwnActivity,
} from "@/lib/coordinator/organization-communications-api";
import { getOrganizationReport } from "@/lib/coordinator/organization-reports-api";
import { getOperationalServiceResources, setServiceResources } from "@/lib/commerce/operations-api";
import { TRYOUT_STATUSES } from "@/lib/tryout-center-contracts";
import type {
  OrganizationPlayerInput,
  OrganizationStaffInput,
  OrganizationRegistrationInput,
  OrganizationEvaluationInput,
  OrganizationActivityInput,
} from "@/lib/coordinator/organization-contracts";

type Workspace = Awaited<ReturnType<typeof api.getOrganizationWorkspace>>;
type Team = Workspace["teams"][number];
type Player = Team["roster"][number];
type Staff = Team["staff"][number];
type Run = (work: () => Promise<unknown>, success: string | (() => string)) => Promise<void>;
const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const card = "grid min-w-0 gap-4 rounded-xl border border-line bg-white p-5";
const value = (form: FormData, key: string) => String(form.get(key) || "").trim();
const tabs = [
  ["overview", "Overview"],
  ["teams", "Teams"],
  ["players", "Players & Guardians"],
  ["staff", "Coaches & Staff"],
  ["registrations", "Registrations"],
  ["schedule", "Schedule"],
  ["results", "Game Results"],
  ["tournaments", "Tournament Finder"],
  ["catalog", "Services & Events"],
  ["development", "Player Development"],
  ["cages", "Cage Availability"],
  ["evaluations", "Evaluations"],
  ["messages", "Team Messages"],
  ["drafts", "Website Drafts"],
  ["content", "Content & Recruiting"],
  ["activity", "My Activity"],
  ["tryouts", "Tryout Events"],
  ["lessons", "Lessons"],
  ["bookings", "Bookings & Camps"],
  ["directory", "Staff Directory"],
  ["resources", "Facility Resources"],
  ["reports", "Reports"],
] as const;
type Tab = (typeof tabs)[number][0];
function Input({
  name,
  label,
  initial = "",
  type = "text",
  required = false,
  maxLength = 200,
}: {
  name: string;
  label: string;
  initial?: string | null;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      {label}
      <input
        className={field}
        name={name}
        defaultValue={initial || ""}
        type={type}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}
function Select({
  name,
  label,
  initial = "",
  children,
  required = false,
  disabled = false,
}: {
  name: string;
  label: string;
  initial?: string | null;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      {label}
      <select
        className={field}
        name={name}
        defaultValue={initial || ""}
        required={required}
        disabled={disabled}
      >
        {children}
      </select>
    </label>
  );
}
function Check({
  name,
  label,
  checked = false,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} />
      {label}
    </label>
  );
}
function Form({
  busy,
  onSave,
  children,
  label = "Save Changes",
}: {
  busy: boolean;
  onSave: (form: FormData) => void;
  children: ReactNode;
  label?: string;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onSave(new FormData(event.currentTarget));
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="grid min-w-0 gap-3">
        {children}
        <Button type="submit" className="justify-self-start">
          {busy ? "Saving…" : label}
        </Button>
      </fieldset>
    </form>
  );
}

export function OrganizationOffice() {
  const [athleteFilters,setAthleteFilters]=useState<RegistrationFilters>();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [sport, setSport] = useState("");
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const scoped = ![
    "tryouts",
    "lessons",
    "bookings",
    "directory",
    "cages",
    "resources",
    "reports",
    "results",
    "tournaments",
    "catalog",
    "development",
    "content",
  ].includes(tab);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function leaveForm() {
    if (dirty && !window.confirm("Discard unsaved changes in this view?")) return false;
    setDirty(false);
    return true;
  }
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await api.getOrganizationWorkspace({data:athleteFilters}));
    } catch (e) {
      setWorkspace(undefined);
      setError(e instanceof Error ? e.message : "Could not load organization operations.");
    } finally {
      setLoading(false);
    }
  }, [athleteFilters]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const run: Run = async (work, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(typeof success === "function" ? success() : success);
      setDirty(false);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your changes have not been confirmed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const teams = workspace?.teams.filter((t) => !sport || t.sport === sport) || [];
  const selected = teams.find((t) => t.id === teamId);
  const visibleTeams = selected ? [selected] : teams;
  const matches = (...parts: (string | null | undefined)[]) =>
    parts.join(" ").toLowerCase().includes(search.trim().toLowerCase());
  return (
    <main id="main" className="bg-paper pb-12 text-ink">
      <header className="border-b-4 border-maroon bg-ink p-6 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-powder">PROSPECTS SPORTS ACADEMY</p>
          <h1 className="text-3xl">Organization Operations</h1>
          <p>Nonfinancial administration across baseball and softball.</p>
        </div>
      </header>
      <div
        className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-5"
        onChangeCapture={(event) => {
          if ((event.target as HTMLElement).closest("form") && scoped) setDirty(true);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <UserButton />
          <Button
            variant="outlineDark"
            disabled={busy || loading}
            onClick={() => {
              if (!leaveForm()) return;
              setNotice("");
              void refresh();
            }}
          >
            Refresh Records
          </Button>
        </div>
        {error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded border border-line bg-white p-4">
            {notice}
          </p>
        )}
        {loading && <p role="status">Loading organization records…</p>}
        {workspace && (
          <>
            {scoped && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Program
                  <select
                    aria-label="Program"
                    className={field}
                    value={sport}
                    disabled={busy}
                    onChange={(e) => {
                      if (!leaveForm()) return;
                      setSport(e.target.value);
                      setTeamId("");
                      setSearch("");
                    }}
                  >
                    <option value="">All programs</option>
                    <option value="baseball">Baseball</option>
                    <option value="softball">Softball</option>
                  </select>
                </label>
                <label>
                  Team workspace
                  <select
                    aria-label="Team workspace"
                    className={field}
                    value={selected?.id || ""}
                    disabled={busy}
                    onChange={(e) => {
                      if (!leaveForm()) return;
                      setTeamId(e.target.value);
                      setSearch("");
                    }}
                  >
                    <option value="">All teams</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.closed ? " (closed)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="text-sm">
              Some existing records require an owner-managed workflow. Protected changes are
              rejected without changing the record.
            </p>
            <nav aria-label="Organization operations" className="flex flex-wrap gap-2">
              {tabs.map(([key, label]) => (
                <Button
                  key={key}
                  variant={tab === key ? "primary" : "outlineDark"}
                  aria-current={tab === key ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    if (key !== tab && !leaveForm()) return;
                    setTab(key);
                    setSearch("");
                    setNotice("");
                    setError("");
                  }}
                >
                  {label}
                </Button>
              ))}
            </nav>
            {scoped && !["overview", "messages", "drafts", "activity"].includes(tab) && (
              <label>
                Search this view
                <input
                  className={field}
                  type="search"
                  value={search}
                  onChange={(e) => {
                    if (leaveForm()) setSearch(e.target.value);
                  }}
                  placeholder="Name, team, or contact"
                />
              </label>
            )}
            {tab === "overview" && (
              <section className={card}>
                <h2 className="text-2xl">Your operational workspace</h2>
                <p>
                  Choose a program or team, then open a module. Each save is checked against your
                  current access and the latest record revision.
                </p>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <dt>Teams in view</dt>
                    <dd className="text-3xl">{visibleTeams.length}</dd>
                  </div>
                  <div>
                    <dt>Active roster players</dt>
                    <dd className="text-3xl">
                      {visibleTeams.reduce(
                        (n, t) => n + t.roster.filter((p) => !p.withdrawn).length,
                        0,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Team staff records</dt>
                    <dd className="text-3xl">
                      {visibleTeams.reduce((n, t) => n + t.staff.length, 0)}
                    </dd>
                  </div>
                </dl>
                <h3 className="text-lg">Available workflows and limits</h3>
                <ul className="list-disc space-y-2 pl-5">
                  {workspace.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </section>
            )}
            {tab === "teams" && (
              <section className={card}>
                <h2 className="text-2xl">Team Administration</h2>
                <details className="rounded border border-line p-4">
                  <summary className="min-h-11 cursor-pointer font-semibold">Create team</summary>
                  <TeamForm
                    key={`new-${workspace.revision}`}
                    revision={workspace.revision}
                    busy={busy || loading}
                    run={run}
                  />
                </details>
                {visibleTeams
                  .filter((t) => matches(t.name, t.age, t.headCoach, t.coachEmail))
                  .map((t) => (
                    <article key={t.id} className="grid gap-2 rounded border border-line p-4">
                      <h3 className="text-xl">{t.name}</h3>
                      <p className="capitalize">
                        {t.sport} · {t.age} · {t.closed ? "Closed" : "Active"}
                      </p>
                      <p>
                        {t.seasonLabel || "No season label"} ·{" "}
                        {t.roster.filter((p) => !p.withdrawn).length} active players
                      </p>
                      <details>
                        <summary className="min-h-11 cursor-pointer font-semibold">
                          Edit {t.name}
                        </summary>
                        <TeamForm
                          key={workspace.revision}
                          team={t}
                          revision={workspace.revision}
                          busy={busy || loading}
                          run={run}
                        />
                      </details>
                    </article>
                  ))}
                {!visibleTeams.some((t) => matches(t.name, t.age, t.headCoach, t.coachEmail)) && (
                  <p>No teams match this view.</p>
                )}
              </section>
            )}
            {tab === "players" && (
              <section className={card}>
                <h2 className="text-2xl">Players & Guardian Contacts</h2>
                {!selected ? (
                  <p>Select a team above to manage its players and guardian contacts.</p>
                ) : (
                  <>
                    <p>{selected.name}</p>
                    <details className="rounded border border-line p-4">
                      <summary className="min-h-11 cursor-pointer font-semibold">
                        Add player
                      </summary>
                      <PlayerForm
                        key={`new-${workspace.revision}`}
                        team={selected}
                        revision={workspace.revision}
                        busy={busy || loading}
                        run={run}
                      />
                    </details>
                    {selected.roster
                      .filter((p) =>
                        matches(
                          p.name,
                          p.email,
                          ...p.parents.flatMap((g) => [g.name, g.email, g.phone]),
                        ),
                      )
                      .map((p) => (
                        <article key={p.id} className="grid gap-2 rounded border border-line p-4">
                          <h3 className="text-xl">
                            {p.number ? `#${p.number} ` : ""}
                            {p.name}
                          </h3>
                          <p>
                            {p.positions.join(", ") || "No positions set"} ·{" "}
                            {p.withdrawn ? "Withdrawn" : "Active"}
                          </p>
                          {p.parents.map((g, i) => (
                            <p key={i} className="break-words">
                              {g.name || "Guardian"} · {g.email || "No email"} ·{" "}
                              {g.phone || "No phone"}
                            </p>
                          ))}
                          <details>
                            <summary className="min-h-11 cursor-pointer font-semibold">
                              Edit {p.name}
                            </summary>
                            <PlayerForm
                              key={workspace.revision}
                              team={selected}
                              player={p}
                              revision={workspace.revision}
                              busy={busy || loading}
                              run={run}
                            />
                          </details>
                          <details>
                            <summary className="min-h-11 cursor-pointer font-semibold">
                              Move to another team
                            </summary>
                            <Form
                              busy={busy || loading}
                              label="Review Transfer"
                              onSave={(f) => {
                                const destinationTeamId = value(f, "destinationTeamId");
                                const destination = workspace.teams.find(
                                  (t) => t.id === destinationTeamId,
                                );
                                if (
                                  destination &&
                                  window.confirm(
                                    `Move ${p.name} from ${selected.name} to ${destination.name}? Existing agreements and restricted fields will be preserved.`,
                                  )
                                )
                                  void run(
                                    () =>
                                      api.moveOrganizationPlayer({
                                        data: {
                                          revision: workspace.revision,
                                          teamId: selected.id,
                                          playerId: p.id,
                                          destinationTeamId,
                                        },
                                      }),
                                    "Player moved to the selected team.",
                                  );
                              }}
                            >
                              <Select name="destinationTeamId" label="Destination team" required>
                                <option value="">Choose a destination</option>
                                {workspace.teams
                                  .filter(
                                    (t) =>
                                      t.id !== selected.id &&
                                      !t.closed &&
                                      t.sport === selected.sport,
                                  )
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                              </Select>
                              <p>
                                Review the destination before confirming. This preserves the
                                player's existing records.
                              </p>
                            </Form>
                          </details>
                        </article>
                      ))}
                    {!selected.roster.some((p) =>
                      matches(
                        p.name,
                        p.email,
                        ...p.parents.flatMap((g) => [g.name, g.email, g.phone]),
                      ),
                    ) && <p>No players match this view.</p>}
                  </>
                )}
              </section>
            )}
            {tab === "staff" && (
              <section className={card}>
                <h2 className="text-2xl">Team Coaches & Staff</h2>
                <p>
                  These are operational team contacts and compliance tracking. Account access is
                  managed separately by the owners.
                </p>
                {!selected ? (
                  <p>Select a team above to manage its staff records.</p>
                ) : (
                  <>
                    <details className="rounded border border-line p-4">
                      <summary className="min-h-11 cursor-pointer font-semibold">
                        Add staff contact
                      </summary>
                      <StaffForm
                        key={`new-${workspace.revision}`}
                        teamId={selected.id}
                        revision={workspace.revision}
                        busy={busy || loading}
                        run={run}
                      />
                    </details>
                    {selected.staff
                      .filter((s) => matches(s.name, s.role, s.email))
                      .map((s) => (
                        <article key={s.id} className="grid gap-2 rounded border border-line p-4">
                          <h3 className="text-xl">{s.name}</h3>
                          <p className="break-words">
                            {s.role} · {s.email || "No email"}
                          </p>
                          <details>
                            <summary className="min-h-11 cursor-pointer font-semibold">
                              Edit {s.name}
                            </summary>
                            <StaffForm
                              key={workspace.revision}
                              teamId={selected.id}
                              staff={s}
                              revision={workspace.revision}
                              busy={busy || loading}
                              run={run}
                            />
                          </details>
                        </article>
                      ))}
                    {!selected.staff.some((s) => matches(s.name, s.role, s.email)) && (
                      <p>No staff contacts match this view.</p>
                    )}
                  </>
                )}
              </section>
            )}
            {tab === "registrations" && (
              <section className={card}>
                <h2 className="text-2xl">Registration Administration</h2>
                <p>
                  Manage intake contact details, team matching, and staff follow-up. Existing notes
                  are withheld.
                </p>
                <details className="rounded border border-line p-4">
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    Add registration
                  </summary>
                  <RegistrationForm
                    key={`new-${workspace.revision}-${workspace.registrations.length}`}
                    workspace={workspace}
                    busy={busy || loading}
                    run={run}
                  />
                </details>
                <RegistrationProfileFilters busy={busy||loading} onApply={filters=>{if(leaveForm())setAthleteFilters(filters);}}/>
                {workspace.registrations
                  .filter(
                    (r) =>
                      (!sport || r.sport === sport) &&
                      (!selected ||
                        r.preferredTeamId === selected.id ||
                        r.workflow.teamId === selected.id) &&
                      matches(r.player, r.parent, r.email, r.phone),
                  )
                  .map((r) => (
                    <article key={r.id} className="grid gap-2 rounded border border-line p-4">
                      <h3 className="text-xl">{r.player || "Unnamed registration"}</h3>
                      <p>
                        Requested {r.age} · {r.sport || "Unclassified sport"} · {r.workflow.status}
                      </p><RegistrationProfileSummary profile={r.profile}/>
                      <p className="break-words">
                        {r.parent} · {r.email} · {r.phone}
                      </p>
                      <p>Submitted {new Date(r.createdAt).toLocaleDateString()}</p>
                      <details>
                        <summary className="min-h-11 cursor-pointer font-semibold">
                          Edit registration for {r.player || "this player"}
                        </summary>
                        <RegistrationForm
                          key={`${r.revision}-${r.workRevision}`}
                          registration={r}
                          workspace={workspace}
                          busy={busy || loading}
                          run={run}
                        />
                      </details>
                      {r.email && ["baseball", "softball"].includes(r.sport) ? (
                        <details>
                          <summary className="min-h-11 cursor-pointer font-semibold">
                            Email guardian for {r.player || "this registration"}
                          </summary>
                          <RecruitingEmailForm registration={r} busy={busy || loading} run={run} />
                        </details>
                      ) : (
                        <p>
                          Add a valid program and guardian email to this registration before sending
                          a recruiting email.
                        </p>
                      )}
                    </article>
                  ))}
                {!workspace.registrations.some(
                  (r) =>
                    (!sport || r.sport === sport) &&
                    (!selected ||
                      r.preferredTeamId === selected.id ||
                      r.workflow.teamId === selected.id) &&
                    matches(r.player, r.parent, r.email, r.phone),
                ) && <p>No registrations match this view.</p>}
              </section>
            )}
            {tab === "schedule" && (
              <section className={card}>
                <h2 className="text-2xl">Team Schedule</h2>
                <p>
                  Times are Central. Manage scheduled activities and cancellations. Use Game Results
                  to update scores and player statistics for live or completed games.
                </p>
                {selected && !selected.closed ? (
                  <details className="rounded border border-line p-4">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      Create team activity
                    </summary>
                    <ActivityForm
                      key={`new-${workspace.activities.length}`}
                      teamId={selected.id}
                      busy={busy || loading}
                      run={run}
                    />
                  </details>
                ) : (
                  <p>Select an active team above to create an activity.</p>
                )}
                {workspace.activities
                  .filter(
                    (a) =>
                      visibleTeams.some((t) => t.id === a.teamId) &&
                      matches(a.title, a.location, a.date),
                  )
                  .map((a) => (
                    <article key={a.id} className="grid gap-2 rounded border border-line p-4">
                      <h3 className="text-xl">{a.title}</h3>
                      <p>
                        {workspace.teams.find((t) => t.id === a.teamId)?.name} · {a.kind} ·{" "}
                        {a.status}
                      </p>
                      <p>
                        {a.date} · {a.startTime}–{a.endTime} Central · {a.location}
                      </p>
                      {a.laneIds.length > 0 && <p>Cages: {a.laneIds.join(", ")}</p>}
                      {["scheduled", "cancelled"].includes(a.status) && (
                        <details>
                          <summary className="min-h-11 cursor-pointer font-semibold">
                            Edit {a.title}
                          </summary>
                          <ActivityForm
                            key={a.revision}
                            activity={a}
                            teamId={a.teamId}
                            busy={busy || loading}
                            run={run}
                          />
                        </details>
                      )}
                    </article>
                  ))}
                {!workspace.activities.some(
                  (a) =>
                    visibleTeams.some((t) => t.id === a.teamId) &&
                    matches(a.title, a.location, a.date),
                ) && <p>No activities match this view.</p>}
              </section>
            )}
            {tab === "evaluations" && (
              <section className={card}>
                <h2 className="text-2xl">Evaluation Ratings & Review</h2>
                <p>
                  Record skill ratings and recommendations. Existing narrative, readiness, and
                  workload notes are withheld.
                </p>
                <details className="rounded border border-line p-4">
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    Create evaluation
                  </summary>
                  <EvaluationForm
                    key={`new-${workspace.evaluations.length}`}
                    workspace={workspace}
                    busy={busy || loading}
                    run={run}
                  />
                </details>
                {workspace.evaluations
                  .filter(
                    (e) =>
                      (!sport || e.sport === sport) &&
                      (!selected || e.teamId === selected.id) &&
                      matches(e.playerName, e.evaluatorName, e.ageGroup),
                  )
                  .map((e) => (
                    <article key={e.id} className="grid gap-2 rounded border border-line p-4">
                      <h3 className="text-xl">{e.playerName}</h3>
                      <p>
                        {e.evaluationDate} · {e.sport} · {e.ageGroup} · {e.status}
                      </p>
                      <p>
                        Evaluator: {e.evaluatorName} · {e.reviewed ? "Reviewed" : "Awaiting review"}
                      </p>
                      <details>
                        <summary className="min-h-11 cursor-pointer font-semibold">
                          Edit evaluation for {e.playerName}
                        </summary>
                        <EvaluationForm
                          key={e.revision}
                          evaluation={e}
                          workspace={workspace}
                          busy={busy || loading}
                          run={run}
                        />
                      </details>
                      {!e.reviewed && e.status === "submitted" && (
                        <Button
                          className="justify-self-start"
                          variant="outlineDark"
                          disabled={busy || loading}
                          onClick={() =>
                            void run(
                              () =>
                                api.reviewOrganizationEvaluation({
                                  data: { id: e.id, revision: e.revision },
                                }),
                              "Evaluation marked reviewed.",
                            )
                          }
                        >
                          Mark Reviewed
                        </Button>
                      )}
                    </article>
                  ))}
                {!workspace.evaluations.some(
                  (e) =>
                    (!sport || e.sport === sport) &&
                    (!selected || e.teamId === selected.id) &&
                    matches(e.playerName, e.evaluatorName, e.ageGroup),
                ) && <p>No evaluations match this view.</p>}
              </section>
            )}
            {tab === "messages" && (
              <section className={card}>
                <h2 className="text-2xl">Send Team Message</h2>
                {!selected || selected.closed ? (
                  <p>Select an active team above to send a message.</p>
                ) : (
                  <>
                    <p>
                      Recipients: authenticated members of {selected.name}. Existing shared message
                      history is withheld.
                    </p>
                    <Form
                      key={`${selected.id}-${workspace.revision}-${notice}`}
                      busy={busy || loading}
                      label="Preview & Confirm Message"
                      onSave={(f) => {
                        const body = value(f, "body");
                        if (window.confirm(`Post this message to ${selected.name}?\n\n${body}`))
                          void run(
                            () =>
                              api.sendOrganizationMessage({
                                data: {
                                  id: crypto.randomUUID(),
                                  teamId: selected.id,
                                  confirmedTeamId: selected.id,
                                  body,
                                },
                              }),
                            "Message posted to the selected team conversation.",
                          );
                      }}
                    >
                      <label>
                        Message
                        <textarea
                          name="body"
                          className={field}
                          rows={6}
                          required
                          maxLength={3000}
                        />
                      </label>
                      <p>
                        Keep this message operational. Do not include financial, medical, or private
                        family information.
                      </p>
                    </Form>
                  </>
                )}
              </section>
            )}
            {tab === "drafts" && (
              <section className={card}>
                <h2 className="text-2xl">My Operational Website Drafts</h2>
                {!(selected?.sport || sport) ? (
                  <p>
                    Choose baseball or softball, or select a team, to manage announcement drafts.
                  </p>
                ) : (
                  <OrganizationDrafts
                    key={`${selected?.sport || sport}-${selected?.id || ""}`}
                    sport={(selected?.sport || sport) as "baseball" | "softball"}
                    teamId={selected?.id || ""}
                    teamName={selected?.name || ""}
                    onSaved={() => setDirty(false)}
                  />
                )}
              </section>
            )}
            {tab === "activity" && (
              <OrganizationActivity
                sport={sport}
                teamId={selected?.id || ""}
                teams={workspace.teams}
              />
            )}
            {tab === "results" && (
              <OrganizationGameResults
                onSaved={async () => {
                  setDirty(false);
                  await refresh();
                }}
              />
            )}
            {tab === "tournaments" && <OrganizationTournamentFinder onSaved={refresh} />}
            {tab === "catalog" && <OrganizationCatalog onSaved={refresh} />}
            {tab === "development" && <OrganizationDevelopment onSaved={refresh} />}
            {tab === "cages" && <CageAvailability />}
            {tab === "tryouts" && <TryoutEventEditor />}
            {tab === "lessons" && (
              <>
                <LessonAssignments />
                <OrganizationLessonCompletion />
              </>
            )}
            {tab === "directory" && <OrganizationPeople />}
            {tab === "content" && <OrganizationContent />}
            {tab === "bookings" && (
              <>
                <OrganizationBookings />
                <OrganizationEvents />
              </>
            )}
            {tab === "resources" && <FacilityResources />}
            {tab === "reports" && <OperationalReports />}
          </>
        )}
      </div>
    </main>
  );
}

function TeamForm({
  team,
  revision,
  busy,
  run,
}: {
  team?: Team;
  revision: number;
  busy: boolean;
  run: Run;
}) {
  return (
    <Form
      busy={busy}
      label={team ? "Save Team" : "Create Team"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationTeam({
              data: {
                revision,
                teamId: team?.id || crypto.randomUUID(),
                changes: {
                  name: value(f, "name"),
                  sport: value(f, "sport") as "baseball" | "softball",
                  age: value(f, "age"),
                  level: value(f, "level"),
                  seasonLabel: value(f, "seasonLabel"),
                  seasonStart: value(f, "seasonStart"),
                  seasonEnd: value(f, "seasonEnd"),
                  headCoach: value(f, "headCoach"),
                  coachEmail: value(f, "coachEmail"),
                  closed: f.has("closed"),
                },
              },
            }),
          team ? "Team changes saved." : "Team created.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Team name" initial={team?.name} required maxLength={140} />
        <Select name="sport" label="Sport" initial={team?.sport || "softball"}>
          <option value="softball">Softball</option>
          <option value="baseball">Baseball</option>
        </Select>
        <Input name="age" label="Age division" initial={team?.age} required maxLength={40} />
        <Input name="level" label="Level" initial={team?.level} maxLength={60} />
        <Input
          name="seasonLabel"
          label="Season label"
          initial={team?.seasonLabel}
          maxLength={100}
        />
        <Input name="seasonStart" label="Season starts" initial={team?.seasonStart} type="date" />
        <Input name="seasonEnd" label="Season ends" initial={team?.seasonEnd} type="date" />
        <Input name="headCoach" label="Head coach name" initial={team?.headCoach} maxLength={120} />
        <Input
          name="coachEmail"
          label="Head coach email"
          initial={team?.coachEmail}
          type="email"
          maxLength={254}
        />
      </div>
      {team && <Check name="closed" label="Mark team closed" checked={team.closed} />}
    </Form>
  );
}

function PlayerForm({
  team,
  player,
  revision,
  busy,
  run,
}: {
  team: Team;
  player?: Player;
  revision: number;
  busy: boolean;
  run: Run;
}) {
  const [guardians, setGuardians] = useState(() =>
    (player?.parents.length ? player.parents : [{ name: "", rel: "", email: "", phone: "" }]).map(
      (g, i) => ({ ...g, key: i }),
    ),
  );
  const [nextKey, setNextKey] = useState(guardians.length);
  return (
    <Form
      busy={busy}
      label={player ? "Save Player" : "Add Player"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationPlayer({
              data: {
                revision,
                teamId: team.id,
                playerId: player?.id || crypto.randomUUID(),
                changes: {
                  name: value(f, "name"),
                  number: value(f, "number"),
                  positions: value(f, "positions")
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean),
                  bats: value(f, "bats") as OrganizationPlayerInput["changes"]["bats"],
                  throws: value(f, "throws") as OrganizationPlayerInput["changes"]["throws"],
                  gradYear: value(f, "gradYear"),
                  school: value(f, "school"),
                  email: value(f, "email"),
                  withdrawn: f.has("withdrawn"),
                  parents: guardians.map((g) => ({
                    name: value(f, `guardian-${g.key}-name`),
                    rel: value(f, `guardian-${g.key}-rel`),
                    email: value(f, `guardian-${g.key}-email`),
                    phone: value(f, `guardian-${g.key}-phone`),
                  })),
                  docs: {
                    waiver: f.has("waiver"),
                    birthCert: f.has("birthCert"),
                    insurance: f.has("insurance"),
                    physical: f.has("physical"),
                  },
                },
              },
            }),
          player ? "Player and guardian contacts saved." : "Player added to this team.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Player name" initial={player?.name} required maxLength={120} />
        <Input name="number" label="Jersey number" initial={player?.number} maxLength={4} />
        <Input
          name="positions"
          label="Positions, separated by commas"
          initial={player?.positions.join(", ")}
        />
        <Select name="bats" label="Bats" initial={player?.bats}>
          <option value="">Not recorded</option>
          <option value="R">Right</option>
          <option value="L">Left</option>
          <option value="S">Switch</option>
        </Select>
        <Select name="throws" label="Throws" initial={player?.throws}>
          <option value="">Not recorded</option>
          <option value="R">Right</option>
          <option value="L">Left</option>
        </Select>
        <Input name="gradYear" label="Graduation year" initial={player?.gradYear} maxLength={4} />
        <Input name="school" label="School" initial={player?.school} maxLength={160} />
        <Input
          name="email"
          label="Player email (optional)"
          initial={player?.email}
          type="email"
          maxLength={254}
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="font-semibold">Guardian contacts</legend>
        <p>
          To remove a contact value, clear its field. Existing guardian rows stay linked to preserve
          the family record.
        </p>
        {guardians.map((g, i) => (
          <div key={g.key} className="grid gap-3 rounded border border-line p-3">
            <h4>Guardian {i + 1}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                name={`guardian-${g.key}-name`}
                label={`Guardian ${i + 1} name`}
                initial={g.name}
                maxLength={120}
              />
              <Input
                name={`guardian-${g.key}-rel`}
                label={`Guardian ${i + 1} relationship`}
                initial={g.rel}
                maxLength={60}
              />
              <Input
                name={`guardian-${g.key}-email`}
                label={`Guardian ${i + 1} email`}
                initial={g.email}
                type="email"
                maxLength={254}
              />
              <Input
                name={`guardian-${g.key}-phone`}
                label={`Guardian ${i + 1} phone`}
                initial={g.phone}
                type="tel"
                maxLength={40}
              />
            </div>
          </div>
        ))}
        <Button
          variant="outlineDark"
          disabled={guardians.length >= 10}
          className="justify-self-start"
          onClick={() => {
            setGuardians((all) => [
              ...all,
              { key: nextKey, name: "", rel: "", email: "", phone: "" },
            ]);
            setNextKey((key) => key + 1);
          }}
        >
          Add Guardian Contact
        </Button>
      </fieldset>
      <fieldset>
        <legend className="font-semibold">Document receipt checklist</legend>
        <p>
          Receipt tracking only. These checks do not create signatures or grant public roster
          consent.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check name="waiver" label="Waiver received" checked={player?.docs.waiver} />
          <Check
            name="birthCert"
            label="Birth certificate received"
            checked={player?.docs.birthCert}
          />
          <Check
            name="insurance"
            label="Insurance document received"
            checked={player?.docs.insurance}
          />
          <Check
            name="physical"
            label="Physical document received"
            checked={player?.docs.physical}
          />
        </div>
      </fieldset>
      {player && (
        <Check name="withdrawn" label="Mark player withdrawn" checked={player.withdrawn} />
      )}
    </Form>
  );
}

function StaffForm({
  teamId,
  staff,
  revision,
  busy,
  run,
}: {
  teamId: string;
  staff?: Staff;
  revision: number;
  busy: boolean;
  run: Run;
}) {
  return (
    <Form
      busy={busy}
      label={staff ? "Save Staff Contact" : "Add Staff Contact"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationStaff({
              data: {
                revision,
                teamId,
                staffId: staff?.id || crypto.randomUUID(),
                changes: {
                  name: value(f, "name"),
                  ...(value(f, "role")
                    ? { role: value(f, "role") as OrganizationStaffInput["changes"]["role"] }
                    : {}),
                  email: value(f, "email"),
                  backgroundCheck: f.has("backgroundCheck"),
                  safeSport: f.has("safeSport"),
                  expires: value(f, "expires"),
                },
              },
            }),
          "Staff contact saved.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Staff name" initial={staff?.name} required maxLength={120} />
        <Select
          name="role"
          label="Team position or title"
          initial={
            staff &&
            !["Head coach", "Assistant coach", "Team manager", "Volunteer"].includes(staff.role)
              ? ""
              : staff?.role || "Assistant coach"
          }
        >
          {staff &&
            !["Head coach", "Assistant coach", "Team manager", "Volunteer"].includes(
              staff.role,
            ) && <option value="">Keep current title: {staff.role || "not recorded"}</option>}
          {["Head coach", "Assistant coach", "Team manager", "Volunteer"].map((role) => (
            <option key={role}>{role}</option>
          ))}
        </Select>
        <Input
          name="email"
          label="Staff email"
          initial={staff?.email}
          type="email"
          maxLength={254}
        />
        <Input name="expires" label="Compliance expires" initial={staff?.expires} type="date" />
      </div>
      <Check
        name="backgroundCheck"
        label="Background check recorded"
        checked={staff?.backgroundCheck}
      />
      <Check name="safeSport" label="SafeSport recorded" checked={staff?.safeSport} />
    </Form>
  );
}

function RegistrationForm({
  registration: r,
  workspace,
  busy,
  run,
}: {
  registration?: Workspace["registrations"][number];
  workspace: Workspace;
  busy: boolean;
  run: Run;
}) {
  return (
    <Form
      busy={busy}
      label={r ? "Save Registration" : "Add Registration"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationRegistration({
              data: {
                id: r?.id || crypto.randomUUID(),
                revision: r?.revision || 0,
                workRevision: r?.workRevision || 0,
                changes: {
                  kind: value(f, "kind") as "tryout" | "team-inquiry",
                  player: value(f, "player"),
                  parent: value(f, "parent"),
                  email: value(f, "email"),
                  phone: value(f, "phone"),
                  age: value(f, "age"),
                  sport: value(f, "sport") as "baseball" | "softball",
                  season: value(f, "season"),
                  positions: value(f, "positions"),
                  preferredTeamId: value(f, "preferredTeamId"),
                  status: value(f, "status") as "open" | "accepted" | "declined" | "closed",
                },
                workflow: {
                  teamId: value(f, "teamId"),
                  assigneeId: value(f, "assigneeId"),
                  status: value(f, "followUp") as NonNullable<
                    OrganizationRegistrationInput["workflow"]
                  >["status"],
                  followUpDate: value(f, "followUpDate"),
                },
              },
            }),
          "Registration and follow-up saved.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="kind" label="Registration type" initial={r?.kind || "tryout"}>
          <option value="tryout">Tryout</option>
          <option value="team-inquiry">Team inquiry</option>
        </Select>
        <Input name="player" label="Player name" initial={r?.player} required maxLength={160} />
        <Input name="parent" label="Guardian name" initial={r?.parent} />
        <Input
          name="email"
          label="Guardian email"
          initial={r?.email}
          type="email"
          maxLength={254}
        />
        <Input name="phone" label="Guardian phone" initial={r?.phone} type="tel" maxLength={40} />
        <Input name="age" label="Age division" initial={r?.age} />
        <Select name="sport" label="Registration sport" initial={r?.sport || ""} required>
          <option value="">Choose sport</option>
          <option value="baseball">Baseball</option>
          <option value="softball">Softball</option>
        </Select>
        <Input name="season" label="Season" initial={r?.season} />
        <Input name="positions" label="Positions" initial={r?.positions} />
        <Select name="preferredTeamId" label="Preferred team" initial={r?.preferredTeamId}>
          <option value="">No preference</option>
          {workspace.teams
            .filter((t) => !t.closed)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.sport})
              </option>
            ))}
        </Select>
        <Select name="status" label="Intake status" initial={r?.status || "open"}>
          {["open", "accepted", "declined", "closed"].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </Select>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="font-semibold">Follow-up assignment</legend>
        <Select name="teamId" label="Follow-up team" initial={r?.workflow.teamId}>
          <option value="">Unassigned</option>
          {workspace.teams
            .filter((t) => !t.closed)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.sport})
              </option>
            ))}
        </Select>
        <Select name="assigneeId" label="Assigned staff" initial={r?.workflow.assigneeId}>
          <option value="">Unassigned</option>
          {r?.workflow.assigneeId &&
            !workspace.staff.some((s) => s.id === r.workflow.assigneeId) && (
              <option value={r.workflow.assigneeId}>Current inactive assignee (preserved)</option>
            )}
          {workspace.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.email})
            </option>
          ))}
        </Select>
        <Select name="followUp" label="Follow-up status" initial={r?.workflow.status || "new"}>
          {TRYOUT_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </Select>
        <Input
          name="followUpDate"
          label="Follow-up date"
          initial={r?.workflow.followUpDate}
          type="date"
        />
      </fieldset>
    </Form>
  );
}

function ActivityForm({
  activity: a,
  teamId,
  busy,
  run,
}: {
  activity?: Workspace["activities"][number];
  teamId: string;
  busy: boolean;
  run: Run;
}) {
  return (
    <Form
      busy={busy}
      label={a ? "Save Activity" : "Create Activity"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationActivity({
              data: {
                id: a?.id || crypto.randomUUID(),
                teamId,
                revision: a?.revision || 0,
                kind: value(f, "kind") as OrganizationActivityInput["kind"],
                title: value(f, "title"),
                date: value(f, "date"),
                startTime: value(f, "startTime"),
                endTime: value(f, "endTime"),
                location: value(f, "location"),
                status: value(f, "status") as OrganizationActivityInput["status"],
                laneIds: f.getAll("laneIds") as OrganizationActivityInput["laneIds"],
              },
            }),
          "Team activity saved.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="title" label="Activity title" initial={a?.title} required maxLength={140} />
        <Select name="kind" label="Activity type" initial={a?.kind || "practice"}>
          {["practice", "game", "tournament"].map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
        </Select>
        <Input name="date" label="Date" initial={a?.date} type="date" required />
        <Input
          name="startTime"
          label="Start time (Central)"
          initial={a?.startTime}
          type="time"
          required
        />
        <Input
          name="endTime"
          label="End time (Central)"
          initial={a?.endTime}
          type="time"
          required
        />
        <Input name="location" label="Location" initial={a?.location} required maxLength={240} />
        <Select name="status" label="Activity status" initial={a?.status || "scheduled"}>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      <fieldset>
        <legend className="font-semibold">Practice cages (optional)</legend>
        <p>
          Select cages only for practices. Remove all selections to release a reservation. Conflicts
          reject the change.
        </p>
        <div className="flex flex-wrap gap-4">
          {["1", "2", "3-4", "5", "6", "7"].map((lane) => (
            <label key={lane} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="laneIds"
                value={lane}
                defaultChecked={a?.laneIds.includes(lane)}
              />
              Cage {lane}
            </label>
          ))}
        </div>
      </fieldset>
    </Form>
  );
}

function EvaluationForm({
  evaluation: e,
  workspace,
  busy,
  run,
}: {
  evaluation?: Workspace["evaluations"][number];
  workspace: Workspace;
  busy: boolean;
  run: Run;
}) {
  return (
    <Form
      busy={busy}
      label={e ? "Save Evaluation" : "Create Evaluation"}
      onSave={(f) =>
        void run(
          () =>
            api.saveOrganizationEvaluation({
              data: {
                id: e?.id || crypto.randomUUID(),
                revision: e?.revision || 0,
                registrationId: e ? e.registrationId : value(f, "registrationId") || null,
                teamId: e ? e.teamId : value(f, "teamId"),
                playerName: value(f, "playerName"),
                ageGroup: value(f, "ageGroup"),
                sport: value(f, "sport") as OrganizationEvaluationInput["sport"],
                evaluationDate: value(f, "evaluationDate"),
                status: value(f, "status") as OrganizationEvaluationInput["status"],
                recommendation: value(
                  f,
                  "recommendation",
                ) as OrganizationEvaluationInput["recommendation"],
                ratings: {
                  contact: Number(f.get("rating-contact")) || null,
                  approach: Number(f.get("rating-approach")) || null,
                  fielding: Number(f.get("rating-fielding")) || null,
                  throwing: Number(f.get("rating-throwing")) || null,
                  movement: Number(f.get("rating-movement")) || null,
                  knowledge: Number(f.get("rating-knowledge")) || null,
                  coachability: Number(f.get("rating-coachability")) || null,
                },
              },
            }),
          "Evaluation ratings saved.",
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="playerName"
          label="Player name"
          initial={e?.playerName}
          required
          maxLength={120}
        />
        <Input name="ageGroup" label="Age group" initial={e?.ageGroup} />
        <Select name="sport" label="Evaluation sport" initial={e?.sport || "baseball"}>
          <option value="baseball">Baseball</option>
          <option value="softball">Softball</option>
        </Select>
        <Input
          name="evaluationDate"
          label="Evaluation date"
          initial={e?.evaluationDate}
          type="date"
          required
        />
        <Select
          name="registrationId"
          label="Linked registration"
          initial={e?.registrationId}
          disabled={!!e}
        >
          <option value="">No linked registration</option>
          {workspace.registrations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.player} · {r.age} · {r.sport}
            </option>
          ))}
        </Select>
        <Select name="teamId" label="Evaluation team" initial={e?.teamId} disabled={!!e}>
          <option value="">No team selected</option>
          {workspace.teams
            .filter((t) => !t.closed)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.sport})
              </option>
            ))}
        </Select>
        <Select name="status" label="Evaluation status" initial={e?.status || "draft"}>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </Select>
        <Select
          name="recommendation"
          label="Recommendation"
          initial={e?.recommendation || "undecided"}
        >
          {Object.entries(RECOMMENDATIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="font-semibold">Skill ratings</legend>
        {EVALUATION_SKILLS.map((skill) => (
          <Select
            key={skill.key}
            name={`rating-${skill.key}`}
            label={skill.label}
            initial={String(e?.ratings[skill.key] || "")}
          >
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((score) => (
              <option key={score} value={score}>
                {score} / 5
              </option>
            ))}
          </Select>
        ))}
      </fieldset>
    </Form>
  );
}

function CageAvailability() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getOrganizationOccupancy>>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  return (
    <section className={card}>
      <h2 className="text-2xl">Shared Cage Availability</h2>
      <p>
        Check occupied five-minute slots in Central time. Availability is checked again when a
        practice reservation is saved.
      </p>
      <Form
        busy={busy}
        label="View Occupied Times"
        onSave={async (f) => {
          setBusy(true);
          setRows(undefined);
          setError("");
          const chosen = value(f, "date");
          setDate(chosen);
          try {
            setRows(await api.getOrganizationOccupancy({ data: chosen }));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load cage availability.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input name="date" label="Availability date" type="date" required />
      </Form>
      {error && <p role="alert">{error}</p>}
      {rows && (
        <>
          <h3 className="text-xl">Occupied slots for {date}</h3>
          {rows.length ? (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.resourceId + row.at}>
                  {row.resourceId.replace("lane:", "Cage ")} ·{" "}
                  {new Date(row.at).toLocaleTimeString("en-US", {
                    timeZone: "America/Chicago",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  Central
                </li>
              ))}
            </ul>
          ) : (
            <p>No occupied cage slots were returned for this date.</p>
          )}
        </>
      )}
    </section>
  );
}

function OperationalReports() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function download(kind: "rosters" | "registrations" | "schedules" | "evaluations") {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const report = await getOrganizationReport({ data: kind });
      const url = URL.createObjectURL(new Blob([report.body], { type: report.contentType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("CSV download started.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare this report.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className={card}>
      <h2 className="text-2xl">Nonfinancial Operational Reports</h2>
      <p>
        Download organization-wide CSV reports across both programs. These exports use selected
        operational fields and include private player or guardian information where needed. Store
        and share them securely.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["rosters", "Roster CSV"],
            ["registrations", "Registration CSV"],
            ["schedules", "Schedule CSV"],
            ["evaluations", "Evaluation CSV"],
          ] as const
        ).map(([kind, label]) => (
          <Button key={kind} disabled={!!busy} onClick={() => void download(kind)}>
            {busy === kind ? "Preparing…" : label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function FacilityResources() {
  const [resources, setResources] =
    useState<Awaited<ReturnType<typeof getOperationalServiceResources>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(async () => {
    setResources(await getOperationalServiceResources());
    setVersion((n) => n + 1);
  }, []);
  useEffect(() => {
    void refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Could not load facility resources."),
    );
  }, [refresh]);
  return (
    <section className={card}>
      <h2 className="text-2xl">Lesson Facility Resources</h2>
      <p>
        Assign physical cages required by each active lesson service. This controls the spaces
        checked for future bookings.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!resources && !error && <p role="status">Loading facility resources…</p>}
      {resources?.length === 0 && <p>No active lesson services.</p>}
      {resources?.map((resource) => (
        <article key={resource.id} className="grid gap-3 rounded border border-line p-4">
          <h3 className="text-xl">{resource.name}</h3>
          <Form
            key={version}
            busy={busy}
            label="Save Facility Spaces"
            onSave={async (f) => {
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await setServiceResources({
                  data: { id: resource.id, laneIds: f.getAll("lanes").map(String) },
                });
                setNotice("Facility spaces saved.");
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save facility spaces.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset>
              <legend>Select one or more cages</legend>
              <div className="flex flex-wrap gap-4">
                {["1", "2", "3-4", "5", "6", "7"].map((lane) => (
                  <label key={lane} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name="lanes"
                      value={lane}
                      defaultChecked={resource.lane_ids.includes(lane)}
                    />
                    Cage {lane}
                  </label>
                ))}
              </div>
            </fieldset>
          </Form>
        </article>
      ))}
    </section>
  );
}

function RecruitingEmailForm({
  registration,
  busy,
  run,
}: {
  registration: Workspace["registrations"][number];
  busy: boolean;
  run: Run;
}) {
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <Form
      key={version}
      busy={busy}
      label="Preview & Confirm Guardian Email"
      onSave={(f) => {
        const subject = value(f, "subject"),
          body = value(f, "body");
        if (
          !window.confirm(
            `Email ${registration.parent || "the guardian"} at ${registration.email} about ${registration.player || "this registration"}?\n\nSubject: ${subject}\n\n${body}`,
          )
        )
          return;
        const signature = JSON.stringify([registration.id, registration.email, subject, body]);
        if (attempt.current?.signature !== signature)
          attempt.current = { signature, id: crypto.randomUUID() };
        const id = attempt.current.id;
        let delivery = "queued";
        void run(
          async () => {
            const result = await sendOrganizationRecruitingEmail({
              data: {
                id,
                requestId: registration.id,
                subject,
                body,
                confirmedEmail: registration.email,
              },
            });
            delivery = result.delivery;
            if (["queued", "sent"].includes(delivery)) {
              attempt.current = null;
              setVersion((n) => n + 1);
            }
          },
          () =>
            ({
              queued:
                "Recruiting email queued. Delivery is handled by the notification service and is not yet confirmed.",
              sent: "The email provider accepted this recruiting email. Inbox delivery is not confirmed.",
              review: "This email needs owner review before delivery.",
              skipped:
                "This email attempt was skipped. Review the registration and your access before trying again.",
              superseded:
                "This email attempt was superseded. Review the current registration before sending a new message.",
            })[delivery] || "Email request recorded. Delivery has not been confirmed.",
        );
      }}
    >
      <p className="break-words">
        Recipient: {registration.parent || "Guardian"} · {registration.email}. The server checks
        that this address still belongs to this registration.
      </p>
      <Input name="subject" label="Email subject" required maxLength={160} />
      <label>
        Guardian email message
        <textarea name="body" className={field} rows={6} required maxLength={3000} />
      </label>
      <p>
        Use this for recruiting follow-up. Keep financial, medical, and other private family details
        out of the message.
      </p>
    </Form>
  );
}

function OrganizationDrafts({
  sport,
  teamId,
  teamName,
  onSaved,
}: {
  sport: "baseball" | "softball";
  teamId: string;
  teamName: string;
  onSaved: () => void;
}) {
  const [page, setPage] = useState<Awaited<ReturnType<typeof getOrganizationDrafts>>>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPage(await getOrganizationDrafts({ data: { sport, teamId } }));
    } catch (e) {
      setPage(undefined);
      setError(e instanceof Error ? e.message : "Could not load your drafts.");
    } finally {
      setLoading(false);
    }
  }, [sport, teamId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(f: FormData, draft?: NonNullable<typeof page>["items"][number]) {
    setBusy(true);
    setError("");
    setNotice("");
    const submit = f.has("submit");
    try {
      await saveOrganizationDraft({
        data: {
          id: draft?.id || crypto.randomUUID(),
          revision: draft?.revision || 0,
          sport,
          teamId,
          title: value(f, "title"),
          body: value(f, "body"),
          submit,
        },
      });
      setNotice(
        submit
          ? "Draft submitted for owner review. It has not been published."
          : "Operational draft saved.",
      );
      setVersion((n) => n + 1);
      onSaved();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this draft.");
    } finally {
      setBusy(false);
    }
  }
  const fields = (draft?: NonNullable<typeof page>["items"][number]) => (
    <>
      <Input name="title" label="Draft title" initial={draft?.title} required maxLength={140} />
      <label>
        Announcement draft
        <textarea
          name="body"
          className={field}
          defaultValue={draft?.body || ""}
          rows={6}
          required
          maxLength={3000}
        />
      </label>
      <Check name="submit" label="Submit for owner review" />
      <p>
        Write an operational announcement only. Public player names and photos require publication
        consent and owner review.
      </p>
    </>
  );
  return (
    <>
      <p>
        Scope: {teamName || `${sport} program-wide`}. Only your classified operational drafts are
        available here. Submission requests review; it does not publish the announcement.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading your operational drafts…</p>}
      <Button
        variant="outlineDark"
        disabled={busy || loading}
        className="justify-self-start"
        onClick={() => {
          if (window.confirm("Refresh your draft list? Unsaved draft edits will be discarded.")) {
            setVersion((n) => n + 1);
            onSaved();
            void refresh();
          }
        }}
      >
        Refresh My Drafts
      </Button>
      {page && (
        <>
          {page.withheldCount > 0 && (
            <p>
              {page.withheldCount} existing draft{page.withheldCount === 1 ? " is" : "s are"}{" "}
              withheld because the content has not been classified for operational access. Ask an
              owner to review it.
            </p>
          )}
          <details className="rounded border border-line p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Create operational draft
            </summary>
            <Form
              key={`new-${version}`}
              busy={busy || loading}
              label="Save Operational Draft"
              onSave={(f) => void save(f)}
            >
              {fields()}
            </Form>
          </details>
          {page.items.map((draft) => (
            <article key={draft.id} className="grid gap-3 rounded border border-line p-4">
              <h3 className="text-xl">{draft.title}</h3>
              <p>Status: {draft.status}</p>
              <p className="whitespace-pre-wrap break-words">{draft.body}</p>
              {draft.status === "draft" ? (
                <details>
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    Edit draft: {draft.title}
                  </summary>
                  <Form
                    key={`${draft.revision}-${version}`}
                    busy={busy || loading}
                    label="Save Draft Changes"
                    onSave={(f) => void save(f, draft)}
                  >
                    {fields(draft)}
                  </Form>
                </details>
              ) : (
                <p>
                  This submitted draft is read-only while its owner review is pending or complete.
                </p>
              )}
            </article>
          ))}
          {!page.items.length && <p>No classified operational drafts in this scope.</p>}
        </>
      )}
    </>
  );
}

function OrganizationActivity({
  sport,
  teamId,
  teams,
}: {
  sport: string;
  teamId: string;
  teams: Team[];
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getOrganizationOwnActivity>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await getOrganizationOwnActivity());
    } catch (e) {
      setRows(undefined);
      setError(e instanceof Error ? e.message : "Could not load your activity.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const visible = rows?.filter(
    (row) => (!sport || row.sport === sport) && (!teamId || row.teamId === teamId),
  );
  return (
    <section className={card}>
      <h2 className="text-2xl">My Operational Activity</h2>
      <p>
        Your 100 most recent operational actions, filtered to the selected scope. Message bodies,
        document contents, and financial events are withheld.
      </p>
      <Button
        variant="outlineDark"
        className="justify-self-start"
        disabled={loading}
        onClick={() => void refresh()}
      >
        Refresh My Activity
      </Button>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading your operational activity…</p>}
      {visible && !loading && (
        <>
          {!visible.length && <p>No operational activity matches this scope.</p>}
          <ul className="grid gap-3">
            {visible.map((row, index) => (
              <li
                key={`${row.createdAt}-${row.action}-${index}`}
                className="rounded border border-line p-3"
              >
                <p>
                  {new Date(row.createdAt).toLocaleString()} · {row.action} · {row.result}
                </p>
                {row.teamId && (
                  <p>Team: {teams.find((team) => team.id === row.teamId)?.name || row.teamId}</p>
                )}
                {row.targetId && <p className="break-words">Record: {row.targetId}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
