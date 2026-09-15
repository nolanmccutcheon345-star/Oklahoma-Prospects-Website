/** Measured contrast pairs for the Teams OS. Not eyeballed. */
export const TEAMS_CONTRAST_PAIRS: Array<{
  name: string;
  fg: string;
  bg: string;
  large?: boolean;
}> = [
  { name: "ink on paper", fg: "#11151f", bg: "#f7f6f2" },
  { name: "ink on paper-2", fg: "#11151f", bg: "#ffffff" },
  { name: "muted on paper", fg: "#5b6478", bg: "#f7f6f2" },
  { name: "muted on paper-2", fg: "#5b6478", bg: "#ffffff" },
  { name: "muted on club paper", fg: "#5b6478", bg: "#f3f6f8" },
  { name: "maroon on paper", fg: "#681c35", bg: "#f3f6f8" },
  { name: "maroon on paper-2", fg: "#681c35", bg: "#ffffff" },
  { name: "ok-maroon on paper", fg: "#7a1e2e", bg: "#f3f6f8" },
  { name: "ok-maroon on paper-2", fg: "#7a1e2e", bg: "#ffffff" },
  { name: "inverse on ink", fg: "#f4f8fb", bg: "#0b1720" },
  { name: "fg-soft on ink", fg: "#bdccd6", bg: "#0b1720" },
  { name: "powder on ink", fg: "#9ed8f3", bg: "#0b1720" },
  { name: "powder on maroon", fg: "#9ed8f3", bg: "#681c35" },
  { name: "columbia on midnight", fg: "#6ca6e6", bg: "#0b1021" },
  { name: "ink on cream", fg: "#11151f", bg: "#f2eec1" },
  { name: "maroon eyebrow on paper-2 (large)", fg: "#681c35", bg: "#ffffff", large: true },
];

export function relativeLuminance(hex: string) {
  const raw = hex.replace("#", "");
  const n = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const rgb = [0, 1, 2].map((i) => parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(fg: string, bg: string) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

export function aaPass(fg: string, bg: string, large = false) {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}
