import type { DevelopmentData } from "./types";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Three-way recovery: combine independent edits; never overwrite a concurrently edited record. */
export function mergeDraft(base: DevelopmentData, local: DevelopmentData, remote: DevelopmentData): DevelopmentData {
  const result = { ...remote } as unknown as Record<string, unknown>;
  for (const key of Object.keys(local) as (keyof DevelopmentData)[]) {
    if (key === "revision" || equal(local[key], base[key])) continue;
    if (equal(remote[key], base[key]) || equal(remote[key], local[key])) { result[key] = local[key]; continue; }
    const before = base[key], ours = local[key], theirs = remote[key];
    if (Array.isArray(before) && Array.isArray(ours) && Array.isArray(theirs) &&
      [...before, ...ours, ...theirs].every(row => row && typeof row === "object" && "id" in row)) {
      const rows = new Map(theirs.map(row => [(row as { id: string }).id, row]));
      const prior = new Map(before.map(row => [(row as { id: string }).id, row]));
      const edits = new Map(ours.map(row => [(row as { id: string }).id, row]));
      for (const id of new Set([...prior.keys(), ...edits.keys()])) {
        if (equal(prior.get(id), edits.get(id))) continue;
        if (!equal(rows.get(id), prior.get(id)) && !equal(rows.get(id), edits.get(id))) throw new Error(`Conflicting edits in ${key}. Your draft has been retained.`);
        if (edits.has(id)) rows.set(id, edits.get(id)!); else rows.delete(id);
      }
      // Newest local additions lead; stable IDs prevent duplicates after an uncertain response.
      const localIds = ours.map(row => (row as { id: string }).id);
      result[key] = [...new Set([...localIds, ...rows.keys()])].filter(id => rows.has(id)).map(id => rows.get(id));
    } else {
      throw new Error(`Conflicting edits in ${key}. Your draft has been retained.`);
    }
  }
  result.revision = remote.revision;
  return result as unknown as DevelopmentData;
}
