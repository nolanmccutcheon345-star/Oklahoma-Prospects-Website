import test from "node:test";
import assert from "node:assert/strict";
import { MissingDatabaseConnectionError } from "@netlify/database";
import { configuredDatabaseUrl } from "./database-config";

const missing = () => { throw new MissingDatabaseConnectionError(); };

test("production can use the managed Netlify database binding", () => {
  assert.equal(configuredDatabaseUrl({ CONTEXT: "production" }, () => "native-production"), "native-production");
});

test("previews use their managed branch and never the explicit production database", () => {
  const env = { CONTEXT: "deploy-preview", DATABASE_URL: "production", NETLIFY_DATABASE_URL: "legacy-production" };
  assert.equal(configuredDatabaseUrl(env, () => "native-preview"), "native-preview");
  assert.equal(configuredDatabaseUrl(env, missing), undefined);
});

test("explicit preview and external production connections retain precedence", () => {
  assert.equal(configuredDatabaseUrl({ CONTEXT: "deploy-preview", PREVIEW_DATABASE_URL: " preview " }, missing), "preview");
  assert.equal(configuredDatabaseUrl({ CONTEXT: "production", DATABASE_URL: " external " }, missing), "external");
});
