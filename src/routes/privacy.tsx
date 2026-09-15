import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CLUB } from "@/lib/club";

export const Route = createFileRoute("/privacy")({head:()=>pageHead("/privacy","Privacy","How Oklahoma Prospects handles household and club account information.",false), component: PrivacyPage });

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
          <h2 className="text-2xl text-ink">Information you provide</h2>
          <p className="mt-2">
            Contact and team inquiry forms ask for the details shown on the form
            so Prospects can respond. Please avoid including sensitive medical
            or payment information in these messages. Drafts stay on this phone
            and are emailed to {CLUB.email} when you send them.
          </p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Bookings and payments</h2>
          <p className="mt-2">
            Cage rentals, lessons, camps, and memberships use the Prospects
            booking site. Waivers, check-in, and uniform sizing open separate
            Prospects services. Review the information shown in those services
            before submitting.
          </p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">Accessibility help</h2>
          <p className="mt-2">
            The design supports keyboard navigation, visible focus, labeled
            forms, adjustable text, and reduced-motion preferences. If something
            prevents you from using the app, call or text{" "}
            <a href={`tel:${CLUB.phoneTel}`} className="font-semibold text-maroon">
              {CLUB.phoneDisplay}
            </a>{" "}
            or{" "}
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
