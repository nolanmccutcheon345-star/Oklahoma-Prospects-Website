import { useMemo, useState } from "react";

type Version = {
  program_id: string; version: number; status: string; data_label: string; blocked_fields: unknown;
  approved_by: string | null; sports_science_reviewed_by: string | null; safety_reviewed_by: string | null;
  non_assignable_reason: string | null; snapshot_hash: string; ceiling_refs: unknown;
};
type Program = { id: string; name: string; sport: string; category: string; current_version: number; disabled_at: string | null };
type Row = { id: string; version: number; name?: string; label?: string; category?: string; kind?: string; sport?: string; status?: string; data_label: string };
type Pin = { program_id: string; program_version: number; active_assignments: number };

const TABS = ["Programs", "Exercises", "Drills", "Config & research"] as const;

/** Read-only admin library. Review, approval and activation are not exposed here. */
export function TeamDevelopmentLibraryView({ programs, versions, exercises, drills, config, pins }: {
  programs: Program[]; versions: Version[]; exercises: Row[]; drills: Row[]; config: Row[]; pins: Pin[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Programs");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (...values: (string | undefined | null)[]) => !q || values.some((v) => String(v || "").toLowerCase().includes(q));
  const pinCount = useMemo(() => new Map(pins.map((p) => [p.program_id + "@" + p.program_version, p.active_assignments])), [pins]);
  const rows = tab === "Exercises" ? exercises : tab === "Drills" ? drills : config;
  return (
    <section className="rounded-xl border border-line bg-white p-4" aria-label="Team development library">
      <p className="text-xs font-semibold uppercase tracking-widest text-maroon">Team development</p>
      <h2 className="text-2xl">Program library (read-only)</h2>
      <p className="mt-2 text-sm text-muted">
        Seed content is DRAFT / ESTIMATE. Only ACTIVE versions with recorded sports-science and safety reviews, a named human
        expert sign-off, no blocked fields and APPROVED age-band ceilings can be assigned. Softball windmill volume is blocked for every role.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={"min-h-11 rounded-lg border px-3 text-sm " + (tab === t ? "border-maroon bg-paper-2 font-semibold" : "border-line")}>{t}</button>
        ))}
        <input aria-label="Search library" className="office-control min-h-11 flex-1" placeholder="Search by name or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {tab === "Programs" ? (
        <div className="mt-4 grid gap-2">
          {programs.filter((p) => match(p.id, p.name, p.category, p.sport)).map((program) => (
            <article key={program.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2"><strong>{program.name}</strong><span className="text-xs">{program.id} · {program.sport} · {program.category}</span></div>
              <ul className="mt-2 grid gap-1">
                {versions.filter((v) => v.program_id === program.id).map((v) => {
                  const blocked = Array.isArray(v.blocked_fields) ? v.blocked_fields.length : 0;
                  const refs = Array.isArray(v.ceiling_refs) ? v.ceiling_refs.length : 0;
                  const pinned = pinCount.get(v.program_id + "@" + v.version) || 0;
                  return (
                    <li key={v.version} className="rounded bg-paper-2 px-2 py-1 text-xs">
                      v{v.version} · {v.status} · {v.data_label}
                      {v.version === program.current_version ? " · current" : ""}
                      {blocked ? ` · ${blocked} blocked field${blocked === 1 ? "" : "s"}` : ""}
                      {v.non_assignable_reason ? " · NOT ASSIGNABLE (" + v.non_assignable_reason.replaceAll("_", " ") + ")" : ""}
                      {refs ? "" : " · no ceiling linked"}
                      {" · sports science: " + (v.sports_science_reviewed_by || "not reviewed")}
                      {" · safety: " + (v.safety_reviewed_by || "not reviewed")}
                      {" · sign-off: " + (v.approved_by || "none")}
                      {" · pinned by " + pinned + " active assignment" + (pinned === 1 ? "" : "s")}
                      <span className="block font-mono text-[10px] text-muted">snapshot {v.snapshot_hash.slice(0, 12) || "—"}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
          {!programs.length ? <p className="text-sm">No team-development seed has been imported yet.</p> : null}
        </div>
      ) : (
        <ul className="mt-4 grid gap-1">
          {rows.filter((r) => match(r.id, r.name, r.label, r.category, r.kind)).map((r) => (
            <li key={r.id + "@" + r.version} className="rounded border px-3 py-2 text-sm">
              <strong>{r.name || r.label || r.id}</strong>
              <span className="ml-2 text-xs text-muted">{r.id} v{r.version} · {r.kind || r.category}{r.sport ? " · " + r.sport : ""} · {r.status ? r.status + " · " : ""}{r.data_label}</span>
            </li>
          ))}
          {!rows.length ? <p className="text-sm">Nothing imported in this library yet.</p> : null}
        </ul>
      )}
    </section>
  );
}
