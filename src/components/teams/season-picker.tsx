import { seasonOptions } from "@/lib/teams/seasons";

export function SeasonPicker({ value, onChange, label, disabled }: {
  value: string[]; onChange: (seasons: string[]) => void; label: string; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="rounded-lg border border-line p-3">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <p className="mb-2 text-xs text-muted">Select every season this team plays.</p>
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {seasonOptions(value).map(season => <label key={season} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={value.includes(season)} onChange={e => onChange(e.target.checked ? [...value, season] : value.filter(s => s !== season))} />
        {season}
      </label>)}
    </div>
  </fieldset>;
}
