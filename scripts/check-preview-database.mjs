import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

/** No write requests, bookings, account creation, provider calls or secrets. */
export async function compareDatabaseTargets(production, preview, request = fetch) {
  const origin = (s) => {
    const url = new URL(s);
    assert.equal(url.protocol, "https:", "Require HTTPS origins");
    assert.equal(url.pathname, "/", "Pass only the origin, not a path");
    assert.ok(!url.username && !url.password && !url.search && !url.hash, "No URL credentials or parameters");
    return url;
  };
  const live = origin(production);
  const stage = origin(preview);
  assert.notEqual(live.origin, stage.origin, "Production and preview must be distinct hosts");
  async function fingerprint(site) {
    const url = new URL("/api/health", site);
    url.searchParams.set("check", "preflight");
    const response = await request(url, {
      method: "GET",
      redirect: "error",
      headers: { "Cache-Control": "no-store" },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, site.origin + " database health not verified");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const data = await response.json();
    assert.deepEqual(Object.keys(data).sort(),["databaseFingerprint","databaseSource","status"]);
    assert.equal(data.status,"configured");
    assert.equal(data.databaseSource,"postgres", "Embedded or unknown DB is never a verified preview");
    assert.match(data.databaseFingerprint,/^[0-9a-f]{64}$/);
    return data.databaseFingerprint;
  }
  const [a,b]=await Promise.all([fingerprint(live),fingerprint(stage)]);
  assert.notEqual(a,b,"PREVIEW DATABASE ISOLATION FAILED: both deployments target the same database");
  return {differentTargets:true};
}

const cli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (cli) {
  const [production,preview]=process.argv.slice(2);
  assert.ok(production && preview,"Usage: node scripts/check-preview-database.mjs <production origin> <preview origin>");
  await compareDatabaseTargets(production,preview);
  console.log("PASS: production and preview report distinct PostgreSQL destination fingerprints.");
  console.log("Read-only prerequisite only. Verify permissions, tenant isolation and Square sandbox separately before any hosted write test.");
}
