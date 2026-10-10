import { formatClockTime } from "@/lib/time-display";
import { TimeInput } from "@/components/time-input";
import {useEffect,useState} from 'react';
import {getMyCoach,saveMyAvailability} from '@/lib/coaching-api';
import {coachAvailabilityFields, submittedCoachAvailability} from '@/lib/coach-availability-form';
import {Button} from '@/components/ui/button';
export function CoachProfile({availabilityOnly=false}:{availabilityOnly?:boolean}){const [data,setData]=useState<Awaited<ReturnType<typeof getMyCoach>>>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{void getMyCoach().then(setData).catch(e=>setError(e.message));},[]);
 let fields: ReturnType<typeof coachAvailabilityFields> = []; let availabilityError = ''; try { if(data) fields=coachAvailabilityFields(data.availability); } catch(e) { availabilityError=e instanceof Error?e.message:'Availability could not load.'; }
 return <section className="grid gap-4">{!availabilityOnly&&<><h2 className="text-3xl">Your shared profile</h2><a className="min-h-11 underline" href="/my-profile">Edit my coaching & instructor profile</a></>}{error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}{data?<>
 <h3 className="text-2xl">Weekly availability</h3><p>Current windows: {data.availability.map(w=>`${w.weekday} ${formatClockTime(w.window)}`).join('; ')||'None set'}. Saving replaces your weekly windows.</p>
 <form key={JSON.stringify(data.availability)} className="grid gap-3" onSubmit={async e=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);if(availabilityError)return;setBusy(true);setError('');try{await saveMyAvailability({data:{windows:submittedCoachAvailability(f,fields)}});setData(await getMyCoach());setNotice('Availability saved. Checkout uses these windows.');}catch(e){setError(e instanceof Error?e.message:'Availability did not save.');}finally{setBusy(false);}}}>
 {availabilityError?<p role="alert">{availabilityError}</p>:null}
 {fields.map(field=><fieldset key={field.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3"><legend>{field.label}</legend><label><input name={field.id} type="checkbox" defaultChecked={field.available}/>Available</label><label>Start<TimeInput name={`${field.id}-start`}  defaultValue={field.start}/></label><label>End<TimeInput name={`${field.id}-end`}  defaultValue={field.end}/></label></fieldset>)}<Button type="submit" disabled={busy||Boolean(availabilityError)}>Save weekly availability</Button></form>
 </>:null}</section>;
}
