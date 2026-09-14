import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Static HTML stays the deployment format. Shared chrome is stamped at build time,
// so navigation, phone links, the footer and current-page state work without JS.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const parts = Object.fromEntries(
  ["header", "footer", "mobile-nav"].map((name) => [
    name,
    readFileSync(join(root, "_includes", `${name}.html`), "utf8").trim(),
  ]),
);
const groups = {
  "/training": ["/training", "/recruiting"],
  "/teams": ["/teams", "/tryouts", "/roster", "/schedule"],
  "/visit": ["/visit", "/waiver", "/parents", "/contact"],
};
function currentLinks(markup, route) {
  return markup.replace(/<a href="(\/[^"#?]*)">/g, (tag, href) => {
    if (href === route) return tag.replace(">", ' aria-current="page">');
    if (groups[href]?.includes(route))
      return tag.replace(">", ' aria-current="location">');
    return tag;
  });
}
function replacePart(html, name, markup, legacy) {
  const block = `<!-- shared-${name}:start -->\n${markup}\n<!-- shared-${name}:end -->`;
  const marker = new RegExp(
    `<!-- shared-${name}:start -->[\\s\\S]*?<!-- shared-${name}:end -->`,
  );
  if (marker.test(html)) return html.replace(marker, block);
  if (legacy.test(html)) return html.replace(legacy, block);
  throw new Error(`Missing ${name} insertion point`);
}
let count = 0;
for (const file of readdirSync(root).filter((file) => file.endsWith(".html"))) {
  const route = file === "index.html" ? "/" : `/${file.replace(".html", "")}`;
  let html = readFileSync(join(root, file), "utf8");
  html = html.replace(/<div class="utility">[\s\S]*?<\/div>\s*<\/div>\s*/, "");
  html = replacePart(
    html,
    "header",
    currentLinks(parts.header, route),
    /<header class="site-header">[\s\S]*?<\/header>/,
  );
  html = replacePart(
    html,
    "footer",
    parts.footer,
    /<footer class="site-footer">[\s\S]*?<\/footer>/,
  );
  html = replacePart(
    html,
    "mobile-nav",
    currentLinks(parts["mobile-nav"], route),
    /<div class="mobile-book">[\s\S]*?<\/div>/,
  );
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\/assets\/(?:brand-tokens|shared-chrome)\.css[^\"]*"\s*\/?>(?:\s*)/g,
    "",
  );
  html = html.replace(
    /(<link\s+rel="stylesheet"\s+href="\/assets\/style\.css[^\"]*"\s*\/?>)/,
    '<link rel="stylesheet" href="/assets/brand-tokens.css?v=7" />\n$1',
  );
  html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="/assets/shared-chrome.css?v=7" />\n</head>',
  );
  html = html.replace(
    /\/assets\/(style\.css|prospects-brand\.css|site\.js)(?:\?v=\d+)?/g,
    "/assets/$1?v=7",
  );
  // Normalize the club's public name without changing any service URLs.
  html = html.replace(/Oklahoma Prospects\s+Baseball/g, "Oklahoma Prospects");
  html = html.replace(
    /(?:Top )?Prospects Training Facility/g,
    "Oklahoma Prospects",
  );
  html = html.replace(/Top Prospects/g, "Oklahoma Prospects");
  html = html.replace(/Mon–Fri · 4–8 PM/g, "Mon–Fri 4:00–8:00 PM reserved");
  html = html.replace(
    /Sat–Sun · 1–8 PM by reservation/g,
    "Sat–Sun 1:00–8:00 PM by reservation",
  );
  html = html.replace(
    /https:\/\/prospects-waiver-checkin\.stevemccutcheon89\.chatgpt\.site\/check-in/g,
    "/visit",
  );
  html = html.replace(
    /https:\/\/prospects-waiver-checkin\.stevemccutcheon89\.chatgpt\.site/g,
    "/waiver",
  );
  // Preserve existing deep booking destinations while keeping all Book links same-tab.
  html = html.replace(
    /<a\b[^>]*href="https:\/\/book\.prospectsbaseball\.club\/[^\"]*"[^>]*>/g,
    (tag) => tag.replace(/\s+target="_blank"/g, ""),
  );
  writeFileSync(join(root, file), html);
  count++;
}
console.log(`Shared chrome updated on ${count} marketing pages.`);
