import type { RosterRole } from "@/lib/teams/po-roster";
export function RosterRoleSelect({
  required = true,
  defaultValue = "",
}: {
  required?: boolean;
  defaultValue?: RosterRole | "";
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      Player fee type
      <select
        name="rosterRole"
        required={required}
        defaultValue={defaultValue}
        className="min-h-11 w-full rounded-lg border border-line bg-paper px-3"
      >
        <option value="">Choose player fee type</option>
        <option value="full">Full / Position Player</option>
        <option value="po">Pitcher Only (PO)</option>
      </select>
      <span className="text-xs font-normal">
        The assigned type determines the player’s fee. PO spots are subject to this team’s admin-set
        limit.
      </span>
    </label>
  );
}
