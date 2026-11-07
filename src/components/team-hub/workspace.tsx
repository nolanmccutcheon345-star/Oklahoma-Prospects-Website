import { useCallback, useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bell,
  CalendarDays,
  Check,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getTeamHub, changeTeamHub } from "@/lib/team-hub/api";
import type { HubData } from "@/lib/team-hub/server";
import type { HubAction } from "@/lib/team-hub/contracts";
import { chicagoDate } from "@/lib/scheduling";
import "./base.css";
import "./theme.css";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0] || "")
    .join("");
}
function stamp(value: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value)) + " CT"
    : "";
}
function day(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(+date)
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(date)
    : value;
}
function clock(value: string) {
  const [h, m] = value.split(":");
  if (!h || !m) return value;
  return `${Number(h) % 12 || 12}:${m} ${Number(h) < 12 ? "AM" : "PM"}`;
}
export function TeamHubWorkspace() {
  const [teamId, setTeamId] = useState<string>(),
    [playerId, setPlayerId] = useState<string | null>(null);
  const [data, setData] = useState<HubData>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("updates");
  const [postOpen, setPostOpen] = useState(false),
    [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ title: "", body: "", urgent: false });
  const request = useRef(0),
    mounted = useRef(false),
    sending = useRef(false),
    selection = useRef("");
  const messageRequest = useRef<string | null>(null),
    postRequest = useRef<string | null>(null);
  const selectionKey = `${teamId || ""}:${playerId || ""}`;
  selection.current = selectionKey;
  const reload = useCallback(async () => {
    const version = ++request.current;
    try {
      const result = await getTeamHub({ data: { teamId, playerId } });
      if (mounted.current && version === request.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (mounted.current && version === request.current) {
        setData(undefined);
        setError(e instanceof Error ? e.message : "Could not load Team Hub.");
      }
    }
  }, [teamId, playerId]);
  useEffect(() => {
    mounted.current = true;
    setData(undefined);
    setError("");
    setNotice("");
    void reload();
    const refresh = () => {
      if (document.visibilityState !== "hidden" && !sending.current) void reload();
    };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  async function run(action: HubAction, success: string) {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const started = selection.current;
    try {
      await changeTeamHub({ data: action });
      if (mounted.current && selection.current === started) {
        await reload();
        setNotice(success);
      }
      return true;
    } catch (e) {
      if (mounted.current && selection.current === started)
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      return false;
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function changeTeam(value: string) {
    if (busy) return;
    setTeamId(value);
    setPlayerId(null);
    setMessage("");
    setPostOpen(false);
    setDraft({ title: "", body: "", urgent: false });
    messageRequest.current = null;
    postRequest.current = null;
  }
  const hub = data?.workspace,
    selected = data?.selected;
  const current = data?.teams.find((t) => t.id === selected);
  const actionable = hub?.posts.filter((p) => p.urgent && !p.acknowledged).length || 0;
  const next = hub?.events.find((e) => !e.cancelled && e.date >= chicagoDate());
  return (
    <main id="main" className="hub">
      <header className="hub-top">
        <div>
          <p className="hub-kicker">PROSPECTS SPORTS ACADEMY</p>
          <h1>Team Hub</h1>
        </div>
        <div className="hub-user">
          <div className="hub-user-name">
            <b>{data?.me.name || "Welcome, Prospects family"}</b>
            <p style={{ color: "#bdd2e3", fontSize: 14 }}>
              {data?.me.owner
                ? "Front office"
                : hub?.manage
                  ? "Team coach"
                  : "Your team. One place."}
            </p>
          </div>
          <span className="hub-avatar">{data ? initials(data.me.name) : "P"}</span>
        </div>
      </header>
      {!hub ? (
        <div className="hub-loading">
          {error ? (
            <div className="hub-error" role="alert">
              {error}{" "}
              <button className="hub-btn" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          ) : !data ? (
            <p role="status">Loading your team…</p>
          ) : (
            <section className="hub-empty">
              <h2>Welcome to Prospects</h2>
              <p>
                Your team appears after your roster invitation is accepted using the invited email.
                Creating an account or requesting a tryout does not add you to a team.
              </p>
              <a href="/invitations">Review invitations</a>
              <a href="/account">Complete account setup</a>
              <a href="/contact">Get help from Prospects</a>
            </section>
          )}
          {error && (
            <p className="hub-status">
              <a href="/invitations">Review invitations</a> ·{" "}
              <a href="/account">Account and email verification</a> ·{" "}
              <a href="/contact">Contact Prospects</a>
            </p>
          )}
        </div>
      ) : (
        <Tabs.Root
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            setNotice("");
          }}
          className="hub-layout"
        >
          <aside className="hub-side">
            <label htmlFor="hub-team">YOUR TEAMS</label>
            <select
              id="hub-team"
              value={selected || ""}
              disabled={busy}
              onChange={(e) => changeTeam(e.target.value)}
            >
              {data!.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Tabs.List className="hub-nav" aria-label="Team Hub sections">
              <Tabs.Trigger value="updates">
                <Bell size={19} />
                Updates {actionable > 0 && <span className="hub-badge urgent">{actionable}</span>}
              </Tabs.Trigger>
              <Tabs.Trigger value="schedule">
                <CalendarDays size={19} />
                Schedule
              </Tabs.Trigger>
              <Tabs.Trigger value="messages">
                <MessageCircle size={19} />
                Messages
              </Tabs.Trigger>
              <Tabs.Trigger value="team">
                <Users size={19} />
                My team
              </Tabs.Trigger>
            </Tabs.List>
            <p className="hub-side-note">
              <ShieldCheck size={19} />
              <br />
              Only linked parents, assigned coaches and the front office can open this hub.
            </p>
            <a href="/account" className="hub-btn">
              Account & enrollment
            </a>
            {hub.manage && (
              <a href="/coach" className="hub-btn">
                Coach workspace
              </a>
            )}
          </aside>
          <section className="hub-main">
            <div className="hub-heading">
              <div>
                <h2>
                  {tab === "updates"
                    ? "The team bulletin"
                    : tab === "schedule"
                      ? "Be ready for first pitch"
                      : tab === "messages"
                        ? "Keep the team connected"
                        : "Your Prospects family"}
                </h2>
                <p>
                  {hub.name}
                  {hub.coach ? ` · Coach ${hub.coach}` : ""}
                  {current?.season ? ` · ${current.season}` : ""}
                </p>
              </div>
              {hub.manage && tab === "updates" && (
                <button
                  className="hub-btn primary"
                  disabled={busy}
                  onClick={() => setPostOpen(!postOpen)}
                >
                  {postOpen ? "Close update form" : "Post update"}
                </button>
              )}
              {hub.manage && tab === "schedule" && (
                <a className="hub-btn primary" href="/coach">
                  Manage schedule
                </a>
              )}
            </div>
            {error && (
              <div className="hub-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="hub-success" role="status">
                {notice}
              </div>
            )}
            <Tabs.Content value="updates" className="hub-tab-panel">
              {postOpen && hub.manage && (
                <form
                  className="hub-card hub-form hub-post-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    postRequest.current ||= crypto.randomUUID();
                    if (
                      await run(
                        {
                          kind: "post",
                          teamId: selected!,
                          requestId: postRequest.current,
                          ...draft,
                        },
                        "Team update saved.",
                      )
                    ) {
                      setDraft({ title: "", body: "", urgent: false });
                      setPostOpen(false);
                      postRequest.current = null;
                    }
                  }}
                >
                  <h3>Post a team update</h3>
                  <label>
                    Headline
                    <input
                      required
                      maxLength={120}
                      disabled={busy}
                      value={draft.title}
                      onChange={(e) => {
                        postRequest.current = null;
                        setDraft({ ...draft, title: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Update
                    <textarea
                      required
                      maxLength={3000}
                      disabled={busy}
                      value={draft.body}
                      onChange={(e) => {
                        postRequest.current = null;
                        setDraft({ ...draft, body: e.target.value });
                      }}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.urgent}
                      disabled={busy}
                      onChange={(e) => {
                        postRequest.current = null;
                        setDraft({ ...draft, urgent: e.target.checked });
                      }}
                    />
                    Highlight as action needed
                  </label>
                  <p className="hub-status">
                    Visible to this team in the hub. No email or text alert is sent.
                  </p>
                  <button
                    className="hub-btn primary"
                    disabled={busy || !draft.title.trim() || !draft.body.trim()}
                  >
                    {busy ? "Saving…" : "Publish team update"}
                  </button>
                </form>
              )}
              <div className="hub-grid">
                <div className="hub-stack">
                  {!hub.posts.length && (
                    <div className="hub-empty">
                      No updates yet. Your coach’s announcements will appear here.
                    </div>
                  )}
                  {hub.posts.map((p) => (
                    <article key={p.key} className={`hub-card ${p.urgent ? "urgent" : ""}`}>
                      <div className="hub-meta">
                        <span className="hub-avatar staff">{initials(p.author)}</span>
                        <div>
                          <span className="hub-author">{p.author}</span>
                          {p.at && (
                            <>
                              <br />
                              <time>{stamp(p.at)}</time>
                            </>
                          )}
                        </div>
                        {p.urgent && <span className="hub-badge urgent">Action needed</span>}
                      </div>
                      <h3>{p.title}</h3>
                      <p className="hub-body">{p.body}</p>
                      <div className="hub-card-foot">
                        <button
                          className="hub-btn"
                          disabled={busy || p.acknowledged}
                          onClick={() =>
                            void run(
                              { kind: "ack", teamId: selected!, postKey: p.key },
                              "Acknowledgment saved.",
                            )
                          }
                        >
                          <Check size={17} />
                          {p.acknowledged ? "Acknowledged" : "Got it, Coach"}
                        </button>
                        {p.count !== null && (
                          <span className="hub-ack-count">{p.count} accounts acknowledged</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <aside className="hub-stack hub-aside">
                  <div className="hub-card">
                    <h3>{next ? "Up next" : "Next on the calendar"}</h3>
                    {next ? (
                      <>
                        <p className="hub-body">
                          <b>{next.title}</b>
                          <br />
                          {day(next.date)} · {clock(next.time)} CT
                          <br />
                          {next.location}
                        </p>
                        <button
                          className="hub-btn blue"
                          style={{ marginTop: 16 }}
                          onClick={() => setTab("schedule")}
                        >
                          View schedule & reply
                        </button>
                      </>
                    ) : (
                      <p className="hub-body">Your next team event will appear here.</p>
                    )}
                  </div>
                  <div className="hub-card">
                    <h3>Need your coach?</h3>
                    <p className="hub-body">
                      Use a family conversation for questions about your player.
                    </p>
                    <button
                      className="hub-btn"
                      style={{ marginTop: 16 }}
                      onClick={() => {
                        setTab("messages");
                        setPlayerId(hub.players.find((p) => p.canChat)?.id || null);
                      }}
                    >
                      Message the coaches
                    </button>
                  </div>
                </aside>
              </div>
            </Tabs.Content>
            <Tabs.Content value="schedule" className="hub-tab-panel">
              <p className="hub-status" style={{ marginBottom: 16 }}>
                All times are Central Time (Broken Arrow). Replies help your coach plan; they do not
                reserve a cage.
              </p>
              <div className="hub-stack">
                {!hub.events.length && <div className="hub-empty">No events scheduled yet.</div>}
                {hub.events.map((e) => (
                  <article className="hub-card" key={e.id}>
                    <div className="hub-meta">
                      <span className={`hub-badge ${e.cancelled ? "urgent" : ""}`}>
                        {e.cancelled ? "Cancelled" : e.kind}
                      </span>
                      <time>
                        {day(e.date)} · {clock(e.time)}
                        {e.endTime ? `–${clock(e.endTime)}` : ""} CT
                      </time>
                    </div>
                    <h3>{e.title}</h3>
                    <p className="hub-body">{e.location}</p>
                    {!e.cancelled && (
                      <div className="hub-reply">
                        <b>Who’s coming?</b>
                        {hub.players
                          .filter((p) => hub.manage || p.mine)
                          .map((p) => (
                            <div className="hub-row" key={p.id}>
                              <label className="grow" htmlFor={`rsvp-${e.id}-${p.id}`}>
                                {p.name}
                              </label>
                              <select
                                id={`rsvp-${e.id}-${p.id}`}
                                aria-label={`${p.name} attendance for ${e.title}`}
                                disabled={busy}
                                value={e.responses.find((r) => r.playerId === p.id)?.response || ""}
                                onChange={(v) =>
                                  void run(
                                    {
                                      kind: "rsvp",
                                      teamId: selected!,
                                      eventId: e.id,
                                      playerId: p.id,
                                      response: v.target.value as "going" | "maybe" | "cant",
                                    },
                                    "Attendance reply saved.",
                                  )
                                }
                              >
                                <option value="" disabled>
                                  No reply
                                </option>
                                <option value="going">Coming</option>
                                <option value="maybe">Maybe</option>
                                <option value="cant">Can’t make it</option>
                              </select>
                            </div>
                          ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </Tabs.Content>
            <Tabs.Content value="messages" className="hub-tab-panel">
              <div className="hub-card hub-chat">
                <label htmlFor="hub-conversation">
                  <b>Conversation</b>
                </label>
                <select
                  id="hub-conversation"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  value={playerId || ""}
                  onChange={(e) => {
                    setMessage("");
                    messageRequest.current = null;
                    setPlayerId(e.target.value || null);
                  }}
                >
                  <option value="">Team conversation</option>
                  {hub.players
                    .filter((p) => p.canChat)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · Family & coaches
                      </option>
                    ))}
                </select>
                <p className="hub-status">
                  {playerId
                    ? "Private to this player’s linked parents, assigned coaches and the front office."
                    : "Visible to team members with access to team chat."}{" "}
                  Keep urgent or time-sensitive matters on your usual phone contact.
                </p>
                <div className="hub-messages" aria-label="Conversation messages">
                  {!hub.messages.length && <div className="hub-empty">Start the conversation.</div>}
                  {hub.messages.map((m) => (
                    <div key={m.id} className={`hub-message ${m.mine ? "mine" : ""}`}>
                      <b>{m.author}</b>
                      <p>{m.body}</p>
                      <small>{stamp(m.at)}</small>
                    </div>
                  ))}
                </div>
                <p className="hub-status">Shows the latest 100 messages in this conversation.</p>
                <form
                  className="hub-compose"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    messageRequest.current ||= crypto.randomUUID();
                    if (
                      await run(
                        {
                          kind: "message",
                          teamId: selected!,
                          playerId,
                          requestId: messageRequest.current,
                          body: message,
                        },
                        "Message saved in this conversation.",
                      )
                    ) {
                      setMessage("");
                      messageRequest.current = null;
                    }
                  }}
                >
                  <label htmlFor="hub-message">Your message</label>
                  <textarea
                    id="hub-message"
                    required
                    maxLength={3000}
                    disabled={busy}
                    value={message}
                    onChange={(e) => {
                      messageRequest.current = null;
                      setMessage(e.target.value);
                    }}
                    placeholder={
                      playerId
                        ? "Ask a question about your player…"
                        : "Share a message with your team…"
                    }
                  />
                  <button className="hub-btn primary" disabled={busy || !message.trim()}>
                    {busy ? "Saving…" : "Send message"}
                  </button>
                </form>
              </div>
            </Tabs.Content>
            <Tabs.Content value="team" className="hub-tab-panel">
              <div className="hub-card">
                <h3>{hub.name}</h3>
                <p className="hub-body">
                  {hub.players.length} players{hub.coach ? ` · Coach ${hub.coach}` : ""}
                </p>
                {hub.players.map((p) => (
                  <div key={p.id} className="hub-row">
                    <span className="hub-number">{p.number || "—"}</span>
                    <div className="grow">
                      <b>{p.name}</b>
                      {p.mine && (
                        <p>
                          <small>Your player</small>
                        </p>
                      )}
                    </div>
                    {p.canChat && (
                      <button
                        className="hub-btn"
                        disabled={busy}
                        onClick={() => {
                          setTab("messages");
                          setPlayerId(p.id);
                        }}
                      >
                        Family chat
                      </button>
                    )}
                  </div>
                ))}
                <p className="hub-member-note">
                  Missing your player or seeing the wrong team?{" "}
                  <a href="/contact">Contact the front office</a> to correct the roster connection.
                </p>
              </div>
            </Tabs.Content>
            <div className="hub-connection">
              <RefreshCw size={15} />
              Refreshes every 20 seconds while open. Hub messages do not send email or text alerts.
              <button
                className="hub-btn"
                aria-label="Refresh team hub"
                style={{ marginLeft: "auto" }}
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </section>
        </Tabs.Root>
      )}
    </main>
  );
}
