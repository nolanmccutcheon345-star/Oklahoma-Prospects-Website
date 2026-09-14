import "./sync-chrome.mjs";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Publish an explicit static artifact, never templates, tooling, or local state.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
const publicFiles = [
  ...readdirSync(root).filter((file) => file.endsWith(".html")),
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
];
for (const file of publicFiles) cpSync(join(root, file), join(output, file));
cpSync(join(root, "assets"), join(output, "assets"), { recursive: true });
console.log(`Static release built in dist (${publicFiles.length} files + assets).`);
