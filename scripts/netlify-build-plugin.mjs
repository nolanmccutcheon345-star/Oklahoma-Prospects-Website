import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

// Netlify's deploy context/URL exist at build time, not necessarily in Functions.
// Pin only this project's exact preview origin; never trust an incoming Host.
export function previewAuthOrigin(env) {
  if (env.CONTEXT !== "deploy-preview") return null;
  if (env.SITE_ID !== "c49ad0ab-1b2c-412e-88d9-1f6ddf490a17")
    throw new Error("Preview authentication requires the Prospects Netlify site");
  const value = env.DEPLOY_PRIME_URL;
  if (
    !/^https:\/\/deploy-preview-[1-9][0-9]*--oklahoma-prospects\.netlify\.app\/?$/.test(value || "")
  )
    throw new Error("Preview authentication requires an exact Prospects preview origin");
  return new URL(value).origin;
}

// Build-only Netlify Functions adapter. Local development uses the application's
// ordinary Vite server; no Netlify emulator or certificate generator is needed.
export function netlifyBuildPlugin() {
  let root;
  return {
    name: "prospects:netlify-ssr",
    apply: "build",
    applyToEnvironment(environment) {
      return environment.name === "ssr";
    },
    configResolved(config) {
      root = config.root;
    },
    async writeBundle(_options, bundle) {
      const authOrigin = previewAuthOrigin(process.env);
      const entries = Object.values(bundle).filter((item) => item.type === "chunk" && item.isEntry);
      if (entries.length !== 1) {
        throw new Error(`Netlify SSR requires exactly one server entry; found ${entries.length}`);
      }
      const directory = join(root, ".netlify/v1/functions");
      const entry = resolve(root, this.environment.config.build.outDir, entries[0].fileName);
      const importPath = relative(directory, entry).split(sep).join("/");
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "server.mjs"),
        [
          ...(authOrigin
            ? [
                `process.env.BETTER_AUTH_URL = ${JSON.stringify(authOrigin)};`,
                `const { default: server } = await import(${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)});`,
              ]
            : [
                `import server from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};`,
              ]),
          'if (typeof server?.fetch !== "function") throw new Error("Invalid Netlify SSR fetch entry");',
          "export default server.fetch;",
          'export const config = { name: "Prospects SSR", generator: "prospects:netlify-ssr@1", path: "/*", preferStatic: true };',
          "",
        ].join("\n"),
      );
    },
  };
}
