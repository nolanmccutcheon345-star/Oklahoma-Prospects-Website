import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { ClubRecord, Team } from "@/lib/teams/types";
import { cleared, docsComplete, restDays } from "@/lib/teams/pricing";
import { Chip, Section } from "./ui";
import { money } from "./ui";

const FILTERS = ["all", "action", "unsigned", "sizes", "paperwork", "pitchers"] as const;

export function CoachApp({
  club,
  onChange,
  onSave,
}: {
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
  onSave: () => void;
}) {
  const [teamId, setTeamId] = useState(club.teams[0]?.id ?? "");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const team = club.teams.find((t) => t.id === teamId) ?? club.teams[0];
  if (!team) {
    return <p>No teams assigned to this coach.</p>;
  }

  const spent = team.tournamentIds.reduce((sum, id) => {
    const ev = club.catalog.find((e) => e.id === id);
    return sum + (ev?.fee ?? 0);
  }, 0);

  const roster = team.roster.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "unsigned") return !p.agreement.signedAt;
    if (filter === "sizes") return !p.order.submitted;
    if (filter === "paperwork") return !docsComplete(p);
    if (filter === "pitchers") return p.positions.includes("P");
    if (filter === "action")
      return !cleared(p) || !p.order.submitted || !p.rsvp[team.tournamentIds[0] ?? ""];
    return true;
  });

  function patchTeam(next: Team) {
    onChange({
      ...club,
      teams: club.teams.map((t) => (t.id === next.id ? next : t)),
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {club.teams.map((t) => (
          <Chip key={t.id} active={t.id === team.id} onClick={() => setTeamId(t.id)}>
            {t.name}
          </Chip>
        ))}
      </div>
      <p className="text-sm text-muted">
        Roster {team.roster.length}/10 funding
      </p>
      <p className="text-xs text-muted">
        {team.eventBudget
          ? `${Math.round((spent / team.eventBudget) * 100)}% of budget`
          : "No tournament budget"}
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={onSave}>
          Save
        </Button>
        <Button asChild variant="outlineDark">
          <Link to="/training">Player development</Link>
        </Button>
      </div>

      <Section title="Readiness" defaultOpen count={team.roster.filter((p) => !cleared(p)).length}>
        <ul className="grid gap-1 text-sm">
          <li>Unsigned: {team.roster.filter((p) => !p.agreement.signedAt).length}</li>
          <li>Deposits outstanding: {team.roster.filter((p) => !p.depositPaid).length}</li>
          <li>Sizes missing: {team.roster.filter((p) => !p.order.submitted).length}</li>
          <li>Paperwork missing: {team.roster.filter((p) => !docsComplete(p)).length}</li>
          <li>
            Pitchers on rest:{" "}
            {team.pitchLog.filter((o) => restDays(o.pitches) > 0).length}
          </li>
        </ul>
      </Section>

      <Section title="Roster" count={roster.length} defaultOpen>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players"
          className="mb-3 min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
        />
        <div className="mb-3 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
        <ul className="grid gap-2">
          {roster.map((p) => (
            <li key={p.id}>
              <div className="flex min-h-11 items-center justify-between rounded-lg bg-paper px-3 py-2">
                <span>
                  <strong>#{p.number || "—"} {p.name}</strong>
                  <span className="block text-xs text-muted">
                    {p.positions.join("/")} · {cleared(p) ? "Cleared" : "Not cleared"}
                  </span>
                </span>
                <span className="text-sm">{money(p.feeLock?.amount ?? 0)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Schedule">
        <ul className="grid gap-2">
          {club.catalog
            .filter((ev) => ev.ages.includes(team.age) && ev.sport === team.sport)
            .map((ev) => {
              const on = team.tournamentIds.includes(ev.id);
              const nextSpend = spent + (on ? 0 : ev.fee);
              const over = nextSpend > team.eventBudget && !on;
              const share = team.eventBudget
                ? Math.round((ev.fee / team.eventBudget) * 100)
                : 0;
              return (
                <li key={ev.id} className="rounded-lg bg-paper p-3">
                  <p className="font-semibold">
                    {ev.name} · {ev.city}, {ev.state}
                  </p>
                  <p className="text-xs text-muted">
                    {ev.start} · {ev.org} · {share}% of budget
                    {ev.stayToPlay ? " · stay-to-play" : ""}
                  </p>
                  {ev.stayToPlay ? (
                    <p className="mt-1 text-xs text-maroon">
                      Lodging is paid by each family and is not part of the team fee.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 min-h-11 text-sm font-semibold text-maroon"
                    onClick={() => {
                      if (over) return;
                      patchTeam({
                        ...team,
                        tournamentIds: on
                          ? team.tournamentIds.filter((id) => id !== ev.id)
                          : [...team.tournamentIds, ev.id],
                      });
                    }}
                  >
                    {over ? "Ask for more budget" : on ? "Remove" : "Add to schedule"}
                  </button>
                </li>
              );
            })}
        </ul>
      </Section>

      <Section title="Availability">
        {team.tournamentIds.map((id) => {
          const ev = club.catalog.find((e) => e.id === id);
          const counts = { going: 0, maybe: 0, cant: 0, none: 0 };
          team.roster.forEach((p) => {
            const v = p.rsvp[id];
            if (v === "going" || v === "maybe" || v === "cant") counts[v] += 1;
            else counts.none += 1;
          });
          return (
            <div key={id} className="mb-3">
              <p className="font-semibold">{ev?.name}</p>
              <p className="text-sm text-muted">
                Going {counts.going} · Maybe {counts.maybe} · Can't {counts.cant} · No RSVP {counts.none}
              </p>
            </div>
          );
        })}
      </Section>

      <Section title="Uniforms">
        <p className="text-sm text-muted">Approved packages. No prices on this screen.</p>
        <ul className="mt-2 grid gap-2">
          {club.uniforms
            .filter((u) => u.sport === team.sport)
            .map((u) => (
              <li key={u.id} className="rounded-lg bg-paper p-3">
                <strong>{u.name}</strong>
                <span className="block text-sm">{u.items.join(" · ")}</span>
              </li>
            ))}
        </ul>
      </Section>

      <Emergency team={team} />

      <Section title="Pitch counts">
        <ul className="grid gap-2 text-sm">
          {team.pitchLog.map((o) => {
            const p = team.roster.find((x) => x.id === o.playerId);
            return (
              <li key={o.id}>
                {p?.name} · {o.date} · {o.pitches} pitches · {restDays(o.pitches)} day rest
              </li>
            );
          })}
        </ul>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            patchTeam({
              ...team,
              pitchLog: [
                ...team.pitchLog,
                {
                  id: `pi-${Date.now()}`,
                  playerId: String(fd.get("player")),
                  date: String(fd.get("date")),
                  pitches: Number(fd.get("pitches")),
                },
              ],
            });
            e.currentTarget.reset();
          }}
        >
          <select name="player" className="min-h-11 rounded-md border border-line px-3" required>
            {team.roster
              .filter((p) => p.positions.includes("P"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <input name="date" type="date" required className="min-h-11 rounded-md border border-line px-3" />
          <input
            name="pitches"
            type="number"
            min={1}
            required
            placeholder="Pitches"
            className="min-h-11 rounded-md border border-line px-3"
          />
          <Button type="submit">Log outing</Button>
        </form>
      </Section>

      <Section title="Practices and cage credits">
        <p className="text-sm">
          Team cage hours / week: {team.teamCageHoursPerWeek}. Player cage hours / week:{" "}
          {team.playerCageHoursPerWeek}.
        </p>
        <ul className="mt-2 grid gap-2">
          {team.practices.map((pr) => (
            <li key={pr.id} className="rounded-lg bg-paper p-3">
              {pr.date} {pr.time} · {pr.where} · {pr.cageHours}h · {pr.status}
              <div className="mt-2 flex flex-wrap gap-1">
                {(["delayed", "moved", "cancelled", "on"] as const).map((st) => (
                  <Chip
                    key={st}
                    onClick={() =>
                      patchTeam({
                        ...team,
                        practices: team.practices.map((x) =>
                          x.id === pr.id ? { ...x, status: st } : x,
                        ),
                      })
                    }
                  >
                    {st}
                  </Chip>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Attendance">
        {team.practices.map((pr) => (
          <div key={pr.id} className="mb-3">
            <p className="font-semibold">{pr.date}</p>
            <div className="mt-1 grid gap-1">
              {team.roster.map((p) => {
                const mark = team.attendance[pr.id]?.[p.id] ?? "";
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <select
                      value={mark}
                      className="min-h-11 rounded-md border border-line px-2"
                      onChange={(e) => {
                        const att = { ...team.attendance };
                        att[pr.id] = { ...(att[pr.id] ?? {}), [p.id]: e.target.value as never };
                        patchTeam({ ...team, attendance: att });
                      }}
                    >
                      <option value="">—</option>
                      <option value="present">present</option>
                      <option value="late">late</option>
                      <option value="excused">excused</option>
                      <option value="absent">absent</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Chat — group only">
        <p className="text-xs text-muted">No adult-to-player direct messages. One thread per team.</p>
        <ul className="mt-2 grid gap-2">
          {team.messages.map((m) => (
            <li key={m.id} className="rounded-lg bg-paper p-3 text-sm">
              <strong>{m.from}</strong>
              <span className="block">{m.body}</span>
            </li>
          ))}
        </ul>
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = String(new FormData(e.currentTarget).get("body") ?? "");
            patchTeam({
              ...team,
              messages: [
                ...team.messages,
                { id: `m-${Date.now()}`, at: new Date().toISOString(), from: team.headCoach, body },
              ],
            });
            e.currentTarget.reset();
          }}
        >
          <label>Team message<input name="body" maxLength={5000} required className="min-h-11 w-full rounded-md border border-line px-3" /></label>
          <Button type="submit" className="mt-2">
            Post to team
          </Button>
        </form>
      </Section>

      <Section title="Scoring">
        <p>
          Record {team.record.w}-{team.record.l}-{team.record.t}
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            onClick={() => patchTeam({ ...team, record: { ...team.record, w: team.record.w + 1 } })}
          >
            Win
          </Button>
          <Button
            type="button"
            variant="outlineDark"
            onClick={() => patchTeam({ ...team, record: { ...team.record, l: team.record.l + 1 } })}
          >
            Loss
          </Button>
        </div>
        <p className="mt-2 text-sm">
          <a href="https://gc.com" className="text-maroon">
            GameChanger scorebook
          </a>
        </p>
      </Section>

      <Section title="Pay election">
        {team.staff.map((s) => (
          <div key={s.id} className="text-sm">
            <p>
              {s.name} · monthly {money(s.monthly)} · applied to fees {money(s.applyAmount)} · cash{" "}
              {money(Math.max(0, s.monthly - s.applyAmount))}
            </p>
            {!s.w9 ? <p className="text-maroon">contractor record required before the first dollar.</p> : null}
          </div>
        ))}
      </Section>
    </div>
  );
}

function Emergency({ team }: { team: Team }) {
  const [id, setId] = useState(team.roster[0]?.id ?? "");
  const p = team.roster.find((x) => x.id === id);
  return (
    <Section title="Emergency">
      <select
        aria-label="Athlete emergency information"
        value={id}
        onChange={(e) => setId(e.target.value)}
        className="min-h-11 w-full rounded-md border border-line px-3"
      >
        {team.roster.map((pl) => (
          <option key={pl.id} value={pl.id}>
            {pl.name}
          </option>
        ))}
      </select>
      {p ? (
        <div className="mt-3 rounded-lg bg-maroon p-4 text-fg-inverse">
          <p className="font-display text-2xl">{p.name}</p>
          <p>Allergies: {p.emergency.allergies || "none listed"}</p>
          <p>Conditions: {p.emergency.conditions || "none listed"}</p>
          <p>Physician: {p.emergency.physician || "—"}</p>
          <p>Insurance: {p.emergency.insurer} {p.emergency.policyNo}</p>
          {p.parents.map((g) => (
            <p key={g.phone}>
              {g.name} ({g.rel}) · <a href={`tel:${g.phone}`}>{g.phone}</a>
            </p>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
