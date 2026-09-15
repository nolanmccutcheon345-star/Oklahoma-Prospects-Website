import {useEffect,useState} from 'react';
import {getOfficeRequests,closeOfficeRequest} from '@/lib/portal-api';
import {Button} from '@/components/ui/button';
export function OfficeRequests(){
 const [rows,setRows]=useState<Awaited<ReturnType<typeof getOfficeRequests>>>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setRows(await getOfficeRequests());}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 return <section className="my-6 grid gap-3"><h2 className="text-3xl">Registrations & requests</h2>{error?<p role="alert">{error}</p>:null}{!rows.length&&!error?<p>No submitted requests.</p>:null}{rows.map(r=><article key={r.id} className="rounded-xl border p-4"><h3 className="text-xl">{r.kind} · {r.status}</h3><p>{new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'})}</p><dl>{Object.entries(r.payload).filter(([key])=>key!=='requestId').map(([key,value])=><div key={key} className="mt-1 break-words"><dt className="font-semibold">{key}</dt><dd>{typeof value==='string'||typeof value==='number'?String(value):JSON.stringify(value)}</dd></div>)}</dl>{r.status==='open'?<Button className="mt-3" variant="outlineDark" disabled={busy} onClick={async()=>{setBusy(true);try{await closeOfficeRequest({data:{id:r.id}});await load();}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}}>Mark request resolved</Button>:null}</article>)}</section>;
}
