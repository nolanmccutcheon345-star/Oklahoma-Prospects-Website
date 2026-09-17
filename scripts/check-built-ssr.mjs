import assert from "node:assert/strict";

// Runs against the generated Netlify server, without a listener or any account,
// database, or payment mutation. Browser hydration still needs a hosted preview.
process.env.NODE_ENV = "production";
process.env.CONTEXT = "deploy-preview";
const { default: entry } = await import("../dist/server/server.js");
const nonces = new Set();
for (const [path, status] of [["/", 200], ["/__audit_missing_page__", 404], ["/login?next=%2Faccount", 200], ["/", 200]]) {
  const response = await entry.fetch(new Request(`https://preview.example.invalid${path}`));
  const html = await response.text();
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get("cache-control"), "private, no-store", path);
  const nonce = response.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "A production HTML response needs a CSP nonce");
  assert.ok(!nonces.has(nonce), "Nonces must change between responses");
  nonces.add(nonce);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scripts.length > 0, "Expected application scripts");
  for (const script of scripts) assert.ok(script[1].includes(`nonce="${nonce}"`), "Every rendered script must match the CSP nonce");
  assert.ok(html.includes('property="csp-nonce"'), "Client hydration needs the server nonce");
  if (path.startsWith("/login")) {
    assert.match(html, /type="email"/, "Netlify must retain email sign-in");
    assert.match(html, /type="password"/, "Netlify must retain password sign-in");
    assert.doesNotMatch(html, /Continue with (Google|X)/,
      "Default Netlify builds must not offer unregistered Grok OAuth callbacks");
  }
  console.log(`PASS ${status} ${path}: matching CSP, script and hydration nonces; private cache`);
}
