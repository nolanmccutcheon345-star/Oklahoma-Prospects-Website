# Temporary dependency risk acceptance: PR274

Steve explicitly approved preparing this narrow exception and releasing the availability fix only after required checks pass on November 18, 2026. This is not a security fix.

- Advisory: GHSA-fc5q-39xc-vjpf, Picomatch repeated-extglob regular-expression denial of service.
- Reviewed version: 4.0.7, only `node_modules/picomatch`.
- Expiration: November 25, 2026 at 00:00 UTC. No automatic extension.
- Exact reviewed lockfile SHA-256: `d55f011fec1b26920cc31dbbeaa82b6840ab3aeea86c138c25b4bee75676d6c9`.

The dependency lock is unchanged from production base 78c14bc5017f9c59ddd44ab39b312010d58aab3d. No upstream patched Picomatch release was available when reviewed. The audit's suggested forced Vite downgrade was not applied because it changes major framework dependencies.

No application calls to Picomatch were found. The downloaded exact-head public deploy and reconstructed server chunks contained no Picomatch implementation; the actual hosted Node function package was not available for inspection, and external runtime dependency reachability remains uncertain. Malicious glob patterns could exhaust CPU if a reachable consumer accepts them. The exception accepts that residual pre-existing risk, not a claim of no runtime exposure.

`scripts/dependency-audit.mjs` retains the complete npm report and fails closed on audit failures, malformed/unknown graphs, critical findings, other high advisories, changed reviewed metadata, version/path/lock drift, or expiry. Dependency propagation is resolved to root advisories. Moderate findings retain the previous high-threshold behavior; the separate Minimatch advisory GHSA-g3hv-75wg-m249 is not exempted. All other verification steps remain unchanged.

Follow-up: inspect upstream remediation before expiration, update affected dependencies with compatibility tests, then remove this exception and restore the direct npm audit gate. Do not silently extend the date or broaden the allowlist. No production credentials, customer data or authentication behavior are altered by this change.
