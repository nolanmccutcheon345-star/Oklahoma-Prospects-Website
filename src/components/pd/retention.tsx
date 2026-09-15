import { useDevelopment } from "@/lib/pd/context";
import { churnForFamily } from "@/lib/pd/engines";
import { cn } from "@/lib/utils";

export function RetentionDesk() {
  const { data } = useDevelopment();
  const rows = data.families
    .map((family) => churnForFamily(family, data))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score);

  return (
    <section className="pd-stack" data-retention-desk="true">
      <div className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Retention
          </p>
          <h3 className="mt-2 text-2xl italic">Families at risk.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            Scored from calendar gaps, unused credits, missed points, and missing baselines. Not a
            vibe.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No watch or high-risk families on this file.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.family.id} className="rounded-2xl bg-paper-2 shadow-border">
              <div className="pd-card">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-2xl uppercase">{row.family.name}</span>
                  <span
                    className={cn(
                      "pd-num text-sm font-semibold tracking-wide uppercase",
                      row.level === "high" ? "text-maroon" : "text-muted",
                    )}
                  >
                    {row.level} · {row.score}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {row.athletes.map((a: { name: string }) => a.name).join(" · ")}
                </p>
                <ul className="mt-3 grid gap-2">
                  {row.signals.map((signal: { label: string; detail: string; fix: string }) => (
                    <li key={signal.label} className="pd-row rounded-xl bg-paper">
                      <strong>{signal.label}</strong>
                      <span className="mt-1 block text-sm text-muted">{signal.detail}</span>
                      <span className="mt-1 block text-sm text-maroon">{signal.fix}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
