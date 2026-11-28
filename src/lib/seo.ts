import { CLUB } from "./club";

/** Retired public names (Oklahoma Prospects, Top Prospects) never render in page titles or descriptions. */
export function retireBrand(text: string) {
  return text.replace(/\b(?:Oklahoma Prospects(?: Academy)?|Top Prospects)\b/gi, CLUB.name);
}

function cleanTitle(title: string) {
  return retireBrand(title)
    .replace(/\s*\|\s*Prospects Sports Academy\s*$/i, "")
    .replace(/\s*\|\s*Prospects\s*$/i, "")
    .trim();
}

function cleanDescription(description: string) {
  const text = retireBrand(description).replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  const at = cut.lastIndexOf(" ");
  return `${(at > 120 ? cut.slice(0, at) : cut).trim()}…`;
}

const ORIGIN = "https://prospectssports.club";

export function pageHead(
  path: string,
  title: string,
  description: string,
  privatePage = false,
) {
  description = cleanDescription(description);
  title = cleanTitle(title);
  const url = ORIGIN + (path === "/" ? "/" : path);
  return {
    meta: [
      { title: `${title} | ${CLUB.name}` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | ${CLUB.name}` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: ORIGIN + "/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(privatePage ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
