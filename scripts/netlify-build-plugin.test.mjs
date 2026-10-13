import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { netlifyBuildPlugin, previewAuthOrigin } from "./netlify-build-plugin.mjs";

test("preview auth pins only this project's exact trusted build origin", () => {
  const env = {
    CONTEXT: "deploy-preview",
    SITE_ID: "c49ad0ab-1b2c-412e-88d9-1f6ddf490a17",
    DEPLOY_PRIME_URL: "https://deploy-preview-197--oklahoma-prospects.netlify.app",
  };
  assert.equal(previewAuthOrigin(env), env.DEPLOY_PRIME_URL);
  assert.equal(previewAuthOrigin({ ...env, CONTEXT: "production" }), null);
  assert.equal(previewAuthOrigin({ ...env, CONTEXT: "branch-deploy" }), null);
  assert.equal(previewAuthOrigin({}), null);
  assert.throws(() => previewAuthOrigin({ ...env, SITE_ID: "another-site" }));
  for (const value of [
    undefined,
    "https://evil.example",
    env.DEPLOY_PRIME_URL + ".evil.example",
    env.DEPLOY_PRIME_URL + "/login",
    env.DEPLOY_PRIME_URL + "?a=b",
    env.DEPLOY_PRIME_URL.replace("https", "http"),
    "https://user@deploy-preview-197--oklahoma-prospects.netlify.app",
  ]) {
    assert.throws(() => previewAuthOrigin({ ...env, DEPLOY_PRIME_URL: value }));
  }
});

test("preview Function configures auth before loading the application", async () => {
  const root = await mkdtemp(join(tmpdir(), "prospects-preview-auth-"));
  const keys = ["CONTEXT", "SITE_ID", "DEPLOY_PRIME_URL", "BETTER_AUTH_URL"];
  const prior = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      CONTEXT: "deploy-preview",
      SITE_ID: "c49ad0ab-1b2c-412e-88d9-1f6ddf490a17",
      DEPLOY_PRIME_URL: "https://deploy-preview-197--oklahoma-prospects.netlify.app",
      BETTER_AUTH_URL: "https://prospectssports.club",
    });
    const plugin = netlifyBuildPlugin();
    plugin.configResolved({ root });
    await mkdir(join(root, "dist/server"), { recursive: true });
    await writeFile(
      join(root, "dist/server/entry.mjs"),
      "const origin=process.env.BETTER_AUTH_URL; export default { fetch: async () => new Response(origin) };",
    );
    await plugin.writeBundle.call(
      { environment: { config: { build: { outDir: "dist/server" } } } },
      {},
      { server: { type: "chunk", isEntry: true, fileName: "entry.mjs" } },
    );
    const handler = await import(pathToFileURL(join(root, ".netlify/v1/functions/server.mjs")));
    assert.equal(await (await handler.default()).text(), process.env.DEPLOY_PRIME_URL);
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("Netlify build adapter emits a callable Function with static-asset preference", async () => {
  const root = await mkdtemp(join(tmpdir(), "prospects-netlify-"));
  try {
    const plugin = netlifyBuildPlugin();
    assert.equal(plugin.apply, "build");
    assert.equal(plugin.applyToEnvironment({ name: "client" }), false);
    assert.equal(plugin.applyToEnvironment({ name: "ssr" }), true);
    plugin.configResolved({ root });
    await mkdir(join(root, "dist/server"), { recursive: true });
    await writeFile(
      join(root, "dist/server/entry.mjs"),
      "export default { fetch: async request => new Response(new URL(request.url).pathname) };",
    );
    const context = { environment: { config: { build: { outDir: "dist/server" } } } };
    await plugin.writeBundle.call(
      context,
      {},
      {
        server: { type: "chunk", isEntry: true, fileName: "entry.mjs" },
        asset: { type: "asset", fileName: "other.txt" },
      },
    );
    const handler = await import(pathToFileURL(join(root, ".netlify/v1/functions/server.mjs")));
    assert.equal(
      await (await handler.default(new Request("https://example.invalid/book"))).text(),
      "/book",
    );
    assert.equal(handler.config.path, "/*");
    assert.equal(handler.config.preferStatic, true);
    await assert.rejects(plugin.writeBundle.call(context, {}, {}), /found 0/);
    await assert.rejects(
      plugin.writeBundle.call(
        context,
        {},
        {
          a: { type: "chunk", isEntry: true },
          b: { type: "chunk", isEntry: true },
        },
      ),
      /found 2/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
