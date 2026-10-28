# Shared athlete registration release

## Scope and acceptance

Extend the existing tryout and team inquiry flow with reusable household athletes, private calendar DOB, school status/name, expected graduation year or unknown, and reported grade. Public individual evaluations use the same intake. Existing event enrollments and private evaluations retain their registration foreign keys; the registration links to the canonical club_athletes ID. No new account grants or public publication are created.

Families choose their own athlete or explicitly add one. Anonymous submissions keep a private provisional profile; a verified account with the submitted email AND the private 256-bit claim code can link it. Existing identity mismatches require owner review. Names/emails alone never merge athletes. A lost claim code is not recoverable from a staff list; request owner assistance. Guest retries retain the original request and do not create a duplicate athlete.

Current education is canonical on club_athletes, synchronized through existing recruiting_roster_links. Authorized roster edits update that source; registration snapshots remain immutable. Existing unlinked records are not guessed or bulk-merged. Families complete missing information on their next signup.

Ordinary registration, center, evaluation and coordinator projections contain birth month/year only. Full DOB stays in household/private-profile routes and the private registration snapshot. Existing household, coach, owner and explicit coordinator authority remains authoritative. Filters and pagination run after authorization. Existing coach tryout discovery policy is preserved; no coach or coordinator grant is created.

Owner eligibility review records an actor/time/reason/rule receipt and checks the current registration revision. It does not change a requested division, place an athlete, enroll them or grant permissions. Existing owner placement/roster workflows remain separate. DOB corrections invalidate open reviews and recalculate against the original registration ruleset; settled decisions and original snapshots are retained.

## Rules verified October 22, 2026

- USSSA fastpitch 2027, `usssa-fastpitch-2027-age-v1`: age on August 31, 2026. Source: https://orfastpitch.usssa.com/2027-season-age-chart/ (season start corroborated at https://flfastpitch.usssa.com/2025-season-age-chart/).
- USSSA baseball 2027, `usssa-baseball-2027-age-v1`: age on April 30, 2027 (turning the next age before May 1). Rule 3.01, https://www.usssabaseball.org/images/USSSA_National_By-Laws_11-21-2025.pdf . Grade-exception limits beginning August 12, 2026 require staff review, actual grade and documentation; graduation year is never substituted.
- Explicit registration-season mappings: Fall 2026, Spring 2027, Summer 2027. No extrapolation to another year or organization. The family can select Other / Not sure; no division is invented. Base division guidance is not certification of event eligibility; play-up, grade exceptions and additional event rules require review.
- Rule IDs, organization, season mappings, cutoff, verified date, effective start, exceptions and source are retained in private registration snapshots. No unsupported end date is assumed.

## Migration and recovery

`0098_athlete_registration_profiles.sql` is additive: education/revision columns, private request profiles, profile audit, review receipts, and DOB change triggers. It grants no roles and rewrites no existing identities or historical records. Generated Netlify migration uses the existing idempotent application ledger. Old deployments can continue reading the original tables/columns.

Before release use the Netlify database snapshot from the deploy. Prefer an application rollback while retaining the additive schema and newly submitted records. Do not run destructive down migrations or restore a database over new registrations. If trigger behavior needs repair, apply an audited forward migration; preserve private profiles and review receipts. Database restoration is a separate owner-approved incident action.

## Verification and release evidence

Synthetic tests cover calendar boundaries, unknown rulesets, private projection, ownership failures, retries, claims, historical snapshots, DOB recalculation, roster education consistency and owner review/revision checks. Existing permission and business regression suites remain required. Public browser walkthrough includes the new required profile fields. No production customer mutations are used.

The PR release receipt will record the exact head, required GitHub checks, isolated browser results, Netlify preview identity, production deploy/commit, live release manifest and read-only hosted smoke. Local Chromium installation was unavailable due to a truncated official download; required GitHub browser gates remain mandatory, not waived. Do not treat this document as proof that a deployment has passed those pending gates.
