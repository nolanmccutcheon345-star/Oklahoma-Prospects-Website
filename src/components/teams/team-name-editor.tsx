import { useEffect, useRef, useState } from "react";
import type { ClubRecord } from "@/lib/teams/types";

function renamedClub(club: ClubRecord, teamId: string, name: string): ClubRecord {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 150) throw new Error("Enter a team name between 1 and 150 characters.");
  if (!club.teams.some(team => team.id === teamId)) throw new Error("Team no longer exists. Reload before saving.");
  return { ...club, teams: club.teams.map(team => team.id === teamId ? { ...team, name: trimmed } : team) };
}

export function TeamNameEditor({ club, teamId, onSave }: {
  club: ClubRecord;
  teamId: string;
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const team = club.teams.find(item => item.id === teamId);
  const [name, setName] = useState(team?.name ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => { setName(team?.name ?? ""); }, [team?.name, teamId]);
  if (!team) return null;
  return <form className="grid gap-2" aria-label={`Rename ${team.name}`} onSubmit={async event => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setMessage("");
    try {
      const saved = await onSave(renamedClub(club, teamId, name));
      setMessage(saved ? "Team name saved." : "Team name was not saved. Reload if another editor changed the team, then try again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save team name."); }
    finally { busy.current = false; setSaving(false); }
  }}>
    <label className="grid gap-1 text-sm">Team name
      <input required maxLength={150} value={name} disabled={saving} onChange={event => setName(event.target.value)} className="min-h-11 rounded-md border border-line px-3" />
    </label>
    <p className="text-xs text-muted">Renames this existing team without changing its roster or fee draft.</p>
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={saving || !name.trim() || name.trim() === team.name} className="min-h-11 rounded-md border border-line px-3">{saving ? "Saving name…" : "Save team name"}</button>
      <button type="button" disabled={saving} onClick={() => { setName(team.name); setMessage(""); }} className="min-h-11 rounded-md border border-line px-3">Cancel rename</button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
