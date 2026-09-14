import "./sync-chrome.mjs";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
const publicFiles = [
  ...readdirSync(root).filter((file) => file.endsWith(".html")),
  ...readdirSync(root).filter((file) =>
    [
      "booking-refresh.css",
      "tryouts.css",
      "tryouts.js",
      "payment-fees.js",
      "scheduler-navigation.js",
      "development-catalog.js",
      "site-signals.js",
      "cage-rentals-no-qr.jpg",
    ].includes(file),
  ),
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
];
for (const file of publicFiles) cpSync(join(root, file), join(output, file));
cpSync(join(root, "assets"), join(output, "assets"), { recursive: true });
if (existsSync(join(root, "brand"))) {
  cpSync(join(root, "brand"), join(output, "brand"), { recursive: true });
}
console.log(
  `Static release built in dist (${publicFiles.length} files + assets + brand).`,
);
await import('./check-release.mjs');
