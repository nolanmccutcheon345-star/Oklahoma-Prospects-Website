# Oklahoma Prospects Academy — owner requirements and continuation handoff

Date: October 5, 2026. Audience: Nolan, A1, Group A and Group B.

## Authority and scope

These requirements consolidate Nolan's W1–W16, N1–N4, R-item answers and final clarifications in the owner conversation. Later owner decisions supersede conflicting audit recommendations. Original audits remain historical evidence; they are not rewritten as if these requirements were already implemented.

Reversible implementation on focused branches and draft PRs is authorized. Production publishing remains LOCKED pending a reviewed release and Nolan's explicit instruction. This document authorizes no production migration, live test charge/refund, customer message, credential change, analytics installation or paid subscription.

This handoff is documentation, not an implemented release. No existing implementation branch was modified while preparing it. The Grok shared filesystem and scheduler are separate from this checkout; their latest contents and routine execution have not been independently verified here.

## Current repository snapshot — independently retrieved

| Work | Exact repository state | Continuation rule |
| --- | --- | --- |
| Main | `ec06d2313e8d31447e676a10e6b69ada1e101c9e` | Preserve until reviewed integration. |
| D-001, PR #26 | Draft/open; `fix/d001-chrome-overlap` at `86d43bef28c885540c1355c07a1767b0c250df58` | Review existing patch; do not recreate it. |
| First checkout scope, PR #27 | Draft/open; `cursor/lesson-checkout-allowlist-dcbc` at `13442320f5dbaf66552b852e3704e9e0a5d3f1fb` | Existing implementation owns the new scope; coordinate before editing its files. |
| Rusty, PR #25 | Open; its description reports a dependency audit release blocker | Preserve separately; do not include incidentally. |
| Older PRs #18/#19/#20 | Open reconciliation drafts; earlier deployment/history differs | Inspect actual changes and migration state before integration; do not bulk merge. |

PR #26: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/26

PR #27: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/27

Netlify's PR comments associate #26's preview with deploy `6ac3e54f977ae200085865e7`, and #27's preview with `6ac3e70aa0faca0007b68153`. A ready preview is not payment acceptance or production-release approval.

The supplied audits report live commit `aa863ac39d65e22cb39e732c36ceaf1ac7791753` and rollback deploy `6abd9b2bcb21a7428799533c`. Those production identifiers were not independently rechecked while writing this handoff.

## Purchase experience and coach eligibility — R1/R3/R4/R5/R7/R8

- Cages, lessons and assessments must support direct booking and payment online. Contact is optional support, not a required purchase step. Remote assessments also use online payment and an eligible selected coach.
- PR #27 supplies a staged one-time `cages-lessons` scope; it does not implement every requirement below. Packages, passes and recurring memberships remain separately gated until their flows are verified. Do not switch blindly to `all`.
- Coaches select the sports, lesson types and availability they offer. Admin restrictions override coach selections. Only the intersection of offered services, admin permission, athlete eligibility and actual availability is bookable; enforce it on the server and at payment/fulfillment.
- Softball can be booked with coaches approved and available for softball. Keep baseball and softball service paths distinct.
- Admins can restrict an instructor to youth lessons, including high-school instructors; youth eligibility is age 10 and under. Prevent a restricted instructor being booked for an older athlete through direct API calls or altered checkout input.
- Standard eligible refunds are automatic under the rules below. Do not require a desk approval for every eligible cancellation. Failed provider operations and exceptional requests still need an admin-visible exception state; do not represent a pending refund as completed.
- Keep selected athlete, coach, service and time across required sign-in. Confirm bookings only after verified payment and resource availability. Protect against repeated submissions, double charges and duplicate fulfillment.

## W1 — brand

Public business name: **Oklahoma Prospects Academy**. Align website copy, metadata, schema and appropriate listing corrections. Do not rename the repository, Netlify project or domain for branding. Existing phone, email, address and hours remain unchanged pending confirmation. Prepare external listing corrections separately; read authorization does not itself authorize every external edit.

## W2 — support

State that inquiries will receive a response; promise no response time. Remove proposed response-time deadlines from acceptance criteria and customer copy.

## W3 — admin-managed tryouts

Remove fabricated dates. Admins create/edit baseball and softball tryout records including sport, age group, applicable season, date, time, location, capacity and status. Relevant site pages render these records. Do not invent replacement events or maintain competing hard-coded schedules.

## W4 — all-age intake and enrollment

Accept player information and individual-tryout requests for all age groups. Automatically enroll eligible applicants in matching group tryouts by sport, age and season, subject to capacity and duplicate protection, and notify them. Disclose this behavior during intake. A coach may contact an applicant to agree on a private tryout; do not automatically assign a private appointment without agreement.

## W5 — assessment and setup, including final clarification

- For non-youth lessons/memberships where setup applies, add $50 to the first lesson OR first membership month; the first lesson includes a pitching, hitting, fielding or catching assessment.
- A separately purchased, **completed $149 assessment** satisfies setup with **no additional $50**. A purchase alone does not fabricate assessment completion.
- After an authorized coach records completion on the athlete's file, remove subsequent setup surcharges and unlock all lesson options otherwise appropriate to that athlete. Completion is athlete-wide rather than discipline-only; coach and age restrictions still apply.
- Track setup per athlete and prevent duplicate charges across lessons, memberships, retries and concurrent purchases. Retain an auditable record of payment and completion.
- **Youth lessons have neither an assessment prerequisite nor a first-time setup surcharge.** Youth enrollment must not falsely mark an assessment complete.
- Update parent/coach next-step guidance and completion status consistently; preserve historical orders and already purchased entitlements.

## W6 — simple pricing

No sibling discounts or family pricing discounts for new sales. Remove conflicting new-sale offers consistently. Inventory existing purchased benefits before changing their entitlements; do not silently revoke them.

## W7 — cage booking horizon

Allow bookings up to 14 days ahead, including same-day bookings. A booking **less than 24 hours** before its start carries a 10% last-minute fee disclosed in the server quote before payment. Exactly 24 hours has no fee. Reconcile old All-Star priority-window claims; do not invent a replacement benefit. The exact interpretation of the 14-day upper boundary must be recorded in implementation and acceptance results.

## W8 — facility closures

Family chooses a free reschedule or full refund for facility-initiated closures. No customer cancellation penalty or household allowance consumption.

## W9 — player logins

Linked players may log in at any age with appropriate parent/guardian controls for minors. They may access their own player information, training schedule, assigned drills, throwing/hitting/strength programs and permitted team statistics. No booking, payment, billing or administrative access. Enforce ownership and permissions server-side, including direct API calls and cross-household attempts.

## W10 — team fees

Disclose fees after tryout/evaluation. Admins maintain approved pricing inputs; coaches select approved tournaments and uniform packages and see calculated team fees. Nolan supplies the approved amounts. Do not invent fee inputs or expose another team's financial records to coaches.

## W11 — coach profiles

All coaches have public profiles with name and short bio, plus optional approved information they choose to publish. Do not publish private account/contact details automatically. Reconcile existing coach/staff directory work (including PR #18) before building another directory; missing bios must not be invented.

## W12 — homepage booking mappings

Individual Cage defaults to household rate. Team Cage defaults to team rate. Fielding Area selects its designated fielding resource and defaults to household rate unless marked for a team or three or more players. Individual/team cages use appropriate cage resources excluding the fielding resource. Read actual resource IDs; do not guess. Reconcile the existing distinct fielding-price model before release; apply the owner rate selection consistently to copy and server quotes.

## W13 — fundraising

Require consent before publishing player fundraising. Remove homepage fundraising solicitations, including shared homepage footer solicitations. Use team page → roster → specific player → donate to that player, with player-specific share links to that destination. Enforce consent, publication status and minimal public fields on server/API as well as the interface. Do not assume hiding homepage links removes data exposure. Consent withdrawal/opt-out details remain to be specified; preserve existing audit evidence that approved/active filtering already exists.

## W14 — coaching guidance

Pitch Smart is coaching guidance, not a mandatory club rule or medical clearance. Baseball and softball are handled separately. Any sport-specific references and remote physical protocol need appropriate review.

## W15 — search and measurement

Read access to Search Console and Google Business Profile is authorized. Verify actual access before reporting data. Analytics/error-tool recommendations must explain vendors and costs before installation; no subscription or SDK installation is approved by inference.

## W16 — daily stabilization checks

Use daily targeted checks during stabilization, with one consolidated Group B update. A1 owns scheduling, overlap prevention and reporting actual changes/routine IDs. Do not rerun all completed audits daily. The reports describe enabled routines but no verified scheduled fire; the requested weekly-to-daily Group B change is not independently verified. No routine was created, disabled or changed by this handoff.

## N1 — youth lessons

Athletes age 10 and under: **$60 for one hour; $40 for half an hour**, regardless of lesson type. These are customer prices, without the $50 setup charge or an inferred additional processing markup. Admin youth-only coach restrictions apply. Verify athlete age rather than trusting a client label.

## N2 / R6 — household cancellation and rescheduling

One combined cancellation OR reschedule allowance **per household**, shared across its athletes. Reset on the first of each calendar month in **America/Chicago**; not a rolling 30-day period and not per athlete/login.

| Parent-initiated action while allowance remains | Financial treatment |
| --- | --- |
| 48 hours or more before start | Full refund / no change fee |
| 24 hours to under 48 hours | 50% refund / 50% change fee |
| Under 24 hours | No refund |
| Allowance already used | Cancellation remains possible, but no refund |

Coach-initiated private-lesson cancellation: family chooses full refund or free reschedule; do not consume household allowance. Facility closures also do not consume it. Track the initiator and household, process allowance updates atomically and avoid counting duplicate requests twice. Do not resurrect the old five-day/once-per-month source rule.

Post-allowance rescheduling details beyond the stated cancellation/no-refund treatment must not be invented. The general timing rules were discussed for bookings; record product-specific treatment of membership credits and renewals rather than treating a whole membership as a scheduled private lesson by assumption.

## N3 — coach/team booking credits

Coaches manage their team's booking credits. If the coach cancels more than once in the applicable month, the team loses the credit for that booking. Keep team credit accounting separate from a household's private lesson and from coach cancellation of a family's paid lesson. Use the calendar-month convention; do not count retries as multiple cancellations.

## N4 / R7 — remote assessments

Offer scheduled remote sessions, submitted-video reviews, or both, through selected eligible coaches and online payment. Include evaluation, individualized drills/programs and an appropriate remote physical-assessment component. Submitted-video results are due **within five business days**. Define the submission checklist, clock-start event and business-day calendar before promising fulfillment. B4 proposes the physical-check protocol for owner review. Do not promise an in-person exam or a medical diagnosis; incomplete protocol must not revert the purchase journey to mandatory inquiry.

## R2 — assessment prices

Both Hitting and Pitching Assessments are **$149 for new purchases**, as customer-facing totals. Align server quotes, editable catalog defaults, public pages and pricing documentation. Do not add another processing markup to $149 or change Catching/Fielding Assessment prices without a corresponding owner decision. Preserve historical paid orders/subscription agreements.

## Existing audits — reconciliation and release gates

| Existing ID | Status/requirement to retain |
| --- | --- |
| D-001 | Existing PR #26; phone 390×626, desktop around 1280×800 and actual 200% zoom: every focused control and Review fully visible. |
| D-002 / GB-06 | Mapping decision is answered by W12; distinct selected/focused states and active booking mode remain required. One engineering task, not a duplicate. |
| D-003 | Unticked button observation did not prove a bypass. Inspect client/server enforcement; accessible inline error and server rejection if missing. |
| D-004 | Two-decimal money formatting; mobile CTA readable, one line and at least 44px high. |
| D-005 / GB-08 | Legacy `/train` → `/training` redirect; do not duplicate route work. |
| GB-01 / GB-03 | Direct online buying supersedes permanent inquiry/request CTA recommendations. Sign-in and actual availability remain honest. |
| GB-02 / GB-07 | W1 brand and $149 price supersede earlier suggested facts/prices. |
| GB-04 / GB-05 | Admin events/all-age intake and athlete-wide setup/completion supersede earlier age-specific inquiry labels and missing-unlock recommendations. |
| GB-10 / GB-11 / GB-15 / GB-16 | W7 horizon; automatic refunds with exceptions; no new family discounts; restricted player logins. |
| GB-12 / GB-13 / GB-14 | Progress cadence/OP ladder remain proposals; role empty/deny states remain a review task. Do not mark every idea owner-approved. |
| SEC-F-001a/b/c | Minimal public DTO, regression checks, persisted consent and controlled publication; W13 answers consent requirement, not every opt-out detail. |
| E-001 / E-002 | Inspect and implement auth-email context guard and Square off-production fail-closed behavior; reuse existing safeguards where present. |
| E-003 | Still partial for mutating hosted tests: enabled Neon branching does not prove the actual preview DB is isolated; exact env contexts and webhook targets are unverified. |
| R-001 / R-002 / R-003 | Analytics/errors remain proposals; preserve targeted GET smoke and scheduler history without claiming unverified runs. |

The user supplied consolidated A/B handoffs, A3, B6, E-003 and activation/decision sheets, sometimes twice. Deduplicate repeated versions; later factual evidence and owner decisions take precedence. Individual A2/A5/A6/B1–B5 source files and the Grok `BACKLOG.md` were not imported into this checkout. Preserve their original paths as provenance, not as proof of local access. A1's bot backlog remains its queue; this file is the repository handoff for reconciliation.

### Review observations in this continuation

- PR #26 adds scroll padding and makes bottom navigation static below 500 CSS pixels. Existing shell padding already reserves bottom-nav space. Source inspection alone does not establish all viewport acceptance.
- On the PR #26 hosted preview, keyboard Tab from Lane 5 reached Lane 6. At the available **1363×936** CSS viewport, the focused input was at y=535.75–555.75; header bottom 69; nav top 879. The visible lane card cleared both bars. This is a bounded desktop observation, not a full D-001 PASS. No Review, signup, payment or form submit was performed. Mobile and actual 200% zoom remain untested here.
- PR #27 adds scope allowlisting and a separate production acceptance flag, while retaining existing prices and assessment eligibility. Its source still contains contact-your-coach remote-assessment copy. Therefore it does not satisfy the final $149, youth exemption, initial non-youth setup workflow, household allowance or remote-booking requirements merely by enabling lesson checkout. Its author-reported tests are not independently rerun in this handoff.

### Test acceptance before release

Confirm the exact test deploy uses an isolated database, sandbox Square and blocked/test-only email. Hosted tests that change data remain blocked until this proof exists. Local isolated tests can proceed without production credentials.

Verify quote totals; first-time setup and assessment completion; youth exemption/age boundaries; sport/service/admin coach restrictions; sign-in continuity; payment idempotency/resource contention; exact 24/48-hour boundaries; household month rollover/concurrency; team-credit rules; coach/closure exemptions; automatic refund pending/failure/retry/completion; tryout matching/capacity/duplicate notification; player/coach/admin access isolation; fundraising consent/minimal fields; actual cage resources; remote submission and fulfillment.

For each result record commit, environment and PASS/FAIL/BLOCKED with evidence. Provider-backed sandbox payment/refund acceptance is distinct from offline logic tests. Live charges/refunds require separate owner action; no real-money test is authorized by this document. No production merge/publish/unlock is approved.

## Collision prevention and Thursday return

1. Read current main, PR heads and changed-file sets before claiming a task. Recheck remote heads before pushing. A dormant bot or old report does not prove its branch is free.
2. One implementer per overlapping file set. Preserve existing PRs #26/#27/#25 and reconciliation drafts; do not force-push or delete another worker's branch.
3. Continue unblocked work in separate focused branches; record task ID, claimed files, base/head SHA, tests and next reviewer. Coordinate checkout changes with the PR #27 implementer.
4. Keep a single traceability queue covering all D/E/R/GB/SEC IDs and these W/N decisions; preserve hypotheses and proposals as such. Do not rerun completed baselines without a change or unresolved question.
5. On Thursday, A1 reconciles this handoff and any continuation PRs against `BACKLOG.md`, accepts/reassigns claims, and resumes reviews. Report remaining decisions in one short message, not another repeated audit questionnaire.

### Remaining details — not grounds to stop unrelated implementation

Confirm phone/email/hours for external listings and legacy-page retirement; actual coach launch selections/availability ownership; ordinary lesson booking horizon/minimum notice; approved team fee inputs and missing bios; remote submission clock/checklist/physical protocol; consent withdrawal; exceptional refund/pause responsibility; exact cage resource and fielding-price reconciliation; membership start/renewal and existing-benefit handling; details of rescheduling after allowance exhaustion. These are separate from already answered prices, household/calendar counting, youth exemption, online remote purchasing and coach/facility cancellation treatment.

End of continuation handoff. Documentation only; implementation and verification are separately tracked.

## Continuation delta — October 5, after the snapshot above

- E-001 implemented in draft PR #29: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/29. Head `199c52ad0c3b67a15622776a639187540525f54f`; tested tree `036c39efe4d41771d78cafbd1c2986805addcd8b`. Auth email now checks the build-pinned deploy context; non-production recipients require an exact server-side test-address allowlist. Seven sender regression tests passed; full application suite 574 passed/0 failed; TypeScript, lint, preview build and built SSR/security checks passed. No real mail sent. Dependency audit retains the existing 12 high findings and blocks release. E-003 and A5 review still required for hosted mutating auth tests.
- D-004 implemented in draft PR #30: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/30. Head `8d094c2346fd820286aa9a9142929a807c4c3601`; tested tree `84dd2bc9522096422157b0ee3372d940a9acfcd7`. Shared formatting now covers homepage/booking/training money and the homepage cage CTA stacks at narrow widths. Existing numeric prices/quotes are unchanged. TypeScript, changed-file lint (one existing warning), two processing-price tests, preview build and built SSR/security checks passed. Hosted desktop and 390px acceptance remain pending.
- Both branches are based on `ec06d23`; PRs #26/#27/#25 were not modified or merged. Node 24.19.0 was used locally; repository CI uses Node 22 and its actual results must be recorded separately. No production publish/unlock, settings change, migration, booking, payment, email or scheduler mutation occurred.
- Next: resolve final $149 assessment totals, non-youth setup and youth exemption/coach restrictions on a coordinated branch, then household cancellation/refund and remote fulfillment work. Do not enable PR #27 in production solely because scope allowlisting exists. Integrate the formatting helper from #30 deliberately before overlapping pricing changes.
- A1 reconciles these implementation claims and results into the Grok shared backlog when access/usage returns. The scheduler was not paused or altered here; inspect actual runtime ownership before automated advancement resumes.
