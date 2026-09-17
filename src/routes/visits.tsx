import {pageHead} from "@/lib/seo";
import {createFileRoute} from "@tanstack/react-router";
import {FamilyBilling} from "@/components/commerce/family-billing";
import {VisitChecklist} from "@/components/visit-checklist";
import {GoogleReview} from "@/components/google-review";
export const Route=createFileRoute("/visits")({head:()=>pageHead("/visits","Check In","Find your paid bookings and check in to Oklahoma Prospects.",true),component:Visits});
function Visits(){return <main id="main" className="mx-auto max-w-3xl px-5 py-8"><h1 className="text-4xl">Your visits</h1><p className="mt-3">Confirmed bookings are saved to your account. Check in when you arrive.</p><FamilyBilling bookingsOnly/><section className="mt-8"><h2 className="mb-4 text-2xl">Before you arrive</h2><VisitChecklist/></section><div className="mt-8"><GoogleReview/></div></main>;}
