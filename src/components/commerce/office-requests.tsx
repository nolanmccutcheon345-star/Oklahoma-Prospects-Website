import { getRequestWork, saveRequestWork } from "@/lib/front-office-api";
import { useEffect, useState, type FormEvent } from "react";
import { getOfficeRequests } from "@/lib/portal-api";
import { getPublicTryoutTeams } from "@/lib/tryout-events-api";
import { getTeamsClub, reviewTeamInquiry } from "@/lib/teams/store";
import { chicagoDate, validDate } from "@/lib/scheduling";
import type { PublicTryoutTeam } from "@/lib/tryout-preferences.server";
import { Button } from "@/components/ui/button";

type OfficeRequest = Awaited<ReturnType<typeof getOfficeRequests>>[number];
type TeamChoice = {
  id: string;
  name: string;
  sport: string;
  age: string;
  closed: boolean;
  seasonEnd: string;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function RequestStageForm({
  request,
  teams,
  publicTeams,
  onComplete,
  onError,
}: {
  request: OfficeRequest;
  teams: TeamChoice[];
  publicTeams: PublicTryoutTeam[];
  onComplete: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [teamId, setTeamId] = useState(String(request.payload.teamId || ""));
  const [stage, setStage] = useState<
    "registered" | "evaluated" | "offer" | "waitlist" | "accepted"
  >(
    (["registered", "evaluated", "offer", "waitlist", "accepted"].includes(
      String(request.payload.stage),
    )
      ? request.payload.stage
      : "registered") as "registered" | "evaluated" | "offer" | "waitlist" | "accepted",
  );
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const sport = String(request.payload.sport ?? "");
  const age = String(request.payload.age ?? "");
  const preferredTeamId = String(request.payload.preferredTeamId ?? "");
  const preferredCoachId = String(request.payload.preferredCoachId ?? "");
  const eligible = teams.filter(
    (team) =>
      !team.closed &&
      validDate(team.seasonEnd) &&
      team.seasonEnd >= chicagoDate() &&
      same(team.sport, sport) &&
      same(team.age, age),
  );
  const preferredTeamName = teams.find((t) => t.id === preferredTeamId)?.name;
  const preferredCoachName = publicTeams
    .flatMap((t) => t.coaches)
    .find((coach) => coach.id === preferredCoachId)?.name;
  const differentTeam = Boolean(preferredTeamId && teamId && teamId !== preferredTeamId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !teamId || (differentTeam && !acknowledge)) return;
    setBusy(true);
    onError("");
    try {
      const result = await reviewTeamInquiry({
        data: { id: request.id, teamId, stage, acknowledgePreferenceOverride: acknowledge },
      });
      await onComplete(result.message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update the registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 grid gap-3 rounded-xl border border-line p-3" onSubmit={save}>
      <p className="font-semibold">
        Team placement · {sport || "Sport not recorded"} · {age || "Age not recorded"}
      </p>
      {preferredTeamId || preferredCoachId ? (
        <p className="text-sm">
          Family preference:{" "}
          {preferredTeamName ||
            (preferredTeamId
              ? "Previously selected team (no longer listed)"
              : "No team preference")}
          {preferredCoachId
            ? ` · Coach: ${preferredCoachName || "Previously selected coach (no longer listed)"}`
            : ""}
          . This is a preference, not a guaranteed placement.
        </p>
      ) : (
        <p className="text-sm text-muted">No specific team or coach preference requested.</p>
      )}
      <label className="grid gap-1 text-sm font-semibold">
        Matching teams
        <select
          required
          name="team"
          className="min-h-11 rounded-lg border border-line bg-paper px-3"
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setAcknowledge(false);
          }}
        >
          <option value="">Choose a matching team</option>
          {eligible.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} · {team.age}
            </option>
          ))}
        </select>
      </label>
      {eligible.length === 0 ? (
        <p role="status" className="text-sm text-maroon">
          No active team matches this request's sport and age. Update the team records or review the
          registration before placing this player.
        </p>
      ) : null}
      {differentTeam ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={acknowledge}
            onChange={(e) => setAcknowledge(e.target.checked)}
          />
          <span>
            I reviewed the family's preferred team and explicitly approve a different eligible team
            assignment.
          </span>
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-semibold">
        Tryout status
        <select
          name="stage"
          className="min-h-11 rounded-lg border border-line bg-paper px-3"
          value={stage}
          onChange={(e) => setStage(e.target.value as typeof stage)}
        >
          <option value="registered">Request received</option>
          <option value="evaluated">Evaluated</option>
          <option value="offer">Offer</option>
          <option value="waitlist">Waitlist</option>
          <option value="accepted">Accepted — add to roster and create guardian invitation</option>
        </select>
      </label>
      <Button type="submit" disabled={busy || !teamId || (differentTeam && !acknowledge)}>
        {busy ? "Saving…" : "Save status"}
      </Button>
    </form>
  );
}

export function OfficeRequests() {
  const [rows, setRows] = useState<OfficeRequest[]>([]);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [publicTeams, setPublicTeams] = useState<PublicTryoutTeam[]>([]);
  const [work, setWork] = useState<Awaited<ReturnType<typeof getRequestWork>>>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""),
    [sport, setSport] = useState(""),
    [age, setAge] = useState(""),
    [season, setSeason] = useState(""),
    [status, setStatus] = useState("open"),
    [assignee, setAssignee] = useState("");
  const [limit, setLimit] = useState(20);
  async function load() {
    const [requests, club, listed, tracking] = await Promise.all([
      getOfficeRequests(),
      getTeamsClub(),
      getPublicTryoutTeams(),
      getRequestWork(),
    ]);
    setRows(requests);
    setWork(tracking);
    setTeams(
      club.ok
        ? club.club.teams.map((team) => ({
            id: team.id,
            name: team.name,
            sport: team.sport,
            age: team.age,
            closed: team.closed,
            seasonEnd: team.seasonEnd,
          }))
        : [],
    );
    setPublicTeams(listed);
    setLoading(false);
  }
  useEffect(() => {
    void load().catch((e) => {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Could not load requests.");
    });
  }, []);
  const tracking = (r: OfficeRequest) => work?.work.find((w) => w.request_id === r.id);
  const state = (r: OfficeRequest) =>
    ["resolved", "accepted"].includes(r.status) ? "closed" : tracking(r)?.follow_up || "new";
  const visible = rows.filter((r) => {
    const p = r.payload,
      w = tracking(r),
      s = state(r);
    return (
      (!search ||
        [p.player, p.parent, p.name, p.email, p.notes, p.message].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(search.toLowerCase()),
        )) &&
      (!sport || same(String(p.sport || ""), sport)) &&
      (!age || p.age === age) &&
      (!season || p.season === season) &&
      (!status || (status === "open" ? s !== "closed" : s === status)) &&
      (!assignee || (assignee === "unassigned" ? !w?.assignee_id : w?.assignee_id === assignee))
    );
  });
  const filter = (
    label: string,
    value: string,
    set: (s: string) => void,
    choices: { value: string; label: string }[],
  ) => (
    <label className="grid min-w-0 gap-1 text-sm font-semibold">
      {label}
      <select
        className="office-control"
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setLimit(20);
        }}
      >
        <option value="">All</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
  const options = (key: string) =>
    [...new Set(rows.map((r) => String(r.payload[key] || "")).filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: value }));
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-3xl">Requests</h2>
        <p className="mt-1 text-sm text-muted">
          Follow up with families, review preferences, and record next steps. A request is not a
          confirmed appointment or roster spot.
        </p>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        Search requests
        <input
          type="search"
          className="office-control"
          placeholder="Player, parent, email or notes"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(20);
          }}
        />
      </label>
      <details className="rounded-xl border border-line bg-white p-3">
        <summary className="cursor-pointer min-h-11">
          Filters · {status === "open" ? "Unresolved" : status || "All statuses"}
        </summary>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filter("Sport", sport, setSport, options("sport"))}
          {filter("Age group", age, setAge, options("age"))}
          {filter("Season", season, setSeason, options("season"))}
          {filter("Status", status, setStatus, [
            { value: "open", label: "Unresolved" },
            { value: "new", label: "New" },
            { value: "contacted", label: "Contacted" },
            { value: "scheduled", label: "Scheduled" },
            { value: "closed", label: "Resolved" },
          ])}
          {filter("Assigned staff", assignee, setAssignee, [
            { value: "unassigned", label: "Unassigned" },
            ...(work?.staff || []).map((s) => ({ value: s.id, label: s.name })),
          ])}
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Loading requests…</p>
      ) : (
        <p className="text-sm text-muted">{visible.length} matching requests</p>
      )}
      {!loading && !error && !visible.length && (
        <p className="rounded-xl bg-white p-5">No requests match these filters.</p>
      )}
      {visible.slice(0, limit).map((request) => {
        const p = request.payload,
          w = tracking(request);
        const name = String(p.player || p.name || p.parent || "Request");
        const email = String(p.email || "");
        const duplicates = rows.filter(
          (r) =>
            r.id !== request.id &&
            request.kind === "tryout" &&
            r.kind === "tryout" &&
            ["email", "player", "sport", "age", "season"].every((key) =>
              same(String(r.payload[key] || ""), String(p[key] || "")),
            ),
        );
        const notes = work?.notes.filter((n) => n.request_id === request.id) || [];
        return (
          <article key={request.id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-2xl">{name}</h3>
              <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold capitalize">
                {state(request) === "closed" ? "Resolved" : state(request)}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold capitalize">
              {[p.sport, p.age, p.season].filter(Boolean).join(" · ") ||
                request.kind.replaceAll("-", " ")}
            </p>
            <p className="mt-1 text-sm">
              {String(
                p.session ||
                  (request.kind === "tryout"
                    ? "Individual evaluation requested"
                    : "Family inquiry"),
              )}
            </p>
            <p className="mt-2 text-xs text-muted">
              {work?.staff.find((s) => s.id === w?.assignee_id)?.name || "Unassigned"} · Received{" "}
              {new Date(request.created_at).toLocaleString("en-US", {
                timeZone: "America/Chicago",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              Central
            </p>
            {duplicates.length > 0 && (
              <p className="mt-2 text-sm text-maroon">
                Possible duplicate: {duplicates.length} similar request
                {duplicates.length === 1 ? "" : "s"}. Review before resolving; no records have been
                merged.
              </p>
            )}
            <details className="mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-3 font-semibold">
                View Request{" "}
                <span aria-hidden="true" className="ml-2">
                  ＋
                </span>
              </summary>
              <dl className="my-4 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Parent / guardian", p.parent || p.name],
                  ["Email", p.email],
                  ["Phone", p.phone],
                  ["Player notes", p.notes],
                  ["Message", p.message],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={String(label)} className="min-w-0 break-words">
                      <dt className="font-semibold">{String(label)}</dt>
                      <dd className="whitespace-pre-wrap">{String(value)}</dd>
                    </div>
                  ))}
              </dl>
              {work && (
                <RequestFollowUp
                  key={String(w?.updated_at || request.id)}
                  request={request}
                  work={work}
                  onSaved={async () => {
                    setNotice("Follow-up saved.");
                    await load();
                  }}
                />
              )}
              <details className="my-3">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Communication history ({notes.length})
                </summary>
                <p className="text-xs text-muted">
                  Staff-recorded notes. Opening an email or phone link does not record a sent
                  message.
                </p>
                {notes.map((n) => (
                  <div key={n.id} className="mt-2 rounded bg-paper p-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.note}</p>
                    <p className="mt-1 text-xs text-muted">
                      {n.name} ·{" "}
                      {new Date(n.created_at).toLocaleString("en-US", {
                        timeZone: "America/Chicago",
                      })}{" "}
                      Central
                    </p>
                  </div>
                ))}
                {!notes.length && <p className="text-sm">No contact notes recorded.</p>}
              </details>
              {["tryout", "team-inquiry"].includes(request.kind) && !p.rosterPlayerId ? (
                <RequestStageForm
                  request={request}
                  teams={teams}
                  publicTeams={publicTeams}
                  onError={setError}
                  onComplete={async (message) => {
                    setNotice(message);
                    await load();
                  }}
                />
              ) : null}
              {p.rosterPlayerId && (
                <p className="text-sm">
                  This request has a roster placement. Manage it in Teams & Players.
                </p>
              )}
              {["membership-pause", "refund-review"].includes(request.kind) && (
                <p className="text-sm">
                  Billing review required. Complete the provider outcome in Payments before
                  resolving this request.
                </p>
              )}
            </details>
            {email && (
              <a
                href={`mailto:${email}`}
                className="mt-3 mr-3 inline-flex min-h-11 items-center rounded-md bg-powder px-3 text-sm font-semibold"
              >
                Contact Family
              </a>
            )}
            {!!p.phone && (
              <a
                href={`tel:${String(p.phone).replace(/[^+\d]/g, "")}`}
                className="inline-flex min-h-11 items-center text-sm underline"
              >
                Call Family
              </a>
            )}
          </article>
        );
      })}
      {visible.length > limit && (
        <Button variant="outlineDark" onClick={() => setLimit((n) => n + 20)}>
          Load More
        </Button>
      )}
    </section>
  );
}
function RequestFollowUp({
  request,
  work,
  onSaved,
}: {
  request: OfficeRequest;
  work: Awaited<ReturnType<typeof getRequestWork>>;
  onSaved: () => Promise<void>;
}) {
  const row = work.work.find((w) => w.request_id === request.id);
  const [assignee, setAssignee] = useState(row?.assignee_id || ""),
    [status, setStatus] = useState(
      ["resolved", "accepted"].includes(request.status) ? "closed" : row?.follow_up || "new",
    ),
    [note, setNote] = useState(""),
    [noteId, setNoteId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await saveRequestWork({
            data: {
              id: request.id,
              assignee,
              status: status as "new" | "contacted" | "scheduled" | "closed",
              note,
              noteId,
            },
          });
          setNote("");
          setNoteId(crypto.randomUUID());
          await onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save follow-up.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4 className="font-semibold">Request follow-up</h4>
      <label className="grid gap-1 text-sm">
        Assigned staff
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="office-control"
        >
          <option value="">Unassigned</option>
          {work.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Request status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="office-control"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="scheduled">Scheduled</option>
          <option value="closed">Resolved</option>
        </select>
      </label>
      <p className="text-xs text-muted">
        Record Scheduled only after staff confirms an appointment with the family. This status does
        not book a session or assign a roster spot.
      </p>
      <label className="grid gap-1 text-sm">
        Contact note
        <textarea
          maxLength={3000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="office-control"
          placeholder="Record the conversation and next step"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button disabled={busy} type="submit">
        {busy ? "Saving…" : "Save Follow-up"}
      </Button>
    </form>
  );
}
