import { useState } from "react";
import { emptyRegistrationFilters, type RegistrationFilters } from "@/lib/registration-filters";
export function RegistrationProfileFilters({
  onApply,
  busy = false,
}: {
  onApply: (filters: RegistrationFilters) => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState({ ...emptyRegistrationFilters });
  return (
    <details className="my-3 rounded border p-3">
      <summary className="min-h-11 cursor-pointer font-semibold">Athlete filters and pages</summary>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["sport", "Sport (Baseball / Softball)"],
            ["season", "Season"],
            ["birthYear", "Birth year"],
            ["graduationYear", "Graduation year (or unknown)"],
            ["school", "School"],
            ["suggestedDivision", "Suggested division"],
            ["age", "Requested division"],
            ["eligibilityStatus", "Review status"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              className="block min-h-11 w-full rounded border p-2"
              value={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.value, page: 0 })}
            />
          </label>
        ))}
        <label>
          Sort
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={value.sort}
            onChange={(e) =>
              setValue({ ...value, sort: e.target.value as RegistrationFilters["sort"], page: 0 })
            }
          >
            <option value="newest">Newest first</option>
            <option value="player">Player name</option>
          </select>
        </label>
      </div>
      <p className="my-2 text-sm">
        Exact matches; leave fields blank for all. Up to 100 registrations per page.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-powder p-3"
          type="button"
          disabled={busy}
          onClick={() => {
            setValue({ ...value, page: 0 });
            onApply({ ...value, page: 0 });
          }}
        >
          Apply filters
        </button>
        <button
          className="rounded border p-3"
          type="button"
          disabled={busy || value.page === 0}
          onClick={() => {
            const next = { ...value, page: Math.max(0, value.page - 1) };
            setValue(next);
            onApply(next);
          }}
        >
          Previous page
        </button>
        <button
          className="rounded border p-3"
          type="button"
          disabled={busy}
          onClick={() => {
            const next = { ...value, page: value.page + 1 };
            setValue(next);
            onApply(next);
          }}
        >
          Next page
        </button>
        <span>Page {value.page + 1}</span>
      </div>
    </details>
  );
}
