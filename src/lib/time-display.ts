/** Format wall-clock values for display without changing stored scheduling values. */
export function formatClockTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b(?!\s*(?:am|pm))/gi,
    (_, h, m) => `${Number(h) % 12 || 12}:${m}${Number(h) < 12 ? "am" : "pm"}`);
}

export function parseClockTime(value: string): string | null {
  const match = /^(1[0-2]|[1-9]):([0-5]\d)\s*(am|pm)$/i.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return `${String(hour).padStart(2,"0")}:${match[2]}`;
}
