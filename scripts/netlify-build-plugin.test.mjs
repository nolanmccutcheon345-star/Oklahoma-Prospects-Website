import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { netlifyBuildPlugin } from "./netlify-build-plugin.mjs";

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
