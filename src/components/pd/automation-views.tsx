import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDevelopment, type AthleteSlice } from "@/lib/pd/context";
import {
  HIGH_VALUE_KEYS,
  LB_AGE_GROUPS,
  LB_METRICS,
  POINT_ACTIVITIES,
  activityPoints,
  alertsByBucket,
  alreadyLogged,
  buildAlerts,
  coachNotes,
  familyThread,
  leaderboardRows,
  monthlyDigest,
  ownStanding,
  type AlertScope,
  type LbMetricId,
  type PdAlert,
} from "@/lib/pd/automation";
import { CLUB_DAY_ISO } from "@/lib/pd/engines";
import type { ViewerRole } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

export function AlertQueue({
  scope,
  onOpenAthlete,
  onOpenDesk,
}: {
  scope: AlertScope;
  onOpenAthlete?: (id: string) => void;
  onOpenDesk?: (id: string) => void;
}) {
  const { data } = useDevelopment();
  const rows = useMemo(() => buildAlerts(data, scope), [data, scope]);
  const buckets = alertsByBucket(rows);
  return (
    <section className="pd-stack" data-alert-queue={scope.role} data-alert-coach={scope.coachId ?? ""}>
      <div className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Alerts</p>
          <h3 className="mt-2 text-2xl italic">
            {rows.length === 0 ? "Queue is clear." : `${buckets.today.length} today.`}
          </h3>
          <p className="mt-2 text-sm text-fg-soft">
            Arm-health first. Commercial noise waits. Every card is a specific next move.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-muted shadow-border" data-alert-empty="true">
          Nothing in the queue. That’s the point.
        </p>
      ) : (
        (["today", "week", "fyi"] as const).map((bucket) => {
          const list = buckets[bucket];
          if (!list.length) return null;
          return (
            <div key={bucket} data-alert-bucket={bucket}>
              <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                {bucket === "today" ? "Today" : bucket === "week" ? "This week" : "FYI"}
              </p>
              <ul className="grid gap-2">
                {list.map((row, index) => (
                  <AlertCard
                    key={row.id}
                    row={row}
                    first={bucket === "today" && index === 0}
                    onOpenAthlete={onOpenAthlete}
                    onOpenDesk={onOpenDesk}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function AlertCard({
  row,
  first,
  onOpenAthlete,
  onOpenDesk,
}: {
  row: PdAlert;
  first?: boolean;
  onOpenAthlete?: (id: string) => void;
  onOpenDesk?: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-2xl shadow-border",
        row.kind === "health" ? "bg-maroon text-fg-inverse" : "bg-paper-2",
      )}
      data-alert-id={row.id}
      data-alert-kind={row.kind}
      data-alert-first={first ? "true" : undefined}
    >
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">
          {row.kind === "health" ? "Arm / health" : row.kind === "development" ? "Development" : "Commercial"}
        </p>
        <h4 className="mt-1 font-display text-xl uppercase">{row.title}</h4>
        <p className={cn("mt-1 text-sm", row.kind === "health" ? "text-fg-soft" : "text-muted")}>{row.detail}</p>
        <p className="mt-2 text-sm font-semibold">{row.action}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.athleteId && onOpenAthlete ? (
            <Button
              type="button"
              size="sm"
              className="min-h-12"
              variant={row.kind === "health" ? "outline" : "primary"}
              onClick={() => onOpenAthlete(row.athleteId!)}
            >
              Open record
            </Button>
          ) : null}
          {row.desk && onOpenDesk ? (
            <Button type="button" size="sm" variant="outlineDark" className="min-h-12" onClick={() => onOpenDesk(row.desk!)}>
              Open desk
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PointsBoard({
  slice,
  role,
}: {
  slice: AthleteSlice;
  role: ViewerRole;
}) {
  const { creditPoints, verifyPoints, data } = useDevelopment();
  const status = activityPoints(slice);
  const coach = role === "admin" || role === "coach";
  const [note, setNote] = useState("");
  return (
    <div className="pd-stack" data-points-board={slice.athlete.id}>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Activity points · {status.band}
          </p>
          <p className="pd-num mt-2 font-display text-6xl leading-none">
            {status.earned}
            <span className="text-3xl text-powder">/{status.target}</span>
          </p>
          <p className="mt-2 text-sm text-fg-soft">
            {status.met ? "Week is in." : "Not there yet. One type per day — no stacking."}
            {status.pending ? ` ${status.pending} waiting on coach verify.` : ""}
          </p>
        </div>
      </section>
      <ul className="grid gap-2">
        {POINT_ACTIVITIES.map((row) => {
          const logged = alreadyLogged(data.pointsLog, slice.athlete.id, CLUB_DAY_ISO, row.key);
          const high = (HIGH_VALUE_KEYS as readonly string[]).includes(row.key);
          return (
            <li key={row.key} className="pd-row rounded-xl bg-paper-2 shadow-border">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{row.label}</span>
                <span className="pd-num text-maroon">{row.points}</span>
              </span>
              {high ? <span className="mt-1 block text-xs text-muted">Counts after a coach verifies.</span> : null}
              <Button
                type="button"
                size="sm"
                className="mt-2 min-h-12"
                disabled={logged}
                data-log-activity={row.key}
                onClick={() => {
                  const result = creditPoints({ athleteId: slice.athlete.id, key: row.key });
                  setNote(result.ok ? "Logged." : result.reason || "Blocked.");
                }}
              >
                {logged ? "Already today" : row.key === "checkin" ? "Check in" : "Log it"}
              </Button>
            </li>
          );
        })}
      </ul>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      {coach && status.pending ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Verify</p>
            <ul className="mt-2 grid gap-2">
              {slice.pointsLog
                .filter((row) => row.status === "pending")
                .map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {row.date} · {row.reason}
                    </span>
                    <Button type="button" size="sm" className="min-h-12" data-verify-points={row.id} onClick={() => verifyPoints(row.id)}>
                      Verify
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function LeaderboardBoard({
  selfId,
  role,
  familyId,
}: {
  selfId?: string;
  role: ViewerRole;
  familyId?: string;
}) {
  const { data, setLeaderboardOptOut } = useDevelopment();
  const [metric, setMetric] = useState<LbMetricId>("velo");
  const [group, setGroup] = useState("18U");
  const family = data.families.find((row) => row.id === familyId);
  const opted = Boolean(family?.leaderboardOptOut);
  const rows = leaderboardRows(data, metric, group, role === "player" && selfId ? { includeOptOutIds: [selfId] } : undefined);
  const mine = selfId ? ownStanding(data, selfId, metric) : null;
  return (
    <div className="pd-stack" data-leaderboard="true">
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Leaderboard</p>
          <h3 className="mt-2 text-2xl italic">Ranked inside the age group. Never across it.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            No measurement, no row. A blank is never a zero.
          </p>
        </div>
      </section>
      {role === "parent" && family ? (
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-paper-2 px-4 text-sm font-semibold shadow-border">
          <input
            type="checkbox"
            checked={opted}
            onChange={(event) => setLeaderboardOptOut(family.id, event.target.checked)}
          />
          Keep my athlete off the public board. They still see their own standing.
        </label>
      ) : null}
      {mine && (opted || role === "player") ? (
        <p className="rounded-xl bg-navy px-4 py-3 text-sm text-fg-inverse" data-private-standing="true">
          Private standing · {mine.group} · {mine.place ? `#${mine.place} of ${mine.n}` : "no measurement yet"}
          {mine.value != null ? ` · ${mine.value}` : ""}
        </p>
      ) : null}
      <div className="grid gap-2">
        <label className="text-sm font-semibold">
          Metric
          <select
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
            value={metric}
            data-lb-metric="true"
            onChange={(event) => setMetric(event.target.value as LbMetricId)}
          >
            {LB_METRICS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Age group
          <select
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
            value={group}
            data-lb-group="true"
            onChange={(event) => setGroup(event.target.value)}
          >
            {LB_AGE_GROUPS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted" data-empty-state="true">
          Nobody in this group has a measurement. We don’t invent zeros.
          <span className="mt-2 block font-semibold text-maroon">Log a reading on lab day</span>
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "pd-row grid grid-cols-[3rem_1fr_5rem] items-baseline rounded-xl",
                row.id === selfId ? "bg-ink text-fg-inverse" : "bg-paper-2 shadow-border",
              )}
            >
              <span className="pd-num font-display text-xl text-maroon">{String(row.place).padStart(2, "0")}</span>
              <span className="font-semibold">{row.name}</span>
              <span className="pd-num text-right font-display text-xl">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DigestCard({ familyId }: { familyId: string }) {
  const { data } = useDevelopment();
  const family = data.families.find((row) => row.id === familyId);
  if (!family) return null;
  const digest = monthlyDigest(data, family);
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-monthly-digest="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Monthly digest</p>
        <h3 className="mt-2 text-2xl italic">What actually happened.</h3>
        <p className="pd-num mt-3 text-sm">
          <strong>{digest.sessions}</strong> sessions on the month.
        </p>
        <ul className="mt-3 grid gap-2">
          {digest.moved.map((row) => (
            <li key={row.name} className="text-sm">
              <strong>{row.name}.</strong>{" "}
              {row.velo != null ? `${row.velo} mph` : "No velo yet"}
              {row.veloDelta != null ? ` (${row.veloDelta > 0 ? "+" : ""}${row.veloDelta})` : ""}.
              {row.tci != null ? ` TCI ${row.tci}.` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <strong>Watched.</strong>{" "}
          {digest.watched.length ? digest.watched[0].title : "Nothing flagged."}
        </p>
        <p className="mt-2 text-sm">
          <strong>Next.</strong>{" "}
          {digest.next ? `${digest.next.date} · ${digest.next.time}` : "Nothing booked. Offer two times."}
        </p>
      </div>
    </section>
  );
}

export function FamilyThread({
  slice,
  role,
  fromName,
}: {
  slice: AthleteSlice;
  role: ViewerRole;
  fromName: string;
}) {
  const { sendMessage } = useDevelopment();
  const [body, setBody] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const family = familyThread(slice.messages, slice.athlete.id);
  const notes = coachNotes(slice.messages, slice.athlete.id);
  const coach = role === "admin" || role === "coach";
  const canWrite = coach || role === "parent";
  return (
    <div className="pd-stack" data-family-thread={slice.athlete.id}>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Coach ↔ parent</p>
          <h3 className="mt-2 text-2xl italic">The family thread.</h3>
          <p className="mt-2 text-sm text-fg-soft">Coach-only notes never land here.</p>
        </div>
      </section>
      <ul className="grid gap-2">
        {family.length === 0 ? (
          <li className="rounded-xl bg-paper-2 px-4 py-3 text-sm shadow-border" data-empty-state="true">
            <span className="text-muted">No family messages yet.</span>
            <span className="mt-2 block font-semibold text-maroon">Write the first note below</span>
          </li>
        ) : (
          family.map((row) => (
            <li key={row.id} className="pd-row rounded-xl bg-paper-2 shadow-border" data-msg-channel="family">
              <strong>
                {row.fromName} · {row.fromRole}
              </strong>
              <span className="mt-1 block text-sm">{row.body}</span>
              <span className="mt-1 block text-xs text-muted">{row.createdAt}</span>
            </li>
          ))
        )}
      </ul>
      {canWrite ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            sendMessage({
              athleteId: slice.athlete.id,
              fromName,
              fromRole: role,
              body: body.trim(),
              channel: "family",
            });
            setBody("");
          }}
        >
          <textarea
            className="min-h-24 rounded-md border border-line bg-paper-2 px-3 py-2 text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={coach ? "Write the parent." : "Write the coach."}
          />
          <Button type="submit" className="min-h-12">
            Send
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">This thread is between your parent and your coach.</p>
      )}
      {coach ? (
        <section className="rounded-2xl bg-navy text-fg-inverse" data-coach-notes="true">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Coach-only notes</p>
            <p className="mt-1 text-sm text-fg-soft">Families never see this. Not in the thread, not in the digest.</p>
            <ul className="mt-3 grid gap-2">
              {notes.map((row) => (
                <li key={row.id} className="text-sm" data-msg-channel="coach">
                  {row.body}
                </li>
              ))}
            </ul>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!privateNote.trim()) return;
                sendMessage({
                  athleteId: slice.athlete.id,
                  fromName,
                  fromRole: role,
                  body: privateNote.trim(),
                  channel: "coach",
                });
                setPrivateNote("");
              }}
            >
              <textarea
                className="min-h-20 rounded-md border border-fg-inverse/20 bg-ink px-3 py-2 text-sm"
                value={privateNote}
                onChange={(event) => setPrivateNote(event.target.value)}
                placeholder="Private — never sent."
              />
              <Button type="submit" variant="outline" className="min-h-12">
                Save private note
              </Button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
