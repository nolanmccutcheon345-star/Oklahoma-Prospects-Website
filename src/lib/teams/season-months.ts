// Inclusive service dates, with each partial calendar month prorated by its days.
export function serviceMonths(start: string, end: string): number | null {
  if (![start, end].every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)) || end < start) return null;
  const a = new Date(start + "T00:00:00Z"),
    b = new Date(end + "T00:00:00Z");
  if (
    !Number.isFinite(+a) ||
    !Number.isFinite(+b) ||
    a.toISOString().slice(0, 10) !== start ||
    b.toISOString().slice(0, 10) !== end
  )
    return null;
  let total = 0,
    y = a.getUTCFullYear(),
    m = a.getUTCMonth();
  for (let i = 0; i < 37; i++) {
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const last = y === b.getUTCFullYear() && m === b.getUTCMonth();
    total += ((last ? b.getUTCDate() : days) - (i === 0 ? a.getUTCDate() : 1) + 1) / days;
    if (last) return Math.round(total * 100) / 100;
    if (++m === 12) {
      m = 0;
      y++;
    }
  }
  return null;
}
