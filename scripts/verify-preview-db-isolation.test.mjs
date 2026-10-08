import assert from "node:assert/strict";
import test from "node:test";
import {
  comparePreviewDatabaseTargets,
  validatePreviewOrigin,
  verifyIsolationResponse,
} from "./verify-preview-db-isolation.mjs";

const origin = "https://deploy-preview-133--oklahoma-prospects.netlify.app";
const a = "a".repeat(64), b = "b".repeat(64);
const health = fingerprint => ({
  statusCode: 200,
  body: { status: "configured", databaseSource: "postgres", databaseFingerprint: fingerprint },
});

test("preview lookup only accepts our Netlify project's numbered HTTPS deploy origin", () => {
  assert.equal(validatePreviewOrigin(origin),origin);
  for (const candidate of [
    "http://deploy-preview-133--oklahoma-prospects.netlify.app",
    "https://oklahoma-prospects.netlify.app",
    "https://deploy-preview-133--other-project.netlify.app",
    "https://deploy-preview-133--oklahoma-prospects.netlify.app.evil.tld",
    "https://deploy-preview-133--oklahoma-prospects.netlify.app/bypass",
    "https://deploy-preview-133--oklahoma-prospects.netlify.app?token=abc",
    "https://user:secret@deploy-preview-133--oklahoma-prospects.netlify.app",
    "not a url",
  ]) assert.throws(() => validatePreviewOrigin(candidate));
});

test("same destination fails closed even with different credentials or deployed versions", () => {
  assert.throws(() => verifyIsolationResponse(health(a), health(a)), /same database destination/);
  assert.equal(verifyIsolationResponse(health(a),health(b)),true);
  for(const response of [
    {statusCode:503,body:{status:"unverified",databaseSource:"pglite",databaseFingerprint:null}},
    {statusCode:200,body:{status:"configured",databaseSource:"pglite",databaseFingerprint:b}},
    {statusCode:200,body:{status:"configured",databaseSource:"postgres",databaseFingerprint:"not-a-hash"}},
  ]) assert.throws(() => verifyIsolationResponse(health(a),response));
});

test("comparison sends GET only to fixed production and validated preview paths", async () => {
 const calls = [];
 const mockFetch = async (url,options) => {
   const dest = String(url); calls.push({url:dest,method:options.method,redirect:options.redirect});
   const body=dest.startsWith("https://prospectsbaseball.club/")?health(a).body:health(b).body;
   return {status:200,headers:new Headers({"cache-control":"private, no-store"}),json:async()=>body};
 };
 assert.deepEqual(await comparePreviewDatabaseTargets(origin,mockFetch),{
   production:"https://prospectsbaseball.club",preview:origin,
 });
 assert.deepEqual(calls.map(c=>c.url),[
   "https://prospectsbaseball.club/api/health",
   origin+"/api/health",
 ]);
 assert.ok(calls.every(c=>c.method==="GET"&&c.redirect==="error"));
});
