# Coach publication repair — October 15, 2026

## Cause
The shared profile default was off without a team assignment; the editor disabled the publication control and the server rejected publication without a team. Both the public projection and directory component then filtered out people without teams, even when a profile or staff listing was published.

## Behavior
- New coach-role profiles and inferred instructors default to visible. Adding the first team or instructor assignment to a new profile enables coach visibility unless the owner has explicitly chosen otherwise.
- The public `coach` flag is independent of team assignments and instructor publication. Existing explicit publication choices remain authoritative; no bulk republishing or account permission changes.
- An owner may show/hide a coach even without a team. A published coach needs a biography and a selected sport or active team assignment.
- All includes every published coach. Baseball and Softball use selected sports plus current visible team assignments. Dual-sport coaches appear in both.
- Published independent staff listings are included with their title and program. New staff listings default to published; the form retains the public-contact disclosure.
- Save invalidates router data so navigation does not retain a stale directory. Disabled users remain excluded, and private profiles remain absent from public photo responses.

## Verification
Targeted database regressions cover no-team publication, default visibility, missing-sport validation, persistence, explicit hiding across subsequent edits, republishing, disabled accounts and private-data exclusion. The rendered component test exercises All/Baseball/Softball and opens a biography. Existing full build, regression and browser CI gates remain required before production publication.

Alex Rodriguez's existing profile was inspected in the signed-in Front Office: its saved coach publication switch was off despite a 13U baseball head-coach assignment and saved bio. The owner-requested correction enabled only coach publication through the normal profile form. The live Coaches page then displayed Alex and his 13U assignment. Instructor publication and service assignments were preserved.
