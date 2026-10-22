export type Collection = {
  status: string;
  environment: string;
  category?: string;
  amount_cents: number;
  refunded_cents?: number;
  processingFee?: number | null;
};
/** Provider collections only. Bank transfers and team receipt mirrors must never
 * be added as revenue a second time. Missing fees are unknown, not zero. */
export function collectionTotals(payments: Collection[]) {
  const groups = new Map<
    string,
    {
      category: string;
      count: number;
      gross: number;
      refunds: number;
      knownFees: number;
      missingFees: number;
    }
  >();
  for (const p of payments) {
    if (p.environment !== "production" || p.status !== "COMPLETED") continue;
    const category = p.category || "Unclassified Square sale";
    const row = groups.get(category) || {
      category,
      count: 0,
      gross: 0,
      refunds: 0,
      knownFees: 0,
      missingFees: 0,
    };
    row.count++;
    row.gross += p.amount_cents;
    row.refunds += p.refunded_cents || 0;
    if (p.processingFee == null) row.missingFees++;
    else row.knownFees += p.processingFee;
    groups.set(category, row);
  }
  const rows = [...groups.values()]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((r) => ({
      ...r,
      afterRefunds: r.gross - r.refunds,
      afterFees: r.missingFees ? null : r.gross - r.refunds - r.knownFees,
    }));
  const sum = (key: "gross" | "refunds" | "knownFees" | "missingFees") =>
    rows.reduce((n, r) => n + r[key], 0);
  return {
    rows,
    gross: sum("gross"),
    refunds: sum("refunds"),
    knownFees: sum("knownFees"),
    missingFees: sum("missingFees"),
    afterRefunds: sum("gross") - sum("refunds"),
    afterFees: sum("missingFees") ? null : sum("gross") - sum("refunds") - sum("knownFees"),
  };
}
