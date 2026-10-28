/** Public team cards should not imply a competitive record has been published when all counts are zero. */
export function publicRecordLabel(record: { w: number; l: number; t: number }): string | null {
  const { w, l, t } = record;
  if (![w, l, t].every((value) => Number.isInteger(value) && value >= 0)) return null;
  if (w + l + t === 0) return null;
  return `Record: ${w}–${l}–${t} (W–L–T)`;
}
