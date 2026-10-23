import { useEffect, useMemo, useState } from "react";
import type { ClubRecord } from "@/lib/teams/types";
import { getAdminTeamDevelopment, linkTeamDevelopmentRoster, setTeamDevelopmentSelfComplete } from "@/lib/team-development/api";
import { Button } from "@/components/ui/button";

export function TeamDevelopmentAdminPanel({club}:{club:ClubRecord}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof getAdminTeamDevelopment>>>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function load(){setError("");try{setData(await getAdminTeamDevelopment());}catch(e){setError(e instanceof Error?e.message:"Could not load team development.");}}
  useEffect(()=>{void load();},[]);
  const activeLink=useMemo(()=>new Map((data?.links as any[]||[]).filter(l=>!l.ended_at).map(l=>[l.team_id+":"+l.roster_player_id,l.athlete_id])),[data?.links]);
  const selfCompleteByAthlete=useMemo(()=>new Map((data?.settings as any[]||[]).map(s=>[s.athlete_id,s.self_complete_enabled])),[data?.settings]);
  return <div className="grid gap-5">
    <section className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-maroon">Team development</p>
      <h2 className="text-2xl">Program library & approvals</h2>
      <p className="mt-2 text-sm text-muted">Imported seed content remains DRAFT / ESTIMATE. Only ACTIVE versions can be assigned by coaches.</p>
      {error?<p role="alert" className="mt-3 text-sm text-maroon">{error}</p>:null}
      {!data?<p className="mt-3 text-sm">Loading library…</p>:<div className="mt-4 grid gap-2">{(data.programs as any[]).map(program=>{const versions=(data.versions as any[]).filter(v=>v.program_id===program.id);return <article key={program.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{program.name}</strong><span className="text-xs">{program.sport} · {program.category}</span></div><div className="mt-2 flex flex-wrap gap-2">{versions.map(v=><span key={v.program_id+"@"+v.version} className="rounded bg-paper-2 px-2 py-1 text-xs">v{v.version} · {v.status} · {v.data_label}{Array.isArray(v.blocked_fields)&&v.blocked_fields.length?" · blocked":""}</span>)}</div></article>})}{!(data.programs as any[]).length?<p className="text-sm">No team-development seed has been imported yet.</p>:null}</div>}
    </section>
    {data?<section className="rounded-xl border border-line bg-white p-4"><h2 className="text-2xl">Roster linking</h2><p className="mt-2 text-sm text-muted">Link an existing roster player to an existing athlete record. The system never matches by name or email automatically.</p><div className="mt-4 grid gap-3">{club.teams.flatMap(team=>team.roster.map(player=>{const key=team.id+":"+player.id;const linked=activeLink.get(key);return <form key={key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const athleteId=String(fd.get("athleteId")||"");if(!athleteId)return;setBusy(true);setError("");try{await linkTeamDevelopmentRoster({data:{teamId:team.id,rosterPlayerId:player.id,athleteId}});await load();}catch(err){setError(err instanceof Error?err.message:"Link failed.");}finally{setBusy(false);}}}><div><strong>{player.name}</strong><p className="text-xs text-muted">{team.name}</p></div><select name="athleteId" className="office-control" defaultValue={String(linked||"")}><option value="">Not linked</option>{data.athletes.map((a:any)=><option key={a.id} value={a.id}>{a.name}{a.sport?" · "+a.sport:""}</option>)}</select><Button type="submit" disabled={busy}>Save link</Button>{linked?<label className="sm:col-span-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selfCompleteByAthlete.get(String(linked))===true} onChange={async e=>{setBusy(true);setError("");try{await setTeamDevelopmentSelfComplete({data:{athleteId:String(linked),enabled:e.target.checked}});await load();}catch(err){setError(err instanceof Error?err.message:"Could not update self-completion.");}finally{setBusy(false);}}}/> Allow this athlete/guardian account to mark assigned development items complete</label>:null}</form>}))}</div></section>:null}
  </div>;
}
