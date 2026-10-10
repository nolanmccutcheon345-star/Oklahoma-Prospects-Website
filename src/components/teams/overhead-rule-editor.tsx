import type { OverheadRule } from "@/lib/teams/facility-overhead";
export function OverheadRuleEditor({
  value,
  onChange,
  inherit = false,
}: {
  value?: OverheadRule;
  onChange: (v: OverheadRule | undefined) => void;
  inherit?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label className="grid gap-1">
        Facility overhead contribution
        <select
          className="office-control w-full"
          value={value?.mode || (inherit ? "inherit" : "automatic")}
          onChange={(e) =>
            onChange(
              e.target.value === "inherit"
                ? undefined
                : e.target.value === "fixed"
                  ? { mode: "fixed", monthly: 50000 }
                  : e.target.value === "percent"
                    ? { mode: "percent", bps: 1000 }
                    : { mode: "automatic" },
            )
          }
        >
          {inherit && <option value="inherit">Use current master default</option>}
          <option value="automatic">Automatic — paying-player share</option>
          <option value="percent">Percentage of monthly facility overhead</option>
          <option value="fixed">Fixed monthly amount</option>
        </select>
      </label>
      {value?.mode === "percent" && (
        <label className="grid gap-1">
          Percentage (%)
          <input
            className="office-control w-full"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={value.bps / 100}
            onChange={(e) =>
              onChange({ mode: "percent", bps: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
      )}
      {value?.mode === "fixed" && (
        <label className="grid gap-1">
          Monthly team contribution ($)
          <input
            className="office-control w-full"
            type="number"
            min="0"
            step="0.01"
            value={value.monthly / 100}
            onChange={(e) =>
              onChange({ mode: "fixed", monthly: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
      )}
    </div>
  );
}
