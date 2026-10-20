import { useEffect, useState } from "react";
import { RequestStageForm } from "./commerce/office-requests";
import { Button } from "./ui/button";
import { RegistrationDesk } from "./registration-desk";
import { TryoutEvaluations } from "./tryout-evaluations";
import { BOOKABLE_LANES } from "@/lib/club";
import { chicagoDate } from "@/lib/scheduling";
import {
  TRYOUT_STATUSES,
  type CenterWorkInput,
  type CenterAppointmentInput,
} from "@/lib/tryout-center-contracts";
import {
  getTryoutCenter,
  getTryoutDetail,
  saveTryoutWork,
  saveTryoutMessage,
  saveTryoutAppointment,
  saveTryoutPreferences,
  readTryoutNotice,
} from "@/lib/tryout-center-api";

type Workspace = Awaited<ReturnType<typeof getTryoutCenter>>;
type Registration = Workspace["registrations"][number];
const control =
  "mt-1 min-h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 py-2 text-base";
const label = (v: string) => v.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const stamp = (v: Date | string) =>
  new Date(v).toLocaleString("en-US", { timeZone: "America/Chicago" });
function Filter({
  name,
  value,
  set,
  options,
}: {
  name: string;
  value: string;
  set: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="min-w-0 text-sm font-semibold">
      {name}
      <select
        className={control}
        aria-label={name}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function TryoutCenter() {
  const [data, setData] = useState<Workspace>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [legacy, setLegacy] = useState(false),
    [readonly, setReadonly] = useState(false),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(""),
    [tab, setTab] = useState("registrations"),
    [view, setView] = useState("all");
  const [search, setSearch] = useState(""),
    [sport, setSport] = useState(""),
    [age, setAge] = useState(""),
    [season, setSeason] = useState(""),
    [team, setTeam] = useState(""),
    [coach, setCoach] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await getTryoutCenter());
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not load tryouts.";
      if (m.includes("Active coach")) setReadonly(true);
      else setError(m);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setSelected(new URLSearchParams(window.location.search).get("registration") || "");
    void refresh();
  }, []);
  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (readonly || legacy)
    return (
      <>
        <div className="p-4">
          {legacy && (
            <Button onClick={() => setLegacy(false)}>Back to Tryouts & Evaluations</Button>
          )}
        </div>
        <RegistrationDesk />
      </>
    );
  const w = (id: string) => data?.work.find((x) => x.request_id === id);
  const mine = (r: Registration) =>
    w(r.id)?.assignee_id === data?.userId ||
    data?.teams.some(
      (t) =>
        t.mine &&
        (t.id === (w(r.id)?.team_id || r.payload.preferredTeamId) ||
          (!w(r.id)?.team_id &&
            !r.payload.preferredTeamId &&
            t.sport === r.payload.sport?.toLowerCase() &&
            t.age.replace(/\s|U/gi, "") === r.payload.age?.replace(/\s|U/gi, ""))),
    );
  const rows =
    data?.registrations.filter(
      (r) =>
        (view === "all" || mine(r)) &&
        (!search ||
          Object.values(r.payload).join(" ").toLowerCase().includes(search.toLowerCase())) &&
        (!sport || r.payload.sport === sport) &&
        (!age || r.payload.age === age) &&
        (!season || r.payload.season === season) &&
        (!team || (w(r.id)?.team_id || r.payload.preferredTeamId) === team) &&
        (!coach || w(r.id)?.assignee_id === coach) &&
        (!status || (w(r.id)?.follow_up || "new") === status) &&
        (!date ||
          data.appointments.some(
            (a) =>
              a.request_id === r.id &&
              a.status !== "cancelled" &&
              chicagoDate(new Date(a.starts_at)) === date,
          )),
    ) ?? [];
  const options = (key: string) =>
    [...new Set(data?.registrations.map((r) => r.payload[key]).filter(Boolean))]
      .sort()
      .map((v) => ({ id: v, name: v }));
  const current = data?.registrations.find((r) => r.id === selected);
  return (
    <main id="main" className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 pb-28">
      <p className="text-sm font-semibold uppercase tracking-widest text-maroon">
        Oklahoma Prospects · Coaches portal
      </p>
      <h1 className="mt-2 text-3xl sm:text-5xl">Tryouts & Evaluations</h1>
      <p className="mt-3 text-muted">
        Meet the players. Connect with families. Plan their next step.
      </p>
      <div className="my-5 flex flex-wrap gap-2">
        <Button asChild variant="outlineDark">
          <a href="/coach">Coach App</a>
        </Button>
        {["registrations", "evaluations", "notifications", "preferences"].map((t) => (
          <Button
            key={t}
            variant={tab === t ? "primary" : "outlineDark"}
            onClick={() => {
              setTab(t);
              setSelected("");
            }}
          >
            {label(t)}
            {t === "notifications" && data
              ? ` (${data.notices.filter((n) => !n.read_at).length})`
              : ""}
          </Button>
        ))}
        {data?.owner && (
          <Button variant="outlineDark" onClick={() => setLegacy(true)}>
            Access & group events
          </Button>
        )}
        <Button variant="outlineDark" disabled={loading} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="my-4 rounded-lg border border-maroon p-4 text-maroon">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-4 rounded-lg bg-paper-2 p-4">
          {notice}
        </p>
      )}
      {loading && !data && <p role="status">Loading registrations…</p>}
      {data && (
        <>
          {!data.emailConfigured && (
            <p className="mb-4 rounded-lg border p-3 text-sm">
              Email delivery is not configured or is disabled. Messages remain queued; an owner must
              verify the existing email service before delivery can start.
            </p>
          )}
          {tab === "registrations" && !current && (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Registrations", data.registrations.length],
                  [
                    "New",
                    data.registrations.filter((r) => (w(r.id)?.follow_up || "new") === "new")
                      .length,
                  ],
                  ["Unassigned", data.registrations.filter((r) => !w(r.id)?.assignee_id).length],
                  [
                    "Upcoming",
                    data.appointments.filter(
                      (a) => a.status !== "cancelled" && new Date(a.starts_at) > new Date(),
                    ).length,
                  ],
                ].map(([name, count]) => (
                  <div key={name} className="rounded-xl bg-navy p-4 text-white">
                    <p className="text-sm">{name}</p>
                    <p className="mt-1 text-3xl">{count}</p>
                  </div>
                ))}
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  variant={view === "all" ? "primary" : "outlineDark"}
                  onClick={() => setView("all")}
                >
                  All Registrations
                </Button>
                <Button
                  variant={view === "mine" ? "primary" : "outlineDark"}
                  onClick={() => setView("mine")}
                >
                  My Teams / Assigned Players
                </Button>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-semibold">
                  Search
                  <input
                    className={control}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Player, guardian, positions…"
                  />
                </label>
                <Filter name="Sport" value={sport} set={setSport} options={options("sport")} />
                <Filter name="Age group" value={age} set={setAge} options={options("age")} />
                <Filter name="Season" value={season} set={setSeason} options={options("season")} />
                <Filter name="Team" value={team} set={setTeam} options={data.teams} />
                <Filter name="Follow-up coach" value={coach} set={setCoach} options={data.staff} />
                <Filter
                  name="Status"
                  value={status}
                  set={setStatus}
                  options={TRYOUT_STATUSES.map((s) => ({ id: s, name: label(s) }))}
                />
                <label className="text-sm font-semibold">
                  Appointment date
                  <input
                    className={control}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              <p role="status" className="my-4 text-sm">
                {rows.length} matching registrations
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {rows.map((r) => (
                  <article key={r.id} className="min-w-0 rounded-xl border bg-paper-2 p-5">
                    <p className="text-sm font-semibold text-maroon">
                      {r.payload.sport} · {r.payload.age} · {label(w(r.id)?.follow_up || "new")}
                    </p>
                    <h2 className="mt-1 break-words text-2xl">
                      {r.payload.player || "Player registration"}
                    </h2>
                    <p className="text-sm">
                      {r.payload.season} · {r.payload.positions || "Positions not provided"}
                    </p>
                    <p className="mt-2 text-sm">Guardian: {r.payload.parent || "Not provided"}</p>
                    <p className="text-sm">
                      Coach:{" "}
                      {data.staff.find((s) => s.id === w(r.id)?.assignee_id)?.name ||
                        (w(r.id)?.assignee_id ? "Assigned coach (inactive)" : "Unassigned")}
                    </p>
                    {w(r.id)?.follow_up_date && (
                      <p className="text-sm">
                        Follow-up: {String(w(r.id)?.follow_up_date).slice(0, 10)}
                      </p>
                    )}
                    <p className="text-xs text-muted">Registered {stamp(r.created_at)} CT</p>
                    <Button className="mt-4" onClick={() => setSelected(r.id)}>
                      Open {r.payload.player || "registration"}
                    </Button>
                  </article>
                ))}
              </div>
              {!rows.length && (
                <p className="rounded-xl border p-5">
                  No registrations match. Try clearing the filters.
                </p>
              )}
            </>
          )}
          {tab === "registrations" && current && (
            <RegistrationDetail
              key={current.id + ":" + (w(current.id)?.revision ?? 0)}
              row={current}
              data={data}
              busy={busy}
              run={run}
              back={() => setSelected("")}
            />
          )}
          {tab === "evaluations" && <TryoutEvaluations />}
          {tab === "notifications" && (
            <div className="grid gap-3">
              {data.notices.map((n) => (
                <article key={n.id} className="rounded-xl border p-4">
                  <p className="font-semibold">
                    {!n.read_at ? "New · " : ""}
                    {n.subject}
                  </p>
                  <p className="text-sm">{stamp(n.created_at)} CT</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        setSelected(n.request_id);
                        setTab("registrations");
                        void run(
                          () => readTryoutNotice({ data: { id: n.id } }),
                          "Notification opened.",
                        );
                      }}
                    >
                      Open registration
                    </Button>
                  </div>
                </article>
              ))}
              {!data.notices.length && (
                <p>No new alerts yet. Existing registrations are available in All Registrations.</p>
              )}
              <h2 className="mt-4 text-2xl">Email queue</h2>
              <p className="text-sm">
                Sent means the provider accepted the email; it does not confirm inbox delivery.
              </p>
              {data.failures.map((f) => (
                <p key={f.request_id + f.status}>
                  {data.registrations.find((r) => r.id === f.request_id)?.payload.player ||
                    "Registration"}{" "}
                  · {f.status} · {f.count} message(s)
                </p>
              ))}
            </div>
          )}
          {tab === "preferences" && <Preferences data={data} busy={busy} run={run} />}
        </>
      )}
    </main>
  );
}
type Run = (work: () => Promise<unknown>, message: string) => Promise<void>;
function RegistrationDetail({
  row,
  data,
  busy,
  run,
  back,
}: {
  row: Registration;
  data: Workspace;
  busy: boolean;
  run: Run;
  back: () => void;
}) {
  const saved = data.work.find((w) => w.request_id === row.id);
  const [form, setForm] = useState<CenterWorkInput>({
    id: row.id,
    revision: saved?.revision ?? 0,
    assignee: saved?.assignee_id ?? "",
    teamId: saved?.team_id ?? "",
    status: (saved?.follow_up ?? "new") as CenterWorkInput["status"],
    followUpDate: saved?.follow_up_date ? String(saved.follow_up_date).slice(0, 10) : "",
    note: "",
    actionId: crypto.randomUUID(),
  });
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getTryoutDetail>>>(),
    [detailError, setDetailError] = useState(""),
    [evaluate, setEvaluate] = useState(false),
    [message, setMessage] = useState({
      kind: "email" as "email" | "call" | "note" | "family-reply",
      subject: "Your Oklahoma Prospects tryout",
      body: "",
    }),
    [messageId, setMessageId] = useState(crypto.randomUUID()),
    [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    let active = true;
    getTryoutDetail({ data: { id: row.id } })
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      });
    return () => {
      active = false;
    };
  }, [row.id, historyVersion]);
  const templates: Record<string, string> = {
    welcome: `Hi ${row.payload.parent || "there"},\n\nThank you for registering ${row.payload.player} with Oklahoma Prospects! I look forward to learning more about your player's goals.\n\nCoach`,
    confirm: `Hi ${row.payload.parent || "there"},\n\nI'm following up to confirm ${row.payload.player}'s tryout. Please review the appointment details below and reply to confirm you can attend.\n\nCoach`,
    information: `Hi ${row.payload.parent || "there"},\n\nCould you share a little more about ${row.payload.player}'s experience, positions, and goals?\n\nCoach`,
    reschedule: `Hi ${row.payload.parent || "there"},\n\nLet's find another time for ${row.payload.player}'s evaluation. What days and times work for your family?\n\nCoach`,
    followup: `Hi ${row.payload.parent || "there"},\n\nI'm checking in about ${row.payload.player}'s next step with Oklahoma Prospects. Please reply when you have a chance.\n\nCoach`,
  };
  return (
    <section className="min-w-0">
      <Button variant="outlineDark" onClick={back}>
        Back to registrations
      </Button>
      <h2 className="mt-5 text-3xl">{row.payload.player}</h2>
      <p>
        {row.payload.sport} · {row.payload.age} · {row.payload.season}
      </p>
      <dl className="my-5 grid min-w-0 gap-3 rounded-xl bg-paper-2 p-4 sm:grid-cols-2">
        {Object.entries(row.payload)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0 break-words">
              <dt className="text-sm font-semibold">{label(k.replace(/([A-Z])/g, " $1"))}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
      </dl>
      <h3 className="text-2xl">Follow-up & assignment</h3>
      <div className="my-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Primary coach
          <select
            className={control}
            aria-label="Primary coach"
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
          >
            <option value="">Unassigned</option>
            {form.assignee &&
              form.assignee === saved?.assignee_id &&
              !data.staff.some((s) => s.id === form.assignee) && (
                <option value={form.assignee} disabled>
                  Assigned coach (inactive)
                </option>
              )}
            {data.staff.map((s) => (
              <option key={s.id + s.staffId} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Assigned team
          <select
            className={control}
            aria-label="Assigned team"
            value={form.teamId}
            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
          >
            <option value="">No team assigned</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Follow-up status
          <select
            className={control}
            aria-label="Follow-up status"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as CenterWorkInput["status"] })
            }
          >
            {TRYOUT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Follow-up date
          <input
            className={control}
            type="date"
            value={form.followUpDate}
            onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
          />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          Internal follow-up note
          <textarea
            className={control}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </div>
      <Button
        disabled={busy}
        onClick={() => void run(() => saveTryoutWork({ data: form }), "Follow-up saved.")}
      >
        Save follow-up
      </Button>
      <p className="mt-2 text-sm text-muted">
        Accepted records a recruiting outcome. Use the existing Teams roster workflow to enroll the
        player; this does not create dues or a roster spot.
      </p>
      <div className="my-8 border-t pt-5">
        <h3 className="text-2xl">Contact the family</h3>
        <p className="mt-2 text-sm">
          To: {row.payload.email || "No guardian email"} · {row.payload.phone}. Email replies go to
          the sending coach's verified inbox. Record replies here so other coaches can follow along.
          SMS is not enabled.
        </p>
        <div className="my-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Communication type
            <select
              className={control}
              aria-label="Communication type"
              value={message.kind}
              onChange={(e) =>
                setMessage({ ...message, kind: e.target.value as typeof message.kind })
              }
            >
              {["email", "call", "note", "family-reply"].map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Message template
            <select
              className={control}
              aria-label="Message template"
              defaultValue=""
              onChange={(e) => {
                if (templates[e.target.value])
                  setMessage({ ...message, body: templates[e.target.value] });
              }}
            >
              <option value="">Choose a template</option>
              {Object.keys(templates).map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Subject
          <input
            className={control}
            value={message.subject}
            onChange={(e) => setMessage({ ...message, subject: e.target.value })}
          />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Message / contact notes
          <textarea
            className={control + " min-h-40"}
            value={message.body}
            onChange={(e) => setMessage({ ...message, body: e.target.value })}
          />
        </label>
        <Button
          className="mt-3"
          disabled={busy || !message.body.trim()}
          onClick={() =>
            void run(
              async () => {
                await saveTryoutMessage({ data: { id: row.id, actionId: messageId, ...message } });
                setMessageId(crypto.randomUUID());
                setMessage({ ...message, body: "" });
                setHistoryVersion((v) => v + 1);
              },
              message.kind === "email"
                ? "Email queued. Check the delivery status below."
                : "Contact history saved.",
            )
          }
        >
          {message.kind === "email" ? "Queue email to guardian" : "Save contact record"}
        </Button>
      </div>
      <Appointment
        key={
          data.appointments.find((a) => a.request_id === row.id && a.status !== "cancelled")
            ?.revision ?? 0
        }
        row={row}
        data={data}
        busy={busy}
        run={run}
      />
      {data.owner && !row.payload.rosterPlayerId && (
        <RequestStageForm
          request={row}
          teams={data.teams}
          publicTeams={data.publicTeams}
          onComplete={async (message) => {
            await run(async () => {}, message);
          }}
          onError={setDetailError}
        />
      )}
      {row.payload.rosterPlayerId && (
        <p className="my-4">
          This registration is linked to an existing roster placement.{" "}
          <a className="underline" href="/teams">
            Open Teams
          </a>
        </p>
      )}
      <div className="my-8 border-t pt-5">
        <h3 className="text-2xl">Evaluations</h3>
        <p className="my-2 text-sm">
          Internal coach ratings and notes are never sent automatically to families.
        </p>
        <Button onClick={() => setEvaluate(!evaluate)}>
          {evaluate ? "Hide evaluations" : "Evaluate player / view results"}
        </Button>
        {evaluate && <TryoutEvaluations registrationId={row.id} />}
      </div>
      <h3 className="text-2xl">Shared communication history</h3>
      {detailError && <p role="alert">{detailError}</p>}
      {!detail && !detailError && <p role="status">Loading history…</p>}
      {detail?.delivery.map((d) => (
        <p key={d.id} className="my-2 text-sm">
          Email: {d.subject} · {d.status}
          {d.accepted_at ? ` · Provider accepted ${stamp(d.accepted_at)} CT` : ""}
        </p>
      ))}
      {detail?.activity.map((a) => (
        <article key={a.id} className="my-3 rounded-lg border p-4">
          <p className="text-sm font-semibold">
            {label(a.kind)} · {a.name || "System"} · {stamp(a.created_at)} CT
          </p>
          {a.subject && <h4 className="mt-2 font-semibold">{a.subject}</h4>}
          <p className="mt-2 whitespace-pre-wrap break-words">{a.body}</p>
        </article>
      ))}
      {detail && !detail.activity.length && <p className="my-3">No contact recorded yet.</p>}
    </section>
  );
}
function Appointment({
  row,
  data,
  busy,
  run,
}: {
  row: Registration;
  data: Workspace;
  busy: boolean;
  run: Run;
}) {
  const old = data.appointments.find((a) => a.request_id === row.id && a.status !== "cancelled");
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(d));
  const [form, setForm] = useState<CenterAppointmentInput>({
    id: old?.id || crypto.randomUUID(),
    requestId: row.id,
    revision: old?.revision ?? 0,
    coachId: old?.coach_id || "",
    eventId: old?.event_id || "",
    date: old ? chicagoDate(new Date(old.starts_at)) : chicagoDate(),
    time: old ? clock(old.starts_at) : "16:00",
    duration: old
      ? (new Date(old.ends_at).getTime() - new Date(old.starts_at).getTime()) / 60000
      : 60,
    location: old?.location || "Prospects Sports Facility, 3804 S. Elm Pl., Suite A",
    laneIds: (old?.lane_ids ?? []) as CenterAppointmentInput["laneIds"],
    status: old?.status || "proposed",
    actionId: crypto.randomUUID(),
  });
  return (
    <section className="my-8 border-t pt-5">
      <h3 className="text-2xl">Tryout appointment</h3>
      <p className="my-2 text-sm">
        All times are Central (America/Chicago). Proposals do not reserve space. Confirmed
        individual evaluations reserve the coach and selected lanes without charging the family.
        Appointment emails are queued to the guardian; replies go to the appointment coach.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Appointment type
          <select
            className={control}
            aria-label="Appointment type"
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
          >
            <option value="">Individual evaluation</option>
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.sport} · {e.date} · {e.startTime} · {e.location}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Appointment coach
          <select
            className={control}
            aria-label="Appointment coach"
            value={form.coachId}
            onChange={(e) => setForm({ ...form, coachId: e.target.value })}
          >
            <option value="">Choose coach</option>
            {form.coachId &&
              form.coachId === old?.coach_id &&
              !data.staff.some((s) => s.staffId === form.coachId) && (
                <option value={form.coachId} disabled>
                  Assigned coach (inactive)
                </option>
              )}
            {data.staff
              .filter((s) => s.staffId)
              .map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        {!form.eventId && (
          <>
            <label className="text-sm font-semibold">
              Appointment date
              <input
                className={control}
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Start time
              <input
                className={control}
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Duration (minutes)
              <input
                className={control}
                type="number"
                min="20"
                max="180"
                step="5"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm font-semibold">
              Location
              <input
                className={control}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
          </>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Facility space (select all needed)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {BOOKABLE_LANES.map((l) => (
              <label key={l.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.laneIds.includes(l.id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      laneIds: e.target.checked
                        ? [...form.laneIds, l.id]
                        : form.laneIds.filter((v) => v !== l.id),
                    })
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-semibold">
          Appointment status
          <select
            className={control}
            aria-label="Appointment status"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as CenterAppointmentInput["status"] })
            }
          >
            {["proposed", "confirmed", ...(old ? ["cancelled"] : [])].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        className="mt-4"
        disabled={busy || !form.coachId}
        onClick={() =>
          void run(async () => {
            await saveTryoutAppointment({ data: form });
            setForm({ ...form, revision: form.revision + 1, actionId: crypto.randomUUID() });
          }, "Appointment saved; coach and guardian notifications queued.")
        }
      >
        Save appointment
      </Button>
      {data.appointments
        .filter((a) => a.request_id === row.id)
        .map((a) => (
          <p key={a.id} className="mt-3 text-sm">
            {label(a.status)} · {stamp(a.starts_at)} CT · {a.location}
          </p>
        ))}
    </section>
  );
}
function Preferences({ data, busy, run }: { data: Workspace; busy: boolean; run: Run }) {
  const [email, setEmail] = useState(data.preferences.email_enabled),
    [sports, setSports] = useState(data.preferences.sports),
    [ages, setAges] = useState(data.preferences.ages.join(", ")),
    [teams, setTeams] = useState(data.preferences.team_ids);
  return (
    <section className="max-w-xl">
      <h2 className="text-2xl">Your notification preferences</h2>
      <p className="my-3 text-sm">
        Empty filters include every registration. Filters apply to new-registration alerts; assigned
        follow-ups still appear. Existing registrations will not be emailed again.
      </p>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
        Email notifications
      </label>
      {["baseball", "softball"].map((s) => (
        <label key={s} className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={sports.includes(s)}
            onChange={(e) =>
              setSports(e.target.checked ? [...sports, s] : sports.filter((v) => v !== s))
            }
          />
          {label(s)}
        </label>
      ))}
      <label className="block text-sm font-semibold">
        Age groups (comma separated, e.g. 7U, 14U)
        <input className={control} value={ages} onChange={(e) => setAges(e.target.value)} />
      </label>
      <fieldset className="my-4">
        <legend className="font-semibold">Preferred team filters</legend>
        {data.teams.map((t) => (
          <label key={t.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={teams.includes(t.id)}
              onChange={(e) =>
                setTeams(e.target.checked ? [...teams, t.id] : teams.filter((v) => v !== t.id))
              }
            />
            {t.name}
          </label>
        ))}
      </fieldset>
      <Button
        disabled={busy}
        onClick={() =>
          void run(
            () =>
              saveTryoutPreferences({
                data: {
                  emailEnabled: email,
                  sports: sports as ("baseball" | "softball")[],
                  ages: ages
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  teamIds: teams,
                },
              }),
            "Notification preferences saved.",
          )
        }
      >
        Save preferences
      </Button>
    </section>
  );
}
