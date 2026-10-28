import { useEffect, useState } from "react";
import { getFeeWorkspace } from "@/lib/teams/fee-api";
import type { RosterRole } from "@/lib/teams/po-roster";
export function RosterRoleSelect({
  teamId,
  required = true,
  defaultValue = "",
}: {
  teamId: string;
  required?: boolean;
  defaultValue?: RosterRole | "";
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      setEnabled(false);
      getFeeWorkspace()
        .then((w) => {
          if (active) setEnabled(Boolean(w.teams.find((t) => t.id === teamId)?.poEnabled));
        })
        .catch(() => {
          if (active) setEnabled(false);
        });
    };
    refresh();
    window.addEventListener("team-budget-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("team-budget-updated", refresh);
    };
  }, [teamId]);
  return (
    <label className="grid gap-1 text-sm font-semibold">
      Player fee type
      <select
        key={`${teamId}:${enabled}`}
        name="rosterRole"
        required={required}
        defaultValue={defaultValue === "po" && !enabled ? "" : defaultValue}
        className="min-h-11 w-full rounded-lg border border-line bg-paper px-3"
      >
        <option value="">Choose player fee type</option>
        <option value="full">Full / Position Player</option>
        {enabled && <option value="po">Pitcher Only (PO)</option>}
      </select>
      <span className="text-xs font-normal">
        The assigned type determines the player’s fee. PO spots are subject to this team’s admin-set
        limit.
      </span>
    </label>
  );
}
