import { useId, useState } from "react";

export function athleteScope(role?: string) {
  return role === "admin"
    ? "All athletes."
    : role === "coach"
      ? "Your assigned athletes, confirmed or completed lesson athletes, and your linked household."
      : role === "player"
        ? "Your linked player record."
        : "Athletes linked to your household.";
}

export function AthleteSelector({
  athletes,
  value,
  onChange,
  scope,
}: {
  athletes: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  scope: string;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const matches = athletes.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // Keep the current selection visible without silently switching athletes when searching.
  const options = athletes.filter((a) => a.id === value || matches.includes(a));
  return (
    <div className="grid min-w-0 gap-2">
      {athletes.length >= 8 && (
        <label className="grid gap-1 text-sm">
          Search athletes
          <input
            type="search"
            className="min-h-11 w-full min-w-0 rounded-lg border p-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <label className="grid gap-1">
        Choose Athlete
        <select
          aria-label="Choose Athlete"
          required
          className="min-h-11 w-full min-w-0 rounded-lg border bg-white p-2 text-ink"
          value={value}
          aria-describedby={id}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select an athlete</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p id={id} className="text-sm text-muted">
        {scope}
      </p>
      {search && (
        <p role="status" className="text-sm">
          {matches.length} matching athletes
          {value && !matches.some((a) => a.id === value) ? "; current selection retained" : ""}.
        </p>
      )}
    </div>
  );
}
