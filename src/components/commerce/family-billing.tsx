import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getFamilyBilling, getBillingHistoryPage, claimPurchases, stopAutoRenew, openBillingPortal, askForPause, getRefundPreview, requestRefund, checkInBooking } from "@/lib/commerce/portal-api";
import { formatMoney } from "@/lib/pricing";
import {HouseholdAccess} from "@/components/household-access";
import {Participants} from "./operations";
import {AddAthlete} from "./athletes";
import { CreditBooking } from "./credit-booking";
import { Button } from "@/components/ui/button";
const dateText = (value: Date|string) => new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
export function FamilyBilling({bookingsOnly=false}:{bookingsOnly?:boolean}) {
  const user=useCurrentUser(); const [data,setData]=useState<Awaited<ReturnType<typeof getFamilyBilling>>>();
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof getRefundPreview>>|null>(null);
  const [historyPage,setHistoryPage]=useState(0);
  async function load(){setData(await getFamilyBilling());setHistoryPage(0);}
  async function loadOlder(){setBusy(true);setError('');try{const next=await getBillingHistoryPage({data:{page:historyPage+1}});setData(current=>current?{...current,orders:[...current.orders,...next.orders],bookings:[...current.bookings,...next.bookings],invoices:[...current.invoices,...next.invoices],historyHasMore:next.historyHasMore}:next);setHistoryPage(p=>p+1);}catch(e){setError(e instanceof Error?e.message:'Could not load older records.');}finally{setBusy(false);}}
  useEffect(()=>{if(user) void load().catch(e=>setError(e instanceof Error?e.message:"Billing could not load."));},[user]);
  async function action(work:()=>Promise<unknown>,message:string){if(busy)return;setBusy(true);setError("");setNotice("");try{await work();await load();setNotice(message);}catch(e){setError(e instanceof Error?e.message:"Changes did not save. Please retry.");await load().catch(()=>undefined);}finally{setBusy(false);}}
  if(!user)return <section className="my-6"><p><Link to="/login" search={{next:"/family"}} className="underline">Sign in</Link> to see your bookings, receipts, memberships, and billing history across devices.</p></section>;
  return <section className="my-6 grid gap-5" aria-label="Bookings and billing">
    <h2 className="text-3xl">{bookingsOnly?"Your confirmed visits":"Bookings & billing"}</h2>
    {error?<p role="alert" className="rounded-lg border border-maroon p-3 text-maroon">{error}</p>:null}
    {notice?<p role="status" className="rounded-lg bg-paper-2 p-3">{notice}</p>:null}
    {!data&&!error?<p role="status">Loading saved records…</p>:null}
    {!bookingsOnly?<Button variant="outlineDark" disabled={busy} onClick={()=>{void action(()=>claimPurchases(),"Guest purchases connected to your verified account.");}}>Connect my guest purchases</Button>:null}
    {data?.bookings.length===0?<p>No bookings yet. <Link to="/book" className="underline">Reserve a cage</Link> or <Link to="/training" className="underline">choose an assessment</Link>.</p>:null}
    {data?.bookings.map(b=><article key={b.id} className="rounded-xl border p-4"><h3 className="text-xl">{data.orders.find(o=>o.id===b.order_id)?.snapshot.title || "Training session"}</h3><p>{dateText(b.starts_at)} · {b.status}</p>{b.completion_recap?<p className="mt-3"><strong>Coach recap:</strong> {b.completion_recap}</p>:null}
      {b.status==="confirmed"?<div className="mt-3 flex flex-wrap gap-3"><Button disabled={busy||Boolean(b.checked_in_at)} onClick={()=>{void action(()=>checkInBooking({data:{id:b.id}}),"Check-in saved.");}}>{b.checked_in_at?"Checked in":"Check in"}</Button><Button variant="outlineDark" disabled={busy} onClick={()=>{void action(async()=>{setPreview(await getRefundPreview({data:{id:b.order_id}}));},"");}}>Cancel / see refund</Button></div>:null}
      {b.status==="confirmed"&&!b.checked_in_at?<><Participants id={b.id} count={b.participant_count} athletes={data.athletes} onSaved={load}/><Link to="/waiver" className="inline-flex min-h-11 items-center underline">Sign annual waivers</Link></>:null}
    </article>)}
    {preview?<div role="region" aria-label="Refund preview" className="rounded-xl border border-maroon p-4"><h3 className="text-xl">Cancellation preview</h3><p>{preview.requiresReview?"This package or membership refund needs front-office review of the current period and used credits. No refund amount is promised until reviewed.":`Paid ${formatMoney(preview.paidCents)} · refund ${formatMoney(preview.refundCents || 0)} under the 48/24-hour policy.`}</p><div className="mt-3 flex gap-3"><Button disabled={busy} onClick={()=>{void action(async()=>{await requestRefund({data:{id:preview.orderId}});setPreview(null);},preview.requiresReview?"Refund review requested.":"Cancellation saved. Any refund is returning to the original card.");}}>{preview.requiresReview?"Request refund review":"Confirm cancellation"}</Button><Button variant="outlineDark" onClick={()=>setPreview(null)}>Keep booking</Button></div></div>:null}
    {!bookingsOnly&&data?<>
      <h3 className="text-2xl">Athletes</h3>{data.athletes.map(a=><p key={a.id}>{a.name} · {a.assessment_complete?"Assessment completed — lessons unlocked":"Assessment needed — ordinary lessons locked"}</p>)}<AddAthlete onSaved={load}/><Link to="/waiver" className="underline">Annual waiver</Link>
      <HouseholdAccess/>
      <h3 className="text-2xl">Memberships</h3>{!data.subscriptions.length?<p>No recurring memberships yet.</p>:null}
      {data.subscriptions.map(s=><article className="rounded-xl border p-4" key={s.id}><h4 className="text-xl">{data.orders.find(o=>o.product_id===s.product_id)?.snapshot.title || s.product_id}</h4><p>{formatMoney(s.amount_cents)} monthly · {s.status}</p><p>{s.cancel_at_period_end?"Auto-renew stopped. Current period ends":"Next renewal"}: {dateText(s.period_end)}</p><div className="mt-3 flex flex-wrap gap-3">
        <Button variant="outlineDark" disabled={busy||s.cancel_at_period_end||s.status==="canceled"} onClick={()=>{void action(()=>stopAutoRenew({data:{id:s.id}}),"Auto-renew stopped. Your current paid period remains on your account.");}}>Stop auto-renew</Button>
        <Button variant="outlineDark" disabled={busy} onClick={()=>{void action(async()=>{const result=await openBillingPortal({data:{id:s.id}});window.location.assign(result.url);},"");}}>Payment method & invoices</Button></div>
        <form className="mt-4 grid gap-2" onSubmit={e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get("reason")||"");void action(()=>askForPause({data:{id:s.id,reason}}),"Pause request saved. Billing changes are pending front-office confirmation.");}}><label>Injury or extended absence<textarea name="reason" required minLength={3} maxLength={1000} className="mt-1 w-full rounded-lg border p-3"/></label><Button variant="outlineDark" type="submit" disabled={busy}>Request a pause</Button>{s.pause_requested_at?<p>Pause requested; awaiting billing confirmation.</p>:null}</form>
      </article>)}
      <h3 className="text-2xl">Available credits</h3>{data.credits.length?<ul className="grid gap-2">{data.credits.map(c=><li key={c.id} className="rounded-lg bg-paper-2 p-3">{c.remaining} {c.kind === "cage-minutes"?"cage minutes":c.kind === "remote-review"?"video reviews":`${c.minutes}-minute sessions`}{c.rollover?" · carried from last month":""} · expires {dateText(c.expires_at)}<CreditBooking credit={c} onSaved={load}/></li>)}</ul>:<p>No unused credits.</p>}
      <h3 className="text-2xl">Receipts & billing history</h3>{!data.orders.length&&!data.invoices.length?<p>No payments recorded.</p>:null}
      {data.orders.map(o=><article key={o.id} className="rounded-xl border p-4"><p className="font-semibold">{o.snapshot.title} · {formatMoney(o.total_cents)}</p><p>{dateText(o.created_at)} · {o.status}</p>{o.receipt_url?<a className="inline-flex min-h-11 items-center underline" href={o.receipt_url}>Receipt</a>:null}{o.status==="refunding"?<Button variant="outlineDark" disabled={busy} onClick={()=>{void action(()=>requestRefund({data:{id:o.id}}),"Refund confirmation refreshed.");}}>Retry refund confirmation</Button>:null}{o.status==="paid"&&o.snapshot.kind==="package"?<Button variant="outlineDark" disabled={busy} onClick={()=>{void action(async()=>{setPreview(await getRefundPreview({data:{id:o.id}}));},"");}}>Request refund</Button>:null}</article>)}
      {data.invoices.map(i=><p key={i.id}>{dateText(i.created_at)} · {formatMoney(i.amount_cents)} · {i.status} {i.invoice_url?<a className="inline-flex min-h-11 items-center underline" href={i.invoice_url}>View invoice</a>:null}</p>)}
    </>:null}
    {data?.historyHasMore?<Button variant="outlineDark" disabled={busy} onClick={()=>void loadOlder()}>Load older records</Button>:null}
  </section>;
}
