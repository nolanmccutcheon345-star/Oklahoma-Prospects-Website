# Oklahoma Prospects — marketing site

Scope: [prospectsbaseball.club](https://prospectsbaseball.club) marketing site.
Booking, the player development portal, and hosted family tools are linked,
not rebuilt here.

## Redirects (one club hostname)

Live today:

| Host | What families get |
| --- | --- |
| prospectsbaseball.club | this site |
| www.prospectsbaseball.club | 301 → prospectsbaseball.club |
| book.prospectsbaseball.club (any path) | 301 → /book on the club site |
| app.prospectsbaseball.club (any path) | 301 → /training on the club site |

Those 301s are in `booking-site/_redirects` and
`booking-site/development/_redirects`. Leave them. A deploy of the old
booking HTML without those files would bring the split-brand sites back.

To send **all** of this traffic to the phone app instead: publish the app,
then replace the destinations with that public host (force 301, keep the path
with `:splat` on the club domain). Do not point the club domain at a URL that
is not live — that takes the site down.

## Session 2 (conversion)

Shipped on this repository:

- Homepage membership math (Prospect / All-Star featured / Elite Family) with
  per-hour comparison against $50 drop-in.
- Straight-answer FAQ: walk-in, D-BAT price, hours, softball, cancel/pay.
- Named humans: facility desk `(918) 922-8114` and Coach Steve `(918) 760-2719`.
- `/memberships` route with the same plan cards.
- `/visit` first-visit checklist (reserve, waiver, door, what to bring).
- `/waiver` branded handoff to the official form (still hosted off-domain until
  the form itself is moved).
- `/training` lesson SKUs: youth $40/$70, assessment $149.
- Card-first payment note on the homepage rate block.
- Footer install copy. Memberships footer link stays on this domain.
- `/visit` and `/thanks` ask for a real Google review after a clean first visit
  (no fake ratings). Homepage schema includes reserved hours.

Not invented: reviews, ratings, extra coach bios, alumni, or roster fees.

## Session 3 (stay in one site)

- **Book** in the header, footer, and mobile nav goes to `/book` on this site.
  It no longer dumps families onto book.prospectsbaseball.club.
- `/book` is a branded cage request (space, time, name, phone). Text the desk
  to hold. Card checkout is the last step only.
- **Train / lessons** stay on `/training`. Hero and plan CTAs request a lesson
  here instead of opening app.prospectsbaseball.club/pricing.
- Homepage, rates, facility, teams, memberships "Need one hour" all stay on
  `/book`.

## Still human / other properties

- Claim and rename Google Business (old “Top Prospects Practice Facility” pin,
  dead `(918) 806-2211`, 2024 1-star). Reply with facts. Collect real reviews.
- Facebook and ads: say **Oklahoma Prospects**, never Top Prospects.
- Booking site (`book.prospectsbaseball.club`): title/chrome to Oklahoma
  Prospects; card as the default pay button; Venmo/Cash App secondary with
  “come back to confirm.”
- Move the actual waiver/check-in/uniform *forms* onto this domain.
- Connect this GitHub repo to Netlify if it is not already, then deploy
  production (`npx netlify deploy --prod` below, or wait for auto-deploy).
- Publish the phone app (this marketing site is not the PWA).

## Editing

Edit `_includes/` for chrome, then `node scripts/build.mjs`.
Colors live in `assets/brand-tokens.css`. Layout in `assets/shared-chrome.css`.
Keep self-hosted fonts and license files.

## Deploy

    node scripts/build.mjs
    npx netlify deploy --prod --no-build --dir dist --site c49ad0ab-1b2c-412e-88d9-1f6ddf490a17

## Booking engine (same club chrome)

The live calendar at book.prospectsbaseball.club lives in `booking-site/`.
It is the same reservation/payment engine, restyled to **Oklahoma Prospects**.
Deploy that folder to Netlify site `6198a086-0140-492b-98a5-086771a2029b`.
Do not publish it as the marketing site. Keep the 301 in `_redirects`.
