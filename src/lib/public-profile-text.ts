export function publicProfileText(value: string | undefined | null) {
  return (value || "")
    .split(/\n\s*\n/)
    .filter((line) => line.trim() && !/^(na|n\/a|none|bio coming soon\.?|tbd)$/i.test(line.trim()))
    .join("\n\n");
}
export function publicCoachName(value: string) {
  return value.replace(/\bMOO-SONG\b/g, "Moo-Song");
}
