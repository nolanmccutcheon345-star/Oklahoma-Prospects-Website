
/** Only active products are eligible for anonymous catalog reads. */
export function publishedServices<T extends { id: string; active: boolean }>(rows: readonly T[]): T[] {
  return rows.filter(row => row.active === true);
}
