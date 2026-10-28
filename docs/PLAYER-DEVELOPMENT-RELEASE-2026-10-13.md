# Player Development release — 13 October 2026

## Release scope

This release extends the existing athlete record and booking-bound lesson system. It does not replace athlete identities, assessment history, TP1–TP7, command/TCI tracking, recruiting verification, payments, instructor earnings, or the service catalog.

- Booked sport, discipline, service version and duration determine the lesson. Older ambiguous bookings require a documented admin resolution.
- Eight lesson stages retain explicit timing, durable drafts, revision conflict checks, discipline-specific practice logs, family-safe recaps and atomic/idempotent completion.
- Three selectable approaches (foundations, targeted skill, game performance) cover both sports, five disciplines and 30/60/75-minute bookings: **90 combinations**. Coaches can choose compatible drills, edit objectives, dose/rest and stage timing, and save a new personal preset. Admins can approve or retire presets. Booking identity cannot be changed through the curriculum editor.
- **125 distinct drill records** provide written instructions, equipment, cues, corrections, regressions, progression prerequisites, measurements, age/skill eligibility, supervision, safety, provenance and version identifiers. Shared baseball/softball tasks retain one ID rather than being counted twice as unique drills.
- Ten sport/discipline program families support individual 2/4/6/8/12-week plans. Coaches enter an observed baseline, measurable goal, rationale, equipment, total workload, individual dose/rest, start/review dates, and scheduled tasks. Each scheduled date, dose, rest and target can be adjusted before approval. Existing strength and throwing plans remain available alongside My Training.
- My Training provides Today, This Week, My Programs, My Progress, My Coach and Drill Library. Families can record full/partial/skipped/modified practice, structured outcomes, effort, fatigue, pain, notes and questions. Self-reports remain distinct from coach observations and verified recruiting data.
- Coach decisions and shared feedback persist. Progression/completion require coach-observed evidence; elapsed time does not advance a phase. Pain or unusual fatigue pauses active plans for the athlete. Resuming a hold requires a documented review; the application does not provide medical clearance.
- The booked lesson’s Development brief shows assigned plans, current phase, goals, workload review, recent home reports, questions, coach feedback, safety holds and unreported tasks.
- Instructors can submit a custom drill version. Admins review, approve or retire it. Drafts are not assignable, retired versions are excluded from new selections, and existing assignments keep their original instruction snapshots. Approved custom drills are available in both lesson and home-practice selection.

## Catalog coverage

| Sport | Pitching | Hitting | Catching | Fielding | Strength/Speed |
|---|---:|---:|---:|---:|---:|
| Baseball | 24 | 20 | 20 | 20 | 20 |
| Softball | 20 | 21 | 20 | 20 | 20 |

These are eligibility counts, not a sum of unique records. Six age bands (5–7, 8–10, 11–12, 13–14, 15–18, 19+) and five separately reviewed skill bands are represented. Age does not confer an advanced skill level. A coach must individualize dose and suitability; a catalog entry is not itself a prescription.

## Content approval and limits

No external specialist endorsement, medical clearance, or qualified human review is claimed by this release. New instruction drafts are labeled for qualified review. Assigning an individual program or replacing lesson curriculum requires the instructor to attest to qualified review of the athlete, content, dose, workload and restrictions. Academy approval of submitted drills/presets is a separate recorded admin decision.

No demonstration videos are invented. Written instructions work without video. A submitter can attach an existing HTTPS demonstration link for the reviewer to inspect. The existing media/recruiting workflows remain separate.

Safety references inform guardrails, not validation or authorship of individual drills:

- [MLB / USA Baseball Pitch Smart](https://www.mlb.com/pitch-smart/pitching-guidelines)
- [American Academy of Pediatrics — youth sports injury prevention](https://www.healthychildren.org/English/health-issues/injuries-emergencies/sports-injuries/Pages/Sports-Injuries-Treatment.aspx)
- [Nationwide Children’s — baseball and softball injury prevention](https://www.nationwidechildrens.org/family-resources-education/700childrens/2017/01/injury-prevention-in-softball-and-baseball)

Baseball and softball pitching remain distinct. No automatic intense velocity progression, diagnosis, or return-to-throw clearance is generated.

## Data and permission controls

Additive migrations 0056–0058 introduce booked lesson snapshots, home assignments/practice/audit events, instructor presets and curriculum versions. Existing rows are not rewritten. Tables revoke public access; server functions require authenticated identity and current athlete/instructor/guardian scope. Curriculum decisions require an admin. All persisted actors are derived from verified server identity, not client fields.

Assignment creation is idempotent. Practice records have one assignment/task identity and optimistic revisions. Concurrent changes produce a reload requirement. Coach observations cannot be overwritten by family self-reports. Safety changes serialize per athlete. Curriculum content is versioned; retirement cannot alter completed history or saved assignments.

No new products, service prices, subscriptions or payment collection were introduced.

## Verification record

- The pre-expansion foundation’s full workflow passed on commit `270929884d3a448db6a1c933afdb758a5406fa21`.
- The expanded application passed 881 regressions, typecheck, lint, dependency audit, production build and built-server checks on commit `5cc538609fe72b9a621effcc85f7234393521467`. Its browser walkthrough exposed an accessible-label issue in the new assignment form; that issue was corrected before release.
- Current focused integration/form/booking checks: 25 passing tests. They cover unrelated families, unrelated instructors, sibling isolation, idempotency, stale saves, structured reports, pain holds across concurrent plans, human review, coach-observation integrity, custom-drill approval/retirement and preserved snapshots.
- Authenticated hosted preview read: My Training and the drill library load using the existing account session. Hosted public-route/security/session smoke passes. These read-only checks did not assign work to customer records.
- Browser acceptance uses a built Netlify application with real authentication, server-function middleware and disposable migrated PostgreSQL. It exercises both sports at 30/60/75 minutes, saved/reloaded lesson drafts, completion/earnings once, and the connected coach → family → coach → next-lesson loop, including logout/login persistence. Synthetic identities and records are isolated from production and external payment/email providers.

The owner explicitly requested completion and publication on 13 October 2026. This supersedes the earlier foundation-only deployment hold. Qualified curriculum review remains a per-assignment/content requirement in the application; software publication does not assert that independent coaches have already approved new content for every athlete.

## Final release gate

Code commit `1d9cd0a430e0e22b775e13c166aa5db2ba56002a` passed [GitHub Actions run 38329026007](https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/actions/runs/38329026007): **882/882 regression tests**, authenticated full-application browser walkthrough, typecheck, production build, built-server smoke, lint and dependency audit (zero vulnerabilities). No failed check is counted as passed.

The successful browser artifact is `guided-lesson-walkthrough`, ID `11782398512`. All six booked lesson cases passed with zero browser errors. The connected home-training loop also passed, including custom draft submission, family report persistence across logout/login, shared coach feedback and the saved lesson development brief. Final mobile screenshots for the assignment, persisted family report and lesson brief were visually inspected. Their content fits the mobile viewport; screens remain scrollable around the existing fixed navigation.

The current preview passed hosted read-only route/header/session checks and the production/preview PostgreSQL fingerprint isolation check. These do not certify an external payment transaction or modify customer data.

Publication is authorized from PR [197](https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/197). The PR records the final production deployment receipt after merge. This documentation-only commit makes no changes to the tested application or migrations.
