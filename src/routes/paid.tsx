import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getOrderStatus } from "@/lib/commerce/api";
import { formatMoney } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/paid")({head:()=>pageHead("/paid","Payment Status","Check the verified status of your Oklahoma Prospects payment.",true),
  validateSearch: (search: Record<string,unknown>) => ({session_id: typeof search.session_id === "string" ? search.session_id : ""}), component: Paid,
});
function Paid() {
  const {session_id} = Route.useSearch();
  const [status,setStatus] = useState("pending"); const [amount,setAmount] = useState(0); const [error,setError] = useState("");
  useEffect(()=>{
    if (!session_id) { setError("No payment reference was supplied. Open billing history to see your purchases."); return; }
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try { const result = await getOrderStatus({data:{sessionId:session_id}}); if (!active) return;
        setStatus(result.status); setAmount(result.total_cents);
        if (result.status === "pending") timer = setTimeout(()=>{void check();},3000);
      } catch { if (active) setError("Payment confirmation could not load. Your card has not been charged again. Check billing history or contact the desk."); }
    };
    void check(); return ()=>{active=false;clearTimeout(timer);};
  },[session_id]);
  return <main id="main" className="mx-auto max-w-2xl px-5 py-12"><h1 className="text-4xl">{status === "paid" ? "Payment confirmed" : status === "payment_review" ? "We’re reviewing your booking" : status === "failed" ? "Payment wasn’t completed" : status === "refunded" ? "Payment refunded" : "Checking your payment"}</h1>
    <p className="my-5" role="status">{status === "paid" ? `${formatMoney(amount)} received. Your saved booking and receipt are in your account. An assessment stays incomplete until your coach completes it.` : status === "payment_review" ? "Your payment arrived after the reservation hold ended. The front desk will arrange a refund or a new time; this booking is not confirmed." : "This page waits for verified payment confirmation. Returning here does not mark an order paid."}</p>
    {error ? <p role="alert" className="text-maroon">{error}</p> : null}
    <div className="flex flex-wrap gap-3"><Button asChild><Link to="/family">Open billing history</Link></Button><Button variant="outline" asChild><Link to="/login" search={{next:"/family"}}>Create or sign into your account</Link></Button></div>
    <p className="mt-5">Guest purchase? Verify the same email on your account, then use “Connect my guest purchases” in billing.</p>
  </main>;
}
