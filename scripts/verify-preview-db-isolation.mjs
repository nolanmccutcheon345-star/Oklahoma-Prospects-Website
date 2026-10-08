import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const PRODUCTION = "https://prospectsbaseball.club";

/** Strictly require a Netlify deploy-preview of OUR project; never probe arbitrary URLs. */
export function validatePreviewOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", "Preview must use HTTPS");
  assert.match(url.hostname, /^deploy-preview-[1-9][0-9]*--oklahoma-prospects\.netlify\.app$/,
    "Only official oklahoma-prospects Netlify deploy previews may be compared");
  assert.equal(url.port, "", "No custom port");
  assert.equal(url.pathname, "/", "Provide a deploy-preview origin only");
  assert.ok(!url.username && !url.password && !url.search && !url.hash,
    "No credentials, query strings or URL fragments");
  return url.origin;
}

export function verifyIsolationResponse(production, preview) {
  function validate(health, environment) {
    assert.equal(health.statusCode, 200, environment + ": requires HTTP 200 database health");
    assert.equal(health.body?.status, "configured", environment + ": persistent database unverified");
    assert.equal(health.body?.databaseSource, "postgres", environment + ": requires a persistent PostgreSQL backend");
    assert.match(health.body?.databaseFingerprint || "", /^[a-f0-9]{64}$/,
      environment + ": needs a valid non-secret destination fingerprint");
    assert.deepEqual(Object.keys(health.body).sort(), ["databaseFingerprint", "databaseSource", "status"],
      environment + ": unexpected health payload");
  }
  validate(production, "production");
  validate(preview, "deploy preview");
  assert.notEqual(
    preview.body.databaseFingerprint,
    production.body.databaseFingerprint,
    "DANGER: preview and production point to the same database destination; never run preview writes",
  );
  return true;
}

async function getHealth(origin, fetchFn = fetch) {
  const response = await fetchFn(new URL("/api/health", origin), {
    method: "GET",
    redirect: "error",
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.headers.get("cache-control")?.includes("no-store"), true,
    origin + ": health response must not be cached");
  return { statusCode: response.status, body: await response.json() };
}

/**
 * Read-only proof of DISTINCT configured destination fingerprints. This does
 * not verify DB permissions or prove which records a connection can mutate.
 */
export async function comparePreviewDatabaseTargets(previewOrigin, fetchFn = fetch) {
  const preview = validatePreviewOrigin(previewOrigin);
  const [productionHealth, previewHealth] = await Promise.all([
    getHealth(PRODUCTION, fetchFn),
    getHealth(preview, fetchFn),
  ]);
  verifyIsolationResponse(productionHealth, previewHealth);
  return { production: PRODUCTION, preview };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  comparePreviewDatabaseTargets(process.argv[2] || "")
    .then(({ production, preview }) => {
      console.log(`PASS read-only database destination comparison: ${preview} differs from ${production}`);
      console.log("THIS IS NOT AUTHORIZATION TO WRITE: verify isolated DB permissions, Square sandbox and owner approval separately.");
    })
    .catch(error => { console.error("BLOCKED preview DB isolation:", error.message); process.exitCode = 1; });
}
