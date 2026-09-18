import {pageHead} from "@/lib/seo";
import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {useCurrentUser} from '@/lib/auth/use-current-user';
import {getFamilyBilling} from '@/lib/commerce/portal-api';
import {getMyWaivers,saveAnnualWaiver} from '@/lib/portal-api';
import {WAIVER_PARAGRAPHS} from '@/lib/waiver-content';
import {PageHero} from '@/components/page-hero';
import {Button} from '@/components/ui/button';
import {AddAthlete} from '@/components/commerce/athletes';
export const Route=createFileRoute('/waiver')({head:()=>pageHead("/waiver","Annual Facility Waiver","Read and sign the annual facility waiver for athletes in your household.",true),component:Waiver});
function Waiver(){
 const user=useCurrentUser();const [athletes,setAthletes]=useState<Awaited<ReturnType<typeof getFamilyBilling>>['athletes']>([]);const [waivers,setWaivers]=useState<Awaited<ReturnType<typeof getMyWaivers>>>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 async function load(){const [billing,records]=await Promise.all([getFamilyBilling(),getMyWaivers()]);setAthletes(billing.athletes);setWaivers(records);}
 useEffect(()=>{if(user)void load().catch(e=>setError(e.message));},[user?.id]);
 return <main id="main"><PageHero eyebrow="Required before you train" title="One waiver." accent="One year." copy="Parent or guardian signs for athletes under 18. This is the Oklahoma Prospects facility waiver." compact/>
 <section className="mx-auto grid max-w-3xl gap-5 px-5 py-8"><article className="rounded-xl bg-ink p-5 text-fg-inverse"><h2 className="text-2xl">Facility Waiver & Release</h2>{WAIVER_PARAGRAPHS.map(p=><p className="mt-3" key={p}>{p}</p>)}</article>
 {!user?<p><Link to="/login" search={{next:'/waiver'}} className="underline">Sign in or create an account</Link> to attach a signed waiver to your athlete.</p>:<>
 {waivers.map(w=><p role="status" key={w.id}>{w.athlete_name} · signed by {w.signer_name} · valid through {new Date(w.expires_at).toLocaleDateString('en-US',{timeZone:'America/Chicago'})}</p>)}<AddAthlete onSaved={load}/>
 <form className="grid gap-4" onSubmit={async e=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');try{if(f.get('consent')!=='on')throw new Error('Please agree to the waiver before signing.');await saveAnnualWaiver({data:{athleteId:String(f.get('athlete')),adultName:String(f.get('adultName')),adultPhone:String(f.get('adultPhone')),participantType:f.get('participantType') as 'adult'|'minor',emergencyName:String(f.get('emergencyName')),emergencyPhone:String(f.get('emergencyPhone')),signerName:String(f.get('signerName')),relationship:f.get('relationship') as 'self'|'parent'|'legal-guardian',medicalNotes:String(f.get('medicalNotes')||''),consent:true}});await load();setSaved(true);}catch(e){setError(e instanceof Error?e.message:'Waiver did not save.');}finally{setBusy(false);}}}>
 <label>Athlete<select name="athlete" defaultValue="" required><option value="">Choose an athlete</option>{athletes.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
 {([['adultName','Responsible adult name'],['adultPhone','Adult mobile'],['emergencyName','Emergency contact'],['emergencyPhone','Emergency phone'],['signerName','Electronic signature (full legal name)']] as const).map(([name,label])=><label key={name}>{label}<input name={name} required maxLength={120} type={name.includes('Phone')?'tel':'text'}/></label>)}
 <label>Participant<select name="participantType" required defaultValue=""><option value="">Choose participant type</option><option value="minor">Minor (under 18)</option><option value="adult">Adult (18 or older)</option></select></label>
 <label>Relationship to participant<select name="relationship" required defaultValue=""><option value="">Choose relationship</option><option value="parent">Parent</option><option value="legal-guardian">Legal guardian</option><option value="self">Adult participant signing for myself</option></select></label>
 <label>Medical information staff should know (optional)<textarea name="medicalNotes" maxLength={2000}/></label>
 <label className="flex items-start gap-3"><input type="checkbox" name="consent" required/>I have read the Facility Waiver & Release above, understand sports training involves risk of injury, and I am legally authorized to sign.</label>
 <Button type="submit" disabled={busy}>{busy?'Saving…':'Sign the annual waiver'}</Button><p>Saved to your household account for check-in across devices.</p></form></>}
 {error?<p role="alert" className="text-maroon">{error}</p>:null}{saved?<p role="status">Your signed waiver is saved.</p>:null}
 </section></main>;
}
