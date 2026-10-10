import assert from "node:assert/strict";
import test from "node:test";
import { releaseMatches, validateProductionOrigin, verifyHostedRelease } from "./check-deployed-release.mjs";

const main = "c17acd0a35320856ff49d9b91b37b88d444dffdb";
const previous = "1dd527cc1470002606d8d1ab4713874669dca16f";
const origin = "https://prospectssports.club";
const manifest = (commit = main, changes = {}) => ({
  commit, dirty: false, builtAt: "2026-10-08T16:00:00.000Z",
  migrations: [{ name: "0001.sql", sha256: "a".repeat(64) }], ...changes,
});
const response = (body, status = 200, contentType = "application/json") =>
  new Response(contentType.includes("json") ? JSON.stringify(body) : body,
    { status, headers: { "Content-Type": contentType } });

test("production URL cannot be redirected to previews, other hosts or injected credentials", () => {
  assert.equal(validateProductionOrigin(origin).origin, origin);
  for (const raw of [
    "http://prospectssports.club",
    "https://another.example.invalid",
    "https://deploy-preview-110--oklahoma-prospects.netlify.app",
    "https://prospectssports.club:444",
    "https://user:secret@prospectssports.club",
    "https://prospectssports.club/other",
    "https://prospectssports.club/?query=1",
  ]) assert.throws(() => validateProductionOrigin(raw), undefined, raw);
});

test("the deployed release must exactly match main and contain verified clean provenance", () => {
  assert.equal(releaseMatches(manifest(), main).ok, true);
  assert.match(releaseMatches(manifest(previous), main).reason, /differs/);
  assert.match(releaseMatches(manifest(main, { dirty: true }), main).reason, /clean/);
  assert.equal(releaseMatches(manifest(main, { builtAt: "no-date" }), main).ok, false);
  assert.equal(releaseMatches(manifest(main, { migrations: [{ name: "bad", sha256: "no" }] }), main).ok, false);
  assert.equal(releaseMatches({ commit: "short" }, main).ok, false);
  assert.equal(releaseMatches(null, main).ok, false);
});

test("a stale production commit retries with no-cache and succeeds only after an exact match", async () => {
  const requests = [], sleeps = [], messages = [];
  const documents = [manifest(previous), manifest(main)];
  const release = await verifyHostedRelease({
    origin, expectedCommit: main, attempts: 2, intervalMs: 10,
    request: async (url, options) => {
      requests.push({ url: url.toString(), options });
      return response(documents.shift());
    },
    pause: async ms => { sleeps.push(ms); },
    report: line => messages.push(line),
  });
  assert.equal(release.commit, main);
  assert.deepEqual(sleeps, [10]);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].url.includes("/release.json?audit="));
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(requests[0].options.headers["Cache-Control"], "no-cache");
  assert.match(messages[0], /NOT VERIFIED/);
  assert.match(messages[1], /PASS production/);
});

test("HTML fallbacks, HTTP errors and permanently stale Netlify releases fail closed", async () => {
  for (const failure of [
    () => response("<!doctype html>", 200, "text/html"),
    () => response({ error: "not found" }, 404),
    () => response(manifest(previous)),
    () => response(manifest(main, { dirty: true })),
  ]) {
    const logs = [];
    await assert.rejects(
      verifyHostedRelease({
        origin, expectedCommit: main, attempts: 2, intervalMs: 0,
        request: async () => failure(), pause: async () => {},
        report: line => logs.push(line),
      }),
      /Production provenance FAILED/,
    );
    assert.equal(logs.length, 2);
    assert.ok(logs.every(line => line.startsWith("NOT VERIFIED")));
  }
});

test("network failure, invalid expected SHA and malformed config cannot report deployment success", async () => {
  await assert.rejects(verifyHostedRelease({
    origin, expectedCommit: main, attempts: 1, intervalMs: 0,
    request: async () => { throw new Error("connection refused"); }, report: () => {},
  }), /Production provenance FAILED: release.json request failed/);
  await assert.rejects(verifyHostedRelease({
    origin, expectedCommit: "main", request: async () => response(manifest()),
  }), /complete lowercase main SHA/);
  await assert.rejects(verifyHostedRelease({
    origin, expectedCommit: main, attempts: 0, request: async () => response(manifest()),
  }), /Invalid attempt count/);
});
