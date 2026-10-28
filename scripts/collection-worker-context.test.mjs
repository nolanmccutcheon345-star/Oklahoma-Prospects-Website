import test from "node:test";
import assert from "node:assert/strict";
import emailWorker from "../netlify/functions/tryout-notifications.mts";
import collectionWorker from "../netlify/functions/team-collections.mts";

test("scheduled workers use trusted deployment metadata rather than a missing build-time environment variable", async () => {
  const oldNetlify = globalThis.Netlify,
    oldFetch = globalThis.fetch;
  const requests = [];
  const values = {
    TRYOUT_NOTIFICATIONS_ENABLED: "true",
    TRYOUT_NOTIFICATIONS_SECRET: "fixture-only",
    TEAM_AUTOPAY_ENABLED: "true",
    TEAM_AUTOPAY_SANDBOX_VERIFIED: "true",
  };
  globalThis.Netlify = { env: { get: (key) => values[key] } };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response("OK");
  };
  try {
    for (const worker of [emailWorker, collectionWorker]) {
      for (const deploy of [
        { context: "deploy-preview", published: true },
        { context: "branch-deploy", published: true },
        { context: "production", published: false },
      ])
        await worker(new Request("https://fixture.invalid"), { deploy });
    }
    assert.equal(requests.length, 0);
    for (const worker of [emailWorker, collectionWorker])
      assert.equal(
        (
          await worker(new Request("https://fixture.invalid"), {
            deploy: { context: "production", published: true },
          })
        ).status,
        200,
      );
    assert.equal(requests.length, 6);
    for (const { url, options } of requests) {
      assert.equal(new URL(url).origin, "https://prospectssports.club");
      assert.equal(options.headers.Authorization, "Bearer fixture-only");
    }
    values.TRYOUT_NOTIFICATIONS_ENABLED = "false";
    values.TEAM_AUTOPAY_SANDBOX_VERIFIED = "false";
    for (const worker of [emailWorker, collectionWorker])
      await worker(new Request("https://fixture.invalid"), {
        deploy: { context: "production", published: true },
      });
    assert.equal(requests.length, 6, "operational switches still stop delivery and charges");
  } finally {
    globalThis.Netlify = oldNetlify;
    globalThis.fetch = oldFetch;
  }
});
