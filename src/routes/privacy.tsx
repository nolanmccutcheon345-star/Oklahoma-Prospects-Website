import { CLUB } from "@/lib/club";
import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";


export const Route = createFileRoute("/privacy")({head:()=>pageHead("/privacy","Privacy",`How ${CLUB.name} handles household and club account information.`,false), component: PrivacyPage });

function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        Privacy & accessibility
      </p>
      <h1 className="mt-2 text-4xl">Clear information. Easier access.</h1>
      <p className="mt-3 text-muted">
        How this app uses the details you share, and how to get help using it.
      </p>

      <div className="prose mt-8 grid max-w-none gap-6 text-muted">
        <section>
          <h2 className="text-2xl text-ink">Information you share with Prospects</h2>
          <p className="mt-2">We store submitted contact and tryout requests, account and household details, athlete profiles, bookings, waivers and consent records. Training features also store assessments, lesson notes, practice reports, measurements and media you submit. Forms are saved in the club’s system for staff review; they are not only email messages. Please do not put card numbers or unnecessary medical details in contact or tryout notes.</p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Who can see athlete information</h2>
          <p className="mt-2">Household, player, coach, instructor and administrator accounts have different access. Linked guardians and authorized staff use records to manage participation, coaching and club operations. Public team rosters display a player’s name and jersey number only with a current signed public-roster agreement. Private contact details, birth dates and medical information are not part of that public roster. Individual player statistics require authorized team access. Recruiting profiles and media have separate publication controls.</p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Bookings, payments and service providers</h2>
          <p className="mt-2">Square processes enabled online payments. Prospects stores booking, order, payment-status and receipt references used to manage your purchase. Card entry is handled through the payment provider. Hosting, database, authentication and communication services support the site. Email or text notifications may be used for requests, bookings and club operations. Review the terms shown for the service you choose.</p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Sign-in and device storage</h2>
          <p className="mt-2">Sign-in cookies maintain your session. Some features use browser storage for preferences or unfinished work. Sign out on shared devices. External maps, videos and payment services may apply their own privacy notices when you use them.</p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Corrections, consent and record requests</h2>
          <p className="mt-2">A linked parent or guardian can withdraw public-roster consent from the player’s team agreement. Withdrawal removes the player from the public roster on subsequent page loads and does not remove team membership or private records. Contact <a className="underline" href={`mailto:${CLUB.email}`}>{CLUB.email}</a> for help correcting records, requesting deletion, or asking about retention and access. We may need to verify your authority over the account or athlete. Some payment, agreement and operational records may need to be retained; staff will explain what can be changed or removed.</p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Accessibility help</h2>
          <p className="mt-2">
            The design supports keyboard navigation, visible focus, labeled
            forms, adjustable text, and reduced-motion preferences. If something
            prevents you from using the app, visit our {" "}
            <Link to="/contact" className="font-semibold text-maroon">
              contact Prospects
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
