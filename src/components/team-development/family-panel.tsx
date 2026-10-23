import { useEffect, useState } from "react";
import { TEAM_DEVELOPMENT_FAMILY_DISCLAIMER } from "@/lib/team-development/copy";
import { getFamilyTeamDevelopment } from "@/lib/team-development/api";

export function TeamDevelopmentFamilyPanel({teamId,rosterPlayerId}:{teamId:string;rosterPlayerId:string}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof getFamilyTeamDevelopment>>>();
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;setError("");getFamilyTeamDevelopment({data:{teamId,rosterPlayerId}}).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load development.");});return()=>{active=false;};},[teamId,rosterPlayerId]);
  return <section className="rounded-xl border border-line bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-widest text-maroon">Development</p>
    <h2 className="text-2xl">Team and individual development programming</h2>
    <p className="mt-2 text-sm text-muted">Programs shown here are coach-assigned. Reassessments appear only when performed or scheduled by your coach.</p>
    {error?<p role="alert" className="mt-3 text-sm text-maroon">{error}</p>:!data?<p className="mt-3 text-sm">Loading development…</p>:!data.linked?<p className="mt-3 rounded-lg bg-paper-2 p-3 text-sm">This roster player is not linked to a development record yet. The office can link the existing athlete record; no automatic name or email matching is used.</p>:<>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {["TODAY","PROGRAM","STRENGTH","THROWING & ARM CARE","SKILLS/DRILLS","PROGRESS"].map(tab=><div key={tab} className="rounded-md border px-2 py-2 text-center text-xs font-semibold">{tab}</div>)}
      </div>
      {!data.assignments.length?<p className="mt-4 text-sm">No active team-development program is assigned.</p>:<div className="mt-4 grid gap-2">{data.assignments.map((a:any)=><article key={a.id} className="rounded-lg bg-paper-2 p-3"><strong>{a.program_type}</strong><p className="text-sm text-muted">Coach-assigned {a.scope} program.</p></article>)}</div>}
      {(data.items as any[]).length?<div className="mt-4"><h3 className="font-semibold">Today & upcoming</h3><ul className="mt-2 grid gap-2 text-sm">{(data.items as any[]).map(item=><li key={item.id} className="rounded-lg border p-3">{item.due_date} · {item.state}{item.is_late?" · late":""}</li>)}</ul></div>:null}
      <p className="mt-4 text-xs text-muted">Training guidance is for athletic development and does not diagnose, treat, or clear an injury. If something hurts, stop the affected activity and tell your parent/guardian and coach.</p>
    </>}
  </section>;
}
