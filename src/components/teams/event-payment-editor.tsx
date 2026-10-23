import { eventPaymentSchema, type FeeBudget } from "@/lib/teams/fee-model";
export function EventPaymentEditor({
  value,
  onChange,
}: {
  value: NonNullable<FeeBudget["eventPaymentSchedule"]>;
  onChange: (value: NonNullable<FeeBudget["eventPaymentSchedule"]>) => void;
}) {
  const parsed = eventPaymentSchema.safeParse(value);
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend>Payments before first scheduled event</legend>
      {value.percentages.map((n, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <label className="grid gap-1">
            {["Deposit", "Second payment", "Final payment"][i]} (%)
            <input
              className="office-control w-full"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={n / 100}
              onChange={(e) =>
                onChange({
                  ...value,
                  percentages: value.percentages.map((v, j) =>
                    j === i ? Math.round(Number(e.target.value) * 100) : v,
                  ),
                })
              }
            />
          </label>
          <label className="grid gap-1">
            {["Deposit", "Second payment", "Final payment"][i]} weeks before first event
            <input
              className="office-control w-full"
              type="number"
              min="0"
              max="52"
              step="1"
              value={value.weeksBefore[i]}
              onChange={(e) =>
                onChange({
                  ...value,
                  weeksBefore: value.weeksBefore.map((v, j) =>
                    j === i ? Number(e.target.value) : v,
                  ),
                })
              }
            />
          </label>
        </div>
      ))}
      {!parsed.success && <p role="alert">{parsed.error.issues.map((e) => e.message).join(" ")}</p>}
      <p className="text-sm">
        Percentages must total 100%. The final payment absorbs cent rounding. Dates use the
        organization’s local calendar.
      </p>
    </fieldset>
  );
}
