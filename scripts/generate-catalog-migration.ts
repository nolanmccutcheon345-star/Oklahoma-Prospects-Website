// Explicit, reproducible catalog bootstrap. Run locally, review SQL, commit it.
import { writeFileSync } from "node:fs";
import { LESSON_CATALOG, LESSON_PACKAGES, DEVELOPMENT_PLANS } from "../src/lib/catalog";
import { MEMBERSHIPS, RENTALS } from "../src/lib/club";
const rows = [
  ...LESSON_CATALOG.map((p,i) => ({ ...p, kind: "lesson", sort_order: 10+i, group_session: p.group, requires_assessment: p.requiresAssessment, entry: p.entry, credits: 0 })),
  ...LESSON_PACKAGES.map((p,i) => ({ ...p, kind: "package", expires_days: p.expiresDays, sort_order: 100+i })),
  ...DEVELOPMENT_PLANS.map((p,i) => ({ ...p, kind: "membership", credits: p.lessons, sort_order: 200+i, discipline: "Pitching" })),
  ...RENTALS.map((p,i) => ({ ...p, kind: "cage", minutes: 60, sort_order: 300+i })),
  ...MEMBERSHIPS.map((p,i) => ({ ...p, id: p.name.toLowerCase().replaceAll(" ","-"), kind: "cage_plan", credits: p.hours, minutes: p.hours*60, sort_order: 400+i })),
];
const lit = (value: unknown) => typeof value === "number" ? String(value) : typeof value === "boolean" ? String(value) : `'${String(value ?? "").replaceAll("'", "''")}'`;
let sql = "-- Generated from pricing.ts/catalog.ts/club.ts. Initial seed only; reads never reset prices.\n";
for (const source of rows) {
  const r = source as Record<string, unknown>;
  const values = { id:r.id, kind:r.kind, name:r.name, discipline:r.discipline || "Cage", price:r.price,
    minutes:r.minutes || 0, credits:r.credits || 0, remote:r.remote || 0, expires_days:r.expires_days || 0,
    hours:r.hours || 0, entry:r.entry || false, group_session:r.group_session || false,
    requires_assessment:r.requires_assessment || false, purpose:r.purpose || r.bestFor || "", detail:r.detail || r.bestFor || "",
    includes_json:JSON.stringify(r.includes || r.perks || []), extra_json:JSON.stringify({ unit:r.unit, lanes:r.lanes, period:r.period, hourly:r.hourly, bestFor:r.bestFor, savings:r.savings, perks:r.perks }),
    active:true, sort_order:r.sort_order };
  sql += `insert into club_services (${Object.keys(values).join(",")}) values (${Object.values(values).map(lit).join(",")}) on conflict (id) do nothing;\n`;
}
sql += "\n-- The four explicit corrections approved in the audit request.\nupdate club_services set price = case id when 'm1' then 239 when 'p2' then 385 when 'p3' then 740 when 's9' then 150 end where id in ('m1','p2','p3','s9');\n";
sql += "update club_services set entry = true, requires_assessment = false where id in ('s1','s4','s9');\nupdate club_services set requires_assessment = true where kind in ('lesson','package') and id not in ('s1','s4','s6','s9');\n";
writeFileSync("migrations/0008_catalog.sql",sql);
