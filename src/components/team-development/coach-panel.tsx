import { useEffect, useMemo, useState } from "react";
import type { ClubRecord } from "@/lib/teams/types";
import { assignTeamDevelopment, endTeamDevelopment, getCoachTeamDevelopment } from "@/lib/team-development/api";
import { Button } from "@/components/ui/button";

type Desk = Awaited<ReturnType<typeof getCoachTeamDevelopment>>;

export function TeamDevelopmentCoachPanel({ club }: { club: ClubRecord }) {
  const [teamId,setTeamId]=useState(club.teams[0]?.id||"");
  const [desk,setDesk]=useState<Desk>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [programId,setProgramId]=useState("");
  const [programType,setProgramType]=useState("strength");
  const [scope,setScope]=useState<"team"|"position"|"selected"|"override">("team");
  const [position,setPosition]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const team=club.teams.find(t=>t.id===teamId)||club.teams[0];
  const linkedByRoster=useMemo(()=>new Map((desk?.links||[]).map((x:any)=>[x.roster_player_id,x.athlete_id])),[desk?.links]);
  const template=(desk?.templates as any[]|undefined)?.find(t=>t.id===programId);

  async function load(id=teamId){
    if(!id)return;
    setError("");
    try{
      const next=await getCoachTeamDevelopment({data:{teamId:id}});
      setDesk(next);
      const first=(next.templates as any[])[0];
      setProgramId(current=>(next.templates as any[]).some(t=>t.id===current)?current:first?.id||"");
    }catch(e){setError(e instanceof Error?e.message:"Could not load team development.");}
  }
  useEffect(()=>{void load(teamId);},[teamId]);

  if(!team)return null;
  const positions=[...new Set(team.roster.flatMap(p=>p.positions))].filter(Boolean);
  const linkedPlayers=team.roster.flatMap(player=>{
    const athleteId=linkedByRoster.get(player.id);
    return athleteId?[{player,athleteId:String(athleteId)}]:[];
  });

  return <section className="rounded-xl border border-line bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-maroon">Team development</p><h2 className="text-2xl">Development</h2><p className="text-sm text-muted">Assign approved strength, throwing, arm-care and drill programs. DRAFT content never appears here.</p></div>
      <select className="office-control max-w-xs" value={team.id} onChange={e=>setTeamId(e.target.value)}>
        {club.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
    {error?<p role="alert" className="mt-3 text-sm text-maroon">{error}</p>:null}
    {!desk?<p className="mt-3 text-sm">Loading development…</p>:
      !(desk.templates as any[]).length?<p className="mt-4 rounded-lg bg-paper-2 p-3 text-sm">No ACTIVE Prospects templates are available yet. Draft seed programs remain unavailable until the required reviews and named human sign-off are complete.</p>:
      <form className="mt-4 grid gap-3" onSubmit={async e=>{
        e.preventDefault(); if(!template)return; setBusy(true);setError("");
        try{
          const fd=new FormData(e.currentTarget);
          await assignTeamDevelopment({data:{
            teamId:team.id,programType,scope,programId:template.id,programVersion:Number(template.version),
            startDate:String(fd.get("startDate")||""),endDate:String(fd.get("endDate")||"")||undefined,
            inheritNewPlayers:Boolean(fd.get("inherit")),position:scope==="position"?position:undefined,
            athleteIds:scope==="selected"||scope==="override"?selected:undefined,
          }});
          setSelected([]); await load(team.id);
        }catch(err){setError(err instanceof Error?err.message:"Assignment failed.");}
        finally{setBusy(false);}
      }}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold">Program<select className="office-control" value={programId} onChange={e=>setProgramId(e.target.value)}>{(desk.templates as any[]).map(t=><option key={t.id+"@"+t.version} value={t.id}>{t.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Program type<select className="office-control" value={programType} onChange={e=>setProgramType(e.target.value)}><option value="strength">Strength</option><option value="throwing">Throwing</option><option value="arm_care">Throwing & arm care</option><option value="skills">Skills / drills</option></select></label>
          <label className="text-sm font-semibold">Scope<select className="office-control" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="team">Team</option><option value="position">Position group</option><option value="selected">Selected players</option><option value="override">Individual override</option></select></label>
        </div>
        {scope==="position"?<label className="text-sm font-semibold">Position<select className="office-control" value={position} onChange={e=>setPosition(e.target.value)}><option value="">Choose position</option>{positions.map(p=><option key={p}>{p}</option>)}</select></label>:null}
        {scope==="selected"||scope==="override"?<fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Players</legend><div className="grid gap-2 sm:grid-cols-2">{linkedPlayers.map(({player,athleteId})=><label key={athleteId} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selected.includes(athleteId)} onChange={e=>setSelected(v=>e.target.checked?[...v,athleteId]:v.filter(x=>x!==athleteId))}/>{player.name}</label>)}</div></fieldset>:null}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Start date<input className="office-control" name="startDate" type="date" required/></label><label className="text-sm font-semibold">End date<input className="office-control" name="endDate" type="date"/></label></div>
        {scope==="team"?<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="inherit"/> Inherit new roster links added during this assignment</label>:null}
        <Button type="submit" disabled={busy}>{busy?"Assigning…":"Assign development program"}</Button>
      </form>}
    {desk&&(desk.assignments as any[]).length?<div className="mt-5"><h3 className="font-semibold">Current and historical assignments</h3><div className="mt-2 grid gap-2">{(desk.assignments as any[]).map(a=><article key={a.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><strong>{a.program_id}</strong> · {a.program_type} · {a.scope} · {a.status}</span>{a.status==="active"?<button className="underline" onClick={async()=>{try{await endTeamDevelopment({data:{assignmentId:a.id}});await load(team.id);}catch(e){setError(e instanceof Error?e.message:"Could not end assignment.");}}}>End</button>:null}</div></article>)}</div></div>:null}
  </section>;
}
