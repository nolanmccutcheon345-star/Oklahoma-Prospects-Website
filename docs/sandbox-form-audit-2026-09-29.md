# Sandbox form submission audit — September 29, 2026

Authenticated browser testing of the isolated `square-release-check` deployment found that the lesson facility assignment button did not submit its form. Clicking Save produced no server mutation; a read-only query confirmed no service resource rows were saved. The shared Button intentionally defaults to `type="button"`, but eight form actions omitted `type="submit"`.

Fixed actions: save booking participants; record an already-paid contractor settlement; save a lesson facility requirement; save a registration stage; create a guardian invitation; set up/disable an authenticator; verify authenticator enrollment; and verify a two-factor challenge. The shared default remains unchanged so ordinary actions cannot accidentally submit a form. All existing validation and authorization stay in place.

Verification: 563 tests passed, zero failures/skips; TypeScript passed; production build and built SSR smoke checks passed; targeted ESLint passed. New regression coverage scans actual form action declarations and exercises native validation/submission with the real Button markup.

Hosted acceptance: source `2cc59f58` deployed successfully to the isolated Square sandbox. Both Hitting Assessment (`s9`) and Private Hitting 30 (`s7`) now save Lane 6 through the real form, verified in the sandbox database. The assessment checkout then returned Friday 4:00, 4:30 and 5:00 PM starts, matching the synthetic coach's saved 4–6 PM window.

A second browser finding showed the coach availability editor reopened with every day unchecked and default times despite a saved Friday 4–6 PM window. The editor now initializes from saved windows, retains split windows and legacy day lists/ranges, and refuses to overwrite an unreadable saved time. Targeted availability, form, pricing, scheduling and database constraint coverage: 13 passed; TypeScript, targeted ESLint and a fresh build passed.

This repair does not open live lesson or monthly-plan purchases and does not certify separate coach/parent/player sessions or full recurring-provider lifecycle acceptance. Sandbox fixtures are clearly labeled QA, and no real funds or customer notifications are used.
