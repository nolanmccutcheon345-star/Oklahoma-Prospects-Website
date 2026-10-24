# Condensed public navigation and editable About page

Owner request: consolidate the public menu into Home, Articles & News, Training, Teams, Memberships, Shop, Games, Account/Sign In, Contact and About; create an About page that administrators can edit and publish.

## Demonstrated issues and acceptance criteria

The mobile dialog exposed 17 flat destinations and had a separate list from desktop. Instructor and training-membership destinations were absent from the mobile list. There was no About route. The Close control scrolled out of view.

- Ten mobile primary rows, with only one of Training/Teams/Memberships expanded at a time.
- Shared destinations and labels on desktop; Account, Contact and About in the header utility area. Keep the prominent Book a Cage action and existing staff workspace navigation.
- Reuse existing URLs, including `/memberships` for cage memberships and `/training?view=plans` for coaching memberships. Retain the Teams overview and Visit checklist.
- Sticky dialog heading/Close, keyboard dismissal, focus return, safe-area padding and narrow-screen layouts.
- About content is server-rendered from a published database document. Editable page/search headings, introductory copy, story, mission and philosophy; shared facility image and links.
- Front Office → Services → About page · Website content supplies draft save, local preview, live-page link and explicit publication. Draft changes stay private until published. Saves check the revision and retain entered text on error.
- Existing owner publication authorization is enforced server-side; no role grants or broader access. Publication writes an audit entry. Text is rendered by React without raw HTML.

## Data and release

Append-only migration `0104_website_about.sql` creates `website_pages` and seeds an initial, editable published About document. `ON CONFLICT DO NOTHING` preserves later edits. There are no payment, customer, roster, booking or existing content rewrites.

Database/regression checks cover draft/public separation, owner-only reads/writes, revoked owners, stale revisions, validation, audit and migration reapplication. Existing navigation tests and responsive walkthrough now exercise the grouped menu. The membership/homepage walkthrough also verifies About SSR, mobile layout, draft persistence, preview and publication through the actual UI.

Local typecheck, build, built SSR smoke and focused tests passed. The development container has no installed Chromium executable, so the browser walkthroughs run in the existing required GitHub verification job. Release only after that job and Netlify preview checks pass. The release receipt is recorded in the pull request.
