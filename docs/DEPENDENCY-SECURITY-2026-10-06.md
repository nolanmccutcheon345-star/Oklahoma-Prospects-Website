# Dependency security continuation — October 6, 2026

Claim: existing release dependency audit blocker. Base main `e7f5515a3e8af1684f8e1fbc300183cda05d5ba2`. Branch `fix/dependency-security`, PR #35. Existing bots' branches are preserved.

## Final remediation

The dependency gate originally reported 14 high and 1 moderate findings. Published patches for sharp, source-map-js and smol-toml reduced it to 12 high and zero moderate. Rechecking the registry and primary advisories confirmed braces 3.0.3 and node-forge 1.4.0 still have no published patched release:

- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-86w9-cpqp-85rv

Both remaining roots were installed solely through `@netlify/vite-plugin-tanstack-start` → `@netlify/vite-plugin` → Netlify's local development emulator. Application development already uses the ordinary Vite server. Replace that deployment adapter with the small repository-owned `scripts/netlify-build-plugin.mjs`, which runs only for the SSR build and emits the existing Netlify Functions entry contract:

- `.netlify/v1/functions/server.mjs` imports the actual sole server entry chunk.
- Default export is the application's fetch handler.
- Catch-all `path: "/*"` and `preferStatic: true` preserve static assets and SSR routing.
- Missing or ambiguous server entry chunks fail the build.
- No emulator, certificate generator or image proxy is installed.

Netlify database/function packages, scheduled application functions, migration packaging, TanStack application rendering and the Grok/Vercel build path remain in place. This adapter is intentionally build-only; it does not provide Netlify's local emulation. Future TanStack/Vite upgrades must retain adapter tests and exact hosted preview verification.

Regenerating the lock with npm 10 removes 514 package entries, adds none, and changes no surviving package versions. Fresh npm 10 `ci` succeeds. Full `npm audit --audit-level=high` now reports **zero vulnerabilities**; the workflow threshold and branch protection are unchanged. This is dependency removal, not an advisory suppression or an invented patched package.

## Verification

The focused adapter test imports its generated handler and checks request handling, static preference, SSR-only operation and invalid entry counts. `verify:build` now imports the generated Netlify Function itself rather than bypassing it to import the server bundle. Full tests, typecheck, lint, Netlify preview-context build and generated-function SSR/security checks are run before pushing; exact results and hosted checks are recorded in the PR.

No hosted mutable tests, financial actions, real customer messages or production database migrations are part of this change. Browser hydration and authenticated role acceptance remain separate gates. Prior available-patch verification passed 574 tests and native sharp SVG conversion; sharp is now removed with the unused image emulator, while source-map-js/smol-toml retain their patched surviving versions where present.

## A1 handoff

Reference PR #35 once against the release dependency blocker. PR #34 branding, PR #36 consented fundraising, PR #33 cancellation/payment flows, and existing bot PRs remain separate. Production publishing is authorized, but this branch is not itself a production release. Confirm exact-head CI and hosted preview before integrating; record the reviewed integration commit and live release independently. Square sandbox acceptance remains required for payment changes, independent of this dependency remediation.
