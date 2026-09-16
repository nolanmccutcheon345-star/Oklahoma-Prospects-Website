import assert from "node:assert/strict";

// Read-only HTTP checks. This deliberately does not create accounts, send email,
// reserve inventory, call webhooks, or start payment sessions.
const argument = process.argv[2];
assert.ok(argument, "Usage: npm run verify:hosted -- https://<deployment-host>");
const origin = new URL(argument);
assert.equal(origin.protocol, "https:", "Use an HTTPS hosted deployment");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash,
  "Provide only a deployment origin, without credentials, query, or fragment");
assert.equal(origin.pathname, "/", "Provide an origin, not a page URL");

const request = (path) => fetch(new URL(path, origin), {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
const privateCache = (response) => {
  const directives = response.headers.get("cache-control")?.split(",").map(s => s.trim());
  assert.ok(directives?.includes("private") && directives.includes("no-store"),
    "Personalized HTML and account responses must be private and not stored");
};
const nonces = new Set();
const pages = [
  ["/", 200], ["/book", 200], ["/training", 200], ["/memberships", 200],
  ["/login?next=%2Faccount", 200], ["/__audit_missing_page__", 404], ["/", 200],
];
for (const [path, expected] of pages) {
  const response = await request(path);
  assert.equal(response.status, expected, `${path}: HTTP status`);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  privateCache(response);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const policy = response.headers.get("content-security-policy") || "";
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce && !nonces.has(nonce), `${path}: fresh response CSP nonce`);
  nonces.add(nonce);
  const html = await response.text();
  assert.match(html, /<main\b/, `${path}: server-rendered application content`);
  assert.match(html, /property="csp-nonce"/, `${path}: hydration nonce metadata`);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scripts.length, `${path}: application scripts present`);
  for (const [, attributes] of scripts) {
    assert.ok(attributes.includes(`nonce="${nonce}"`), `${path}: matching script nonce`);
  }
  console.log(`PASS ${expected} ${path}: HTML, security headers, fresh script nonce, private cache`);
}

for (const path of ["/visit", "/check-in", "/checkin"]) {
  const response = await request(path);
  assert.equal(response.status, 301, `${path}: permanent redirect`);
  assert.equal(new URL(response.headers.get("location"), origin).href,
    new URL("/visits", origin).href, `${path}: destination`);
  console.log(`PASS 301 ${path} -> /visits`);
}

const session = await request("/api/auth/get-session");
assert.equal(session.status, 200, "Signed-out session endpoint");
privateCache(session);
assert.equal(await session.json(), null, "Anonymous requests must not receive a session");
console.log("PASS anonymous account session: null, private cache");
console.log(`Hosted HTTP smoke passed for ${origin.origin}.`);
console.log("This is not release approval: authenticated roles, email, provider payments, legacy data, mobile accessibility and performance still require acceptance evidence.");
