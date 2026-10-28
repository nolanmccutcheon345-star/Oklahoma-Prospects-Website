import test from "node:test";
import assert from "node:assert/strict";
import { feeEmailReadiness, collectionLaunchReadiness } from "./launch-readiness";

test("email diagnostics explain missing worker setup without leaking configured credentials", () => {
  const env = {
    SQUARE_DEPLOY_CONTEXT: "production",
    CONTEXT: "production",
    RESEND_API_KEY: "fixture-provider-secret",
    RESEND_FROM_EMAIL: "fixture@example.invalid",
  };
  assert.deepEqual(feeEmailReadiness(env).blockers, [
    "Scheduled email delivery has not been enabled.",
    "The email worker authentication key has not been configured.",
  ]);
  const configured = {
    ...env,
    TRYOUT_NOTIFICATIONS_ENABLED: "true",
    TRYOUT_NOTIFICATIONS_SECRET: "fixture-worker-secret",
  };
  assert.equal(feeEmailReadiness(configured).enabled, true);
  assert.equal(feeEmailReadiness({ ...configured, CONTEXT: "" }).enabled, true);
  assert.equal(feeEmailReadiness({ ...configured, CONTEXT: "deploy-preview" }).enabled, false);
  assert.equal(
    feeEmailReadiness({ ...configured, SQUARE_DEPLOY_CONTEXT: "deploy-preview" }).enabled,
    false,
  );
  assert.equal(
    feeEmailReadiness({ ...configured, INVITATION_EMAIL_PAUSED: "true" }).enabled,
    false,
  );
  for (const value of [
    "fixture-provider-secret",
    "fixture-worker-secret",
    "fixture@example.invalid",
  ])
    assert.ok(!JSON.stringify(feeEmailReadiness(configured)).includes(value));
});

test("production collection diagnosis does not require copying sandbox credentials into production", () => {
  const verified = collectionLaunchReadiness({
    SQUARE_DEPLOY_CONTEXT: "production",
    TEAM_AUTOPAY_ENABLED: "true",
    TEAM_AUTOPAY_SANDBOX_VERIFIED: "true",
  });
  assert.deepEqual(verified.blockers, []);
  assert.equal(verified.sandboxSettingsLocal, false);
  const pending = collectionLaunchReadiness({ SQUARE_DEPLOY_CONTEXT: "production" });
  assert.equal(pending.blockers.length, 2);
  assert.ok(pending.blockers.some((reason) => reason.includes("acceptance testing")));
});
