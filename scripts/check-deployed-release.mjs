import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Read-only production deployment provenance check. An HTTP 200 or successful
 * Netlify preview is NOT evidence that the intended main commit is live.
 * No credentials, customer records, webhooks, payments or mutations involved.
 */
export function validateProductionOrigin(raw) {
  const origin = new URL(raw);
  assert.equal(origin.protocol, "https:", "Production release verification requires HTTPS");
  assert.equal(origin.hostname, "prospectssports.club", "Verify the canonical production domain only");
  assert.equal(origin.port, "", "Do not use a nonstandard production port");
  assert.equal(origin.pathname, "/", "Provide only the origin");
  assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash,
    "Do not include credentials, query parameters or fragments");
  return origin;
}

export function releaseMatches(document, expectedCommit) {
  if (!document || typeof document !== "object" || Array.isArray(document))
    return { ok: false, reason: "release.json is not a JSON object" };
  if (!/^[a-f0-9]{40}$/.test(document.commit || ""))
    return { ok: false, reason: "release.json lacks a full source commit" };
  if (document.commit !== expectedCommit)
    return { ok: false, reason: `deployed commit ${document.commit} differs from requested main commit ${expectedCommit}` };
  if (document.dirty !== false)
    return { ok: false, reason: "release.json does not certify a clean source build" };
  if (typeof document.builtAt !== "string" || !Number.isFinite(Date.parse(document.builtAt)))
    return { ok: false, reason: "release.json lacks a valid build timestamp" };
  if (!Array.isArray(document.migrations) || !document.migrations.every(item =>
    item && typeof item.name === "string" && /^[a-f0-9]{64}$/.test(item.sha256 || "")))
    return { ok: false, reason: "release.json contains invalid migration provenance" };
  return { ok: true, reason: "exact source commit and manifest verified" };
}

export async function verifyHostedRelease({
  origin: rawOrigin, expectedCommit, attempts = 18, intervalMs = 20_000,
  request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  report = console.log,
}) {
  const origin = validateProductionOrigin(rawOrigin);
  assert.match(expectedCommit, /^[a-f0-9]{40}$/, "Expected the complete lowercase main SHA");
  assert.ok(Number.isSafeInteger(attempts) && attempts >= 1 && attempts <= 60, "Invalid attempt count");
  assert.ok(Number.isSafeInteger(intervalMs) && intervalMs >= 0 && intervalMs <= 60_000, "Invalid retry interval");
  let lastFailure = "no response";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Cache-busting and explicit no-cache avoid certifying an old CDN/browser copy.
    const url = new URL("/release.json", origin);
    url.searchParams.set("audit", `${Date.now()}-${attempt}`);
    try {
      const response = await request(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status !== 200) {
        lastFailure = `release.json HTTP ${response.status}; redirects are not accepted`;
      } else if (!/^application\/(?:json|[\w.+-]+\+json)\b/i.test(response.headers.get("content-type") || "")) {
        lastFailure = `release.json had unexpected content type: ${response.headers.get("content-type") || "missing"}`;
      } else {
        const release = await response.json();
        const check = releaseMatches(release, expectedCommit);
        if (check.ok) {
          report(`PASS production ${origin.origin}: commit ${release.commit} built at ${release.builtAt}; ${release.migrations.length} migration checksums`);
          return release;
        }
        lastFailure = check.reason;
      }
    } catch (error) {
      lastFailure = `release.json request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    report(`NOT VERIFIED (${attempt}/${attempts}): ${lastFailure}`);
    if (attempt < attempts) await pause(intervalMs);
  }
  throw new Error(`Production provenance FAILED: ${lastFailure}. No deployment action was taken.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [origin, expectedCommit, attempts = "18", intervalMs = "20000"] = process.argv.slice(2);
  verifyHostedRelease({ origin, expectedCommit, attempts: Number(attempts), intervalMs: Number(intervalMs) })
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
