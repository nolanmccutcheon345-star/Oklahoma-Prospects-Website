# Sandbox form submission audit — September 29, 2026

Authenticated browser testing of the isolated `square-release-check` deployment found that the lesson facility assignment button did not submit its form. Clicking Save produced no server mutation; a read-only query confirmed no service resource rows were saved. The shared Button intentionally defaults to `type="button"`, but eight form actions omitted `type="submit"`.

Fixed actions: save booking participants; record an already-paid contractor settlement; save a lesson facility requirement; save a registration stage; create a guardian invitation; set up/disable an authenticator; verify authenticator enrollment; and verify a two-factor challenge. The shared default remains unchanged so ordinary actions cannot accidentally submit a form. All existing validation and authorization stay in place.

Verification: 563 tests passed, zero failures/skips; TypeScript passed; production build and built SSR smoke checks passed; targeted ESLint passed. New regression coverage scans actual form action declarations and exercises native validation/submission with the real Button markup.

Hosted acceptance will be recorded after deployment. This repair does not open live lesson or monthly-plan purchases and does not certify separate coach/parent/player sessions or full recurring-provider lifecycle acceptance. Sandbox fixtures are clearly labeled QA, and no real funds or customer notifications are used.
