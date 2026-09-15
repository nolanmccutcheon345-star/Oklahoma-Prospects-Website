import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, FieldInput, NumRows, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import {
  ATTEND_MARKS,
  FIELD_STATUSES,
  FIELD_STATUS_LABEL,
  attendancePct,
  type OsAttend,
  type OsFieldStatus,
} from "@/lib/teams/field";
import { iso } from "@/lib/teams/engine/00-helpers.js";
import type { OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

export type FieldPane = "all" | "attendance" | "announcements" | "field-calls" | "chat" | "practice";

const MARK_LABEL: Record<OsAttend, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};

export function FieldOpsBoard({ team, pane = "all" }: { team: OsTeam; pane?: FieldPane }) {
  const show = (id: FieldPane) => pane === "all" || pane === id;
  return (
    <div data-teams-field={pane} className="grid gap-4">
      {show("field-calls") ? <Calls team={team} /> : null}
      {show("practice") ? <Practice team={team} /> : null}
      {show("attendance") ? <Attendance team={team} /> : null}
      {show("announcements") ? <Announcements team={team} /> : null}
      {show("chat") ? <Chat team={team} /> : null}
    </div>
  );
}

function Calls({ team }: { team: OsTeam }) {
  const os = useTeams();
  const can = os.role === "coach" || os.role === "admin";
  const calls = (os.state.fieldCalls || []).filter((c) => c.teamId === team.id);
  const practices = team.practices || [];
  const [status, setStatus] = useState<OsFieldStatus>("delayed");
  const [note, setNote] = useState("");
  const [practiceId, setPracticeId] = useState(practices[0]?.id || "");
  const [newPlace, setNewPlace] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  return (
    <DeskCard
      eyebrow="Field calls"
      title="Weather is the most common thing that happens to a season."
      copy="One tap reaches everyone. A move reschedules the practice."
    >
      {can ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FIELD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                data-teams-call-status={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "teams-control min-h-11 rounded-lg px-2 text-xs font-semibold tracking-wide uppercase",
                  status === s ? "bg-maroon text-fg-inverse" : "bg-paper text-teams-ink shadow-border",
                )}
              >
                {FIELD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {practices.length ? (
            <label className="grid gap-1">
              <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Session</span>
              <select
                className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
                value={practiceId}
                onChange={(e) => setPracticeId(e.target.value)}
              >
                {practices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.date} · {p.time} · {p.place || p.where}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <FieldInput label="Note" value={note} onChange={setNote} placeholder="Lightning. Stay in the cars." />
          {status === "moved" ? (
            <>
              <FieldInput label="New date" type="date" value={newDate} onChange={setNewDate} />
              <FieldInput label="New time" value={newTime} onChange={setNewTime} placeholder="6:00 PM" />
              <FieldInput label="New place" value={newPlace} onChange={setNewPlace} placeholder="Field 2" />
            </>
          ) : null}
          <Button
            type="button"
            variant="maroon"
            data-teams-send-call
            onClick={() => {
              os.sendFieldCall({
                teamId: team.id,
                practiceId: practiceId || null,
                status,
                note,
                newDate: newDate || undefined,
                newTime: newTime || undefined,
                newPlace: newPlace || undefined,
              });
              setNote("");
            }}
          >
            Send to everyone
          </Button>
        </div>
      ) : null}
      {calls.length === 0 && !can ? (
        <p className="text-sm text-teams-muted">No field call this week.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {calls.map((c) => (
            <li key={c.id} className="teams-row" data-teams-field-call={c.status}>
              <p className="text-sm font-semibold">
                {FIELD_STATUS_LABEL[c.status as OsFieldStatus] || c.status}
              </p>
              <p className="text-xs text-teams-muted">
                {c.at}
                {c.note ? ` · ${c.note}` : ""}
                {c.newPlace ? ` · ${c.newPlace}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DeskCard>
  );
}

function Practice({ team }: { team: OsTeam }) {
  const os = useTeams();
  const can = os.role === "coach" || os.role === "admin";
  const list = team.practices || [];
  const [date, setDate] = useState(iso(new Date(2026, 8, 17)));
  const [time, setTime] = useState("5:00 PM");
  const [place, setPlace] = useState("Field 1");
  const [note, setNote] = useState("");
  const [cage, setCage] = useState("");

  return (
    <DeskCard eyebrow="Practice" title="Cages, then the field.">
      {list.length === 0 ? (
        <p className="text-sm text-teams-muted">No practices posted.</p>
      ) : (
        <NumRows
          rows={list.map((p) => ({
            label: `${p.date} · ${p.time}`,
            value: p.place || p.where || "TBD",
          }))}
        />
      )}
      {list.map((p) =>
        p.note ? (
          <p key={p.id} className="mt-2 rounded-xl bg-cream/80 px-4 py-3 text-sm">
            {p.note}
          </p>
        ) : null,
      )}
      {can ? (
        <div className="mt-4 grid gap-3">
          <FieldInput label="Date" type="date" value={date} onChange={setDate} />
          <FieldInput label="Time" value={time} onChange={setTime} />
          <FieldInput label="Place" value={place} onChange={setPlace} />
          <FieldInput label="Note" value={note} onChange={setNote} />
          <FieldInput
            label="Cage hours (optional)"
            type="number"
            value={cage}
            onChange={setCage}
            placeholder="0"
          />
          <Button
            type="button"
            variant="maroon"
            data-teams-add-practice
            onClick={() => {
              os.addPractice(team.id, {
                date,
                time,
                place,
                note,
                cageHours: cage ? Number(cage) : 0,
              });
              setNote("");
              setCage("");
            }}
          >
            Post practice
          </Button>
        </div>
      ) : null}
    </DeskCard>
  );
}

function Attendance({ team }: { team: OsTeam }) {
  const os = useTeams();
  const can = os.role === "coach" || os.role === "admin";
  const sessions = team.practices || [];
  const keys = Object.keys(team.attendance || {});
  const sessionId = sessions[0]?.id || keys[0] || "";
  const [active, setActive] = useState(sessionId);
  const roster = team.roster.filter((p) => !p.withdrawn);
  const marks = team.attendance?.[active] || {};

  function exportCsv() {
    const header = ["Player", ...keys].join(",");
    const lines = roster.map((p) => {
      const pct = attendancePct(team, p.id);
      const cells = keys.map((k) => team.attendance?.[k]?.[p.id] || "");
      return [`"${p.name}"`, ...cells, pct == null ? "" : `${pct}%`].join(",");
    });
    downloadText(
      `${team.name.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`,
      ["Player," + keys.join(",") + ",Season %", ...lines].join("\n"),
      "text/csv",
    );
    void header;
  }

  if (!sessions.length && !keys.length) {
    return (
      <TeamsEmpty
        title="Attendance is empty."
        copy="Take it at the next practice. This is the record that settles a playing-time conversation."
        action="Open practice"
        onAction={() => os.openTeam(team.id, "practice")}
      />
    );
  }

  return (
    <DeskCard
      eyebrow="Attendance"
      title="Who was in the building."
      copy="Present, late, excused, absent. Season percentage per player."
    >
      {sessions.length > 1 ? (
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
                active === s.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
            >
              {s.date}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-line" data-teams-attendance>
        {roster.map((p) => {
          const pct = attendancePct(team, p.id);
          const current = (marks[p.id] || "") as OsAttend | "";
          return (
            <li key={p.id} className="teams-row grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="teams-num text-xs font-semibold text-teams-muted">
                  {pct == null ? "—" : `${pct}%`}
                </span>
              </div>
              {can ? (
                <div className="flex flex-wrap gap-1">
                  {ATTEND_MARKS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-teams-attend={`${p.id}-${m}`}
                      onClick={() => os.markAttendance(team.id, active, p.id, m)}
                      className={cn(
                        "min-h-11 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
                        current === m ? "bg-maroon text-fg-inverse" : "bg-paper text-teams-ink shadow-border",
                      )}
                    >
                      {MARK_LABEL[m]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-teams-muted">{current ? MARK_LABEL[current] : "Not marked"}</p>
              )}
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="outlineDark" className="mt-4" data-teams-attend-export onClick={exportCsv}>
        Export attendance
      </Button>
    </DeskCard>
  );
}

function Announcements({ team }: { team: OsTeam }) {
  const os = useTeams();
  const can = os.role === "coach" || os.role === "admin";
  const list = team.announcements || [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [arrive, setArrive] = useState("");
  const [uniform, setUniform] = useState("");
  const [hotel, setHotel] = useState("");
  const [pin, setPin] = useState(true);

  return (
    <>
      {list.length === 0 && !can ? (
        <TeamsEmpty
          title="No announcement yet."
          copy="Pin arrive time, uniform, and hotel when the weekend is set."
          action="Open schedule"
          onAction={() => os.openTeam(team.id, "schedule")}
        />
      ) : (
        list.map((a, i) => (
          <DeskCard key={a.id || i} eyebrow={a.pin ? "Pinned" : "Announcement"} title={a.title || "Note"}>
            <NumRows
              rows={[
                ...(a.arrive ? [{ label: "Arrive", value: a.arrive }] : []),
                ...(a.uniform ? [{ label: "Uniform", value: a.uniform }] : []),
                ...(a.hotel ? [{ label: "Hotel", value: a.hotel }] : []),
              ]}
            />
            {a.body ? <p className="mt-3 text-sm">{a.body}</p> : null}
          </DeskCard>
        ))
      )}
      {can ? (
        <DeskCard eyebrow="Post" title="Don't bury it in chat.">
          <div className="grid gap-3">
            <FieldInput label="Title" value={title} onChange={setTitle} placeholder="Saturday pool play" />
            <FieldInput label="Arrive" value={arrive} onChange={setArrive} placeholder="7:15 AM" />
            <FieldInput label="Uniform" value={uniform} onChange={setUniform} placeholder="Cream home" />
            <FieldInput label="Hotel" value={hotel} onChange={setHotel} placeholder="Hampton Inn" />
            <label className="grid gap-1">
              <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Body</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="min-h-24 w-full rounded-lg bg-paper px-3 py-2 text-sm shadow-border"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
              Pin this
            </label>
            <Button
              type="button"
              variant="maroon"
              data-teams-announce
              onClick={() => {
                if (!title.trim()) return;
                os.postAnnouncement(team.id, { title, body, arrive, uniform, hotel, pin });
                setTitle("");
                setBody("");
                setArrive("");
                setUniform("");
                setHotel("");
              }}
            >
              Post announcement
            </Button>
          </div>
        </DeskCard>
      ) : null}
    </>
  );
}

function Chat({ team }: { team: OsTeam }) {
  const os = useTeams();
  const list = team.messages || [];
  const [text, setText] = useState("");
  const canPost = os.role !== "player" || true;

  return (
    <DeskCard
      eyebrow="Chat"
      title="One thread. Group only."
      copy="No adult-to-player direct messages. Messages stay for the season."
    >
      {list.length === 0 ? (
        <p className="text-sm text-teams-muted">The thread is quiet.</p>
      ) : (
        <ul className="grid gap-3" data-teams-chat>
          {list.map((m) => (
            <li key={m.id} className="rounded-xl bg-paper px-4 py-3 shadow-border">
              <p className="text-xs font-semibold tracking-wide text-maroon uppercase">
                {m.author || m.from} · {m.role || "team"}
              </p>
              <p className="mt-1 text-sm">{m.text || m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canPost ? (
        <div className="mt-4 grid gap-2">
          <textarea
            data-teams-chat-input
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Group thread only."
            className="min-h-24 w-full rounded-lg bg-paper px-3 py-2 text-sm shadow-border"
          />
          <Button
            type="button"
            variant="maroon"
            data-teams-chat-send
            onClick={() => {
              const result = os.sendChat(team.id, text);
              if (result.ok) setText("");
            }}
          >
            Send to team
          </Button>
        </div>
      ) : null}
    </DeskCard>
  );
}
