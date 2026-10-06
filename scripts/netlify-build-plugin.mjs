import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

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
          `import server from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};`,
          'if (typeof server?.fetch !== "function") throw new Error("Invalid Netlify SSR fetch entry");',
          "export default server.fetch;",
          'export const config = { name: "Prospects SSR", generator: "prospects:netlify-ssr@1", path: "/*", preferStatic: true };',
          "",
        ].join("\n"),
      );
    },
  };
}
