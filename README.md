# Oklahoma Prospects — marketing site

Scope: [prospectsbaseball.club](https://prospectsbaseball.club) marketing site.
Booking, the player development portal, and hosted family tools are linked,
not rebuilt here.

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

Not invented: reviews, ratings, extra coach bios, alumni, or roster fees.

## Still human / other properties

- Claim and rename Google Business (old “Top Prospects Practice Facility” pin,
  dead `(918) 806-2211`, 2024 1-star). Reply with facts. Collect real reviews.
- Facebook and ads: say **Oklahoma Prospects**, never Top Prospects.
- Booking site (`book.prospectsbaseball.club`): title/chrome to Oklahoma
  Prospects; card as the default pay button; Venmo/Cash App secondary with
  “come back to confirm.”
- Move the actual waiver/check-in/uniform *forms* onto this domain.
- Connect this GitHub repo to Netlify if it is not already, then deploy.

## Editing

Edit `_includes/` for chrome, then `node scripts/build.mjs`.
Colors live in `assets/brand-tokens.css`. Layout in `assets/shared-chrome.css`.
Keep self-hosted fonts and license files.

## Deploy

    node scripts/build.mjs
    npx netlify deploy --prod --no-build --dir dist --site c49ad0ab-1b2c-412e-88d9-1f6ddf490a17
