import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { authEmailAllowed, deliverAuthEmail } from "./email.server";

const keys = [
  "SQUARE_DEPLOY_CONTEXT", "CONTEXT", "AUTH_EMAIL_TEST_RECIPIENTS",
  "RESEND_API_KEY", "RESEND_FROM_EMAIL", "EMAIL_FROM",
] as const;
let saved: Record<string, string | undefined>;
let restoreFetch: typeof fetch;
let requests: { url: string; body: Record<string, unknown> }[];

beforeEach(() => {
  saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => { delete process.env[key]; });
  process.env.RESEND_API_KEY = "offline-fixture-key";
  process.env.RESEND_FROM_EMAIL = "office@example.test";
  requests = [];
  restoreFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
});

afterEach(() => {
  keys.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
  globalThis.fetch = restoreFetch;
});

test("preview verification and reset emails cannot use inherited production credentials", async () => {
  for (const context of ["deploy-preview", "branch-deploy", "development", "dev"]) {
    process.env.SQUARE_DEPLOY_CONTEXT = context;
    for (const subject of ["Verify your email", "Reset your password"])
      await assert.rejects(deliverAuthEmail("family@example.test", subject, "https://example.test/token"), /temporarily unavailable/);
  }
  assert.equal(requests.length, 0);
});

test("production verification and reset delivery keeps the requested recipient and token", async () => {
  process.env.SQUARE_DEPLOY_CONTEXT = "production";
  for (const subject of ["Verify your email", "Reset your password"]) {
    await deliverAuthEmail("family@example.test", subject, "https://example.test/token");
    assert.deepEqual(requests.at(-1)?.body.to, ["family@example.test"]);
    assert.equal(requests.at(-1)?.body.subject, subject);
    assert.match(String(requests.at(-1)?.body.text), /https:\/\/example.test\/token/);
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
});

test("only explicitly listed test addresses receive preview email", async () => {
  process.env.SQUARE_DEPLOY_CONTEXT = "deploy-preview";
  process.env.AUTH_EMAIL_TEST_RECIPIENTS = "qa@example.test, other@example.test";
  await deliverAuthEmail("QA@example.test", "Verify your email", "https://preview.example.test/token");
  for (const address of ["family@example.test", "qa@sub.example.test", "qa+family@example.test", "qa@example.test.evil", "qa@example.test, family@example.test"])
    await assert.rejects(deliverAuthEmail(address, "Reset your password", "https://preview.example.test/token"));
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.to, ["QA@example.test"]);
});

test("runtime production cannot promote a preview bundle, and runtime preview restricts production", async () => {
  for (const [build, runtime] of [["deploy-preview", "production"], ["production", "branch-deploy"]]) {
    process.env.SQUARE_DEPLOY_CONTEXT = build;
    process.env.CONTEXT = runtime;
    await assert.rejects(deliverAuthEmail("family@example.test", "Verify your email", "https://example.test/token"));
  }
  assert.equal(requests.length, 0);
});

test("missing, blank or unknown deploy context fails closed even with a test allowlist", async () => {
  process.env.AUTH_EMAIL_TEST_RECIPIENTS = "qa@example.test";
  for (const context of [undefined, "", "unknown", "Production"]) {
    if (context === undefined) delete process.env.SQUARE_DEPLOY_CONTEXT;
    else process.env.SQUARE_DEPLOY_CONTEXT = context;
    await assert.rejects(deliverAuthEmail("qa@example.test", "Verify your email", "https://example.test/token"));
  }
  assert.equal(requests.length, 0);
});

test("wildcard/domain allowlists and multiple recipients do not bypass the guard", () => {
  const preview = { SQUARE_DEPLOY_CONTEXT: "deploy-preview", AUTH_EMAIL_TEST_RECIPIENTS: "*.example.test,@example.test" };
  assert.equal(authEmailAllowed("qa@example.test", preview), false);
  for (const address of ["Name <qa@example.test>", "qa@example.test\r\nbcc:family@example.test", "qa@example.test;family@example.test"])
    assert.equal(authEmailAllowed(address, { SQUARE_DEPLOY_CONTEXT: "production" }), false);
});

test("missing credentials and provider rejection are failures rather than successful sends", async () => {
  process.env.SQUARE_DEPLOY_CONTEXT = "production";
  delete process.env.RESEND_API_KEY;
  await assert.rejects(deliverAuthEmail("qa@example.test", "Verify your email", "https://example.test/token"));
  assert.equal(requests.length, 0);
  process.env.RESEND_API_KEY = "offline-fixture-key";
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(deliverAuthEmail("qa@example.test", "Verify your email", "https://example.test/token"), /could not be delivered/);
});
