import { SocialLinks } from "./social-links";
import { Link } from "@tanstack/react-router";
import { CLUB, LINKS } from "@/lib/club";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink px-5 py-10 text-fg-inverse">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <img src="/brand/mark.png" alt="" width={40} height={40} className="size-10 object-contain" />
            <p className="font-semibold">{CLUB.name}</p>
          </div>
          <p className="mt-3 text-sm text-fg-soft">Baseball & softball · Est. {CLUB.established}</p>
          <a className="mt-3 inline-flex min-h-11 items-center text-sm underline" href={LINKS.maps}>
            {CLUB.venueName}
            <br />
            {CLUB.addressLine1}, {CLUB.addressLine2}
          </a>
          <p className="mt-3 text-sm">
            <a className="inline-flex min-h-11 items-center underline" href={`tel:${CLUB.phoneTel}`}>
              {CLUB.phoneDisplay}
            </a>
          </p>
          <p className="mt-2 text-sm text-fg-soft">
            {CLUB.hoursWeekday}
            <br />
            {CLUB.hoursWeekend}
          </p>
        </div>
        <nav aria-label="Programs">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-powder uppercase">Programs</h2>
          <ul className="mt-3 grid gap-1 text-sm">
            <li><Link className="inline-flex min-h-11 items-center underline" to="/teams">Teams</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/training">Training</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/memberships">Memberships</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/tryouts">Tryouts</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/articles">Articles & News</Link></li>
          </ul>
        </nav>
        <nav aria-label="Facility and booking">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-powder uppercase">Facility & booking</h2>
          <ul className="mt-3 grid gap-1 text-sm">
            <li><Link className="inline-flex min-h-11 items-center underline" to="/facility">Facility & Rates</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/book">Book a cage</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/events">Camps & Clinics</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/merchandise">Shop</Link></li>
            <li>
              <Link className="inline-flex min-h-11 items-center underline" to="/games" search={{ view: "watch", game: undefined }}>
                Games
              </Link>
            </li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/visits">Check In / Before You Arrive</Link></li>
          </ul>
        </nav>
        <nav aria-label="Policies & contact">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-powder uppercase">Policies & contact</h2>
          <ul className="mt-3 grid gap-1 text-sm">
            <li><Link className="inline-flex min-h-11 items-center underline" to="/contact">Contact</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/about">About</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/privacy">Privacy</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/terms">Booking terms</Link></li>
            <li><Link className="inline-flex min-h-11 items-center underline" to="/waiver">Annual waiver</Link></li>
          </ul>
          <div className="mt-4">
            <SocialLinks />
          </div>
        </nav>
      </div>
    </footer>
  );
}
