import test from "node:test";
import assert from "node:assert/strict";
import { securityHeaders } from "./security-headers";

test("bank verification permits HTTPS challenge frames and form posts while retaining script isolation", () => {
  const policy = securityHeaders("unique-test-nonce")["Content-Security-Policy"];
  const directives = new Map(policy.split("; ").map((part) => {
    const [name, ...sources] = part.split(" ");
    return [name, sources];
  }));
  // Sandbox posts to api.squareupsandbox.com; live cards redirect to bank-specific issuers.
  for (const directive of ["frame-src", "form-action"]) {
    const sources = directives.get(directive)!;
    assert.ok(sources.includes("https:"));
    assert.ok(!sources.includes("http:") && !sources.includes("*"));
  }
  const scripts = directives.get("script-src")!;
  assert.ok(scripts.includes("'nonce-unique-test-nonce'"));
  assert.ok(!scripts.includes("https:") && !scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"));
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.ok(!directives.get("frame-ancestors")!.includes("https:"));
});
