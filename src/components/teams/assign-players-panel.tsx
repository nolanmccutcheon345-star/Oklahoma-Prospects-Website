import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RosterRoleSelect } from "@/components/teams/roster-role-select";
import type { RosterRole } from "@/lib/teams/po-roster";
import type { ClubRecord } from "@/lib/teams/types";
import {
  assignPlayerToTeam,
  getAssignableCandidates,
  setRosterAssignmentStatus,
} from "@/lib/teams/roster-assignment-api";
import type { AssignableCandidate, AssignedMember } from "@/lib/teams/roster-assignment-contracts";

type Workspace = {
  teamId: string;
  teamName: string;
  registrations: AssignableCandidate[];
  accounts: AssignableCandidate[];
  members: AssignedMember[];
};
const field = "min-h-11 rounded-md border border-line px-3";

/** Front Office: place tryout registrations and website-account athletes on a team.
 * Shows names and age/class only; guardian contact is read from the household on the server. */
export function AssignPlayersPanel({ club, onReload }: { club: ClubRecord; onReload: () => Promise<void> }) {
  const ids = useId();
  const [teamId, setTeamId] = useState(club.teams.find((t) => !t.closed)?.id ?? "");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<AssignableCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!teamId) return;
    setError("");
    try {
      setData(await getAssignableCandidates({ data: { teamId } }));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load players.");
    }
  }, [teamId]);
  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...(data?.registrations ?? []), ...(data?.accounts ?? [])];
    return (q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all).slice(0, 40);
  }, [data, query]);

  const run = async (work: () => Promise<{ message: string }>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      setNotice(result.message);
      setSelected(null);
      setReason("");
      setOverride(false);
      await onReload();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const needsReason = Boolean(selected?.otherTeams.length);
  return (
    <section aria-labelledby={`${ids}-title`} className="mt-4 grid gap-3 rounded-xl border border-line bg-paper-2 p-4">
      <h3 id={`${ids}-title`} className="text-lg font-bold text-ink">Assign players</h3>
      <p className="text-sm text-muted">
        Place tryout registrations or website accounts on a team. Only active members receive that team's fee notices and
        announcements; guardian contact comes from the family's household record.
      </p>
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${ids}-team`}>
        Team
        <select id={`${ids}-team`} value={teamId} onChange={(e) => setTeamId(e.target.value)} className={field}>
          {club.teams.filter((t) => !t.closed).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${ids}-search`}>
        Search registrations and accounts
        <input id={`${ids}-search`} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Player name" className={field} autoComplete="off" />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Candidates ({matches.length})</legend>
        {data && matches.length === 0 ? <p className="text-sm text-muted">No unassigned registrations or accounts match.</p> : null}
        <ul className="grid gap-2">
          {matches.map((c) => {
            const id = `${ids}-${c.kind}-${c.id}`;
            return (
              <li key={`${c.kind}:${c.id}`}>
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-paper px-3 py-2">
                  <input id={id} type="radio" name={`${ids}-candidate`} className="h-5 w-5"
                    checked={selected?.kind === c.kind && selected.id === c.id} onChange={() => setSelected(c)} />
                  <span className="grid">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-muted">
                      {c.kind === "registration" ? "Registration" : "Account"} · {c.detail}
                      {c.guardianOnFile ? "" : " · no guardian on file"}
                      {c.otherTeams.length ? ` · already on ${c.otherTeams.join(", ")}` : ""}
                      {c.preferredOtherTeam ? " · asked for another team" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {selected ? (
        <form className="grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          const rosterRole = new FormData(event.currentTarget).get("rosterRole") as RosterRole;
          void run(() => assignPlayerToTeam({ data: {
            teamId,
            source: selected.kind === "registration" ? { kind: "registration", requestId: selected.id } : { kind: "account", athleteId: selected.id },
            rosterRole,
            additionalTeamReason: reason,
            acknowledgePreferenceOverride: override,
          } }));
        }}>
          <p className="text-sm">Assign <strong>{selected.name}</strong> to {data?.teamName}.</p>
          <RosterRoleSelect teamId={teamId} />
          {needsReason ? (
            <label className="grid gap-1 text-sm font-semibold" htmlFor={`${ids}-reason`}>
              Reason for a second team (required)
              <textarea id={`${ids}-reason`} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} py-2`} />
            </label>
          ) : null}
          {selected.preferredOtherTeam ? (
            <label className="flex min-h-11 items-center gap-2 text-sm" htmlFor={`${ids}-override`}>
              <input id={`${ids}-override`} type="checkbox" className="h-5 w-5" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              The family asked for a different team — place them here anyway
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !selected.guardianOnFile}>Assign to team</Button>
            <Button type="button" variant="outlineDark" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {data?.members.length ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Current roster</h4>
          <ul className="grid gap-2">
            {data.members.map((m) => (
              <li key={m.playerId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-2">
                <span>
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-xs text-muted"> · {m.status === "removed" ? "Removed — gets no team email" : m.status}{m.roleType === "po" ? " · PO" : ""}{m.otherTeams.length ? ` · also on ${m.otherTeams.join(", ")}` : ""}</span>
                </span>
                {m.status === "removed" ? (
                  <Button type="button" variant="outlineDark" disabled={busy} aria-label={`Reinstate ${m.name}`}
                    onClick={() => {
                      const extra = m.otherTeams.length ? window.prompt("Reason for a second live team (at least 10 characters)") ?? "" : "";
                      void run(() => setRosterAssignmentStatus({ data: { teamId, playerId: m.playerId, status: "active", reason: "", additionalTeamReason: extra } }));
                    }}>Reinstate</Button>
                ) : (
                  <Button type="button" variant="outlineDark" disabled={busy} aria-label={`Remove ${m.name} from ${data.teamName}`}
                    onClick={() => {
                      if (!window.confirm(`Remove ${m.name} from ${data.teamName}? They will stop receiving this team's notices.`)) return;
                      void run(() => setRosterAssignmentStatus({ data: { teamId, playerId: m.playerId, status: "removed", reason: "Front Office removal", additionalTeamReason: "" } }));
                    }}>Remove</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notice ? <p role="status" className="text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-maroon">{error}</p> : null}
    </section>
  );
}
