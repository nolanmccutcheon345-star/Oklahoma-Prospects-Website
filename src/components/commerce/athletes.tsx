import {useState} from 'react';
import {createAthlete} from '@/lib/portal-api';
import {chicagoDate} from '@/lib/scheduling';
import {Button} from '@/components/ui/button';
export function AddAthlete({onSaved}:{onSaved:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 return <div><Button variant="outlineDark" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>Add an athlete</Button>{open?<form className="mt-3 grid gap-3 rounded-xl border p-4" onSubmit={async e=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');try{await createAthlete({data:{requestId,name:String(f.get('name')),birthDate:String(f.get('birthDate')),sport:f.get('sport') as 'baseball'|'softball',throws:f.get('throws') as 'R'|'L',bats:f.get('bats') as 'R'|'L'}});await onSaved();setOpen(false);setRequestId(crypto.randomUUID());}catch(e){setError(e instanceof Error?e.message:'Athlete did not save.');}finally{setBusy(false);}}}>
 <label>Athlete’s full name<input name="name" required maxLength={120}/></label><label>Date of birth<input type="date" name="birthDate" required max={chicagoDate()}/></label>
 <label>Sport<select name="sport" required defaultValue=""><option value="">Choose sport</option><option value="baseball">Baseball</option><option value="softball">Softball</option></select></label>
 {(['throws','bats'] as const).map(key=><label key={key}>{key==='throws'?'Throws':'Bats'}<select name={key} required defaultValue=""><option value="">Choose hand</option><option value="R">Right</option><option value="L">Left</option></select></label>)}
 {error?<p role="alert">{error}</p>:null}<Button type="submit" disabled={busy}>{busy?'Saving…':'Save athlete'}</Button></form>:null}</div>;
}
