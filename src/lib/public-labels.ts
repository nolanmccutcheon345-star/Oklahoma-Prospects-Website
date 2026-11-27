/** Public team label: retire old brand names, drop internal -BSB/-SB codes, and normalize 8u → 8U. */
export function publicTeamName(name: string) {
  const cleaned = name
    .replace(/\bOklahoma Prospects\b/gi, "Prospects")
    .replace(/\bTop Prospects\b/gi, "Prospects")
    .replace(/\bProspect Navy\b/gi, "Prospects Navy")
    .replace(/\s*[-–]\s*(BSB|SB)\b/gi, "")
    .replace(/\b(\d{1,2})u\b/gi, (_, n) => `${n}U`)
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/\bprospects\b/gi, "Prospects");
}

export function publicSportLabel(sport: string) {
  const value = sport.trim();
  if (/^both$/i.test(value)) return "Baseball & Softball";
  if (/^bsb$/i.test(value)) return "Baseball";
  if (/^sb$/i.test(value)) return "Softball";
  return value;
}

export function publicEventTypeLabel(type: string) {
  if (!type) return type;
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Infer a public lesson discipline when the stored value is missing or conflicts with the name. */
export function publicLessonDiscipline(row: { name: string; discipline?: string }) {
  const fromName = /fielding/i.test(row.name)
    ? "Fielding"
    : /hitting/i.test(row.name)
      ? "Hitting"
      : /catching/i.test(row.name)
        ? "Catching"
        : /pitching/i.test(row.name)
          ? "Pitching"
          : undefined;
  if (fromName) return fromName;
  if (
    row.discipline === "Hitting" ||
    row.discipline === "Catching" ||
    row.discipline === "Fielding" ||
    row.discipline === "Pitching"
  )
    return row.discipline;
  return "Pitching";
}

export function seasonSortKey(label: string) {
  const match = label.match(/\b(Spring|Summer|Fall|Winter)\s+(\d{4})\b/i);
  if (!match) return label;
  const season = { spring: 1, summer: 2, fall: 3, winter: 4 }[match[1].toLowerCase()] || 9;
  return `${match[2]}-${season}-${label}`;
}

export function sortSeasonLabels(labels: readonly string[]) {
  return [...labels].sort((a, b) => seasonSortKey(a).localeCompare(seasonSortKey(b)));
}

/** Join public metadata chips without a trailing separator. */
export function joinMeta(...parts: Array<string | false | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && String(part).trim())).join(" · ");
}

