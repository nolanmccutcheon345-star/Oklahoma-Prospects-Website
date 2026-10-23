import { useEffect, useState } from "react";
import { getAthleteTeamDevelopment } from "@/lib/team-development/api";

const TABS = ["TODAY","PROGRAM","STRENGTH","THROWING & ARM CARE","SKILLS/DRILLS","PROGRESS"] as const;

export function TeamDevelopmentAthletePanel({athleteId}:{athleteId:string}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof getAthleteTeamDevelopment>>>();
  const [error,setError]=useState("");
  const [tab,setTab]=useState<(typeof TABS)[number]>("TODAY");
  useEffect(()=>{let active=true;setData(undefined);setError("");getAthleteTeamDevelopment({data:{athleteId}})
    .then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load team development.");});
    return()=>{active=false;};},[athleteId]);
  const assignments=(data?.assignments||[]) as Array<{id:string;program_type:string;scope:string;teamId:string}>;
  const visible=tab==="STRENGTH"?assignments.filter(a=>a.program_type==="strength"):
    tab==="THROWING & ARM CARE"?assignments.filter(a=>["throwing","arm_care"].includes(a.program_type)):
    tab==="SKILLS/DRILLS"?assignments.filter(a=>a.program_type==="skills"):assignments;
  return <section className="grid gap-4 rounded-xl border border-line bg-white p-4" aria-label="Team development">
    <header><p className="text-xs uppercase tracking-widest text-maroon">Development</p><h3 className="text-2xl">Team and individual development programming</h3><p className="text-sm text-muted">Coach-assigned team, position-group and individual development appears here alongside your existing training.</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Development sections">{TABS.map(t=><button key={t} type="button" className={"min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold "+(tab===t?"bg-maroon text-white":"bg-white")} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    {error?<p role="alert" className="text-sm text-maroon">{error}</p>:!data?<p role="status">Loading team development…</p>:<>
      {tab==="TODAY"?<div className="grid gap-2">{(data.items as any[]).length?(data.items as any[]).map(item=><article className="rounded-lg bg-paper-2 p-3 text-sm" key={item.id}><strong>{item.due_date}</strong> · {item.state}{item.is_late?" · late":""}</article>):<p className="text-sm">No team-development items are due.</p>}</div>:null}
      {tab!=="TODAY"&&tab!=="PROGRESS"?<div className="grid gap-2">{visible.length?visible.map(a=><article className="rounded-lg bg-paper-2 p-3" key={a.id}><strong>{a.program_type.replace("_"," ")}</strong><p className="text-sm text-muted">{a.scope} assignment · team {a.teamId}</p></article>):<p className="text-sm">No active programs in this section.</p>}</div>:null}
      {tab==="PROGRESS"?<div className="grid gap-2"><p className="text-sm">{(data.items as any[]).filter(i=>i.state==="completed").length} completed development items recorded.</p>{(data.reassessments as any[]).filter(r=>r.scheduled_on||r.performed_on).map(r=><article key={r.id} className="rounded-lg bg-paper-2 p-3 text-sm">Reassessment {r.performed_on?"performed "+r.performed_on:r.scheduled_on?"scheduled "+r.scheduled_on:""}</article>)}</div>:null}
      <p className="text-xs text-muted">Athletic development guidance is not medical care. If something hurts, stop the affected activity and tell your parent/guardian and coach.</p>
    </>}
  </section>;
}
