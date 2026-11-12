import { useState } from "react";
import { OFFICE_TOOL_GROUPS } from "@/lib/office-tools";
import type { OfficeSection } from "./front-office-shell";

export function OfficeCommandCenter({
  onSection,
}: {
  onSection: (section: OfficeSection) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const groups = OFFICE_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) =>
      `${group.title} ${tool.label} ${tool.description}`.toLocaleLowerCase().includes(needle),
    ),
  })).filter((group) => group.tools.length);
  const cardClass =
    "block min-h-24 rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-maroon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";
  return (
    <section aria-labelledby="office-tools-title" className="grid gap-5">
      <div>
        <h2 id="office-tools-title" className="text-2xl">
          Your academy, one workspace
        </h2>
        <p className="mt-1 text-sm text-muted">
          Open your existing tools and saved records here. Staff and families keep their own
          permitted workspaces.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm font-semibold">
          Find a tool
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try rosters, bookings, finance or website"
            className="office-control min-h-11 w-full"
          />
        </label>
        {query && (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm"
            onClick={() => setQuery("")}
          >
            Clear search
          </button>
        )}
      </div>
      {needle && (
        <p role="status" className="text-sm text-muted">
          {groups.reduce((count, group) => count + group.tools.length, 0)} tools found
        </p>
      )}
      {!groups.length && (
        <p className="rounded-xl border border-line bg-white p-4">
          No matching tools. Try a different search or clear it to see everything.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="grid gap-3">
          <h3 className="text-lg font-semibold">{group.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.tools.map((tool) => {
              const content = (
                <>
                  <span className="block font-semibold text-maroon">{tool.label}</span>
                  <span className="mt-1 block text-sm text-muted">{tool.description}</span>
                </>
              );
              return tool.section ? (
                <button
                  type="button"
                  key={tool.label}
                  onClick={() => onSection(tool.section)}
                  className={cardClass}
                >
                  {content}
                </button>
              ) : (
                <a key={tool.label} href={tool.href} className={cardClass}>
                  {content}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
