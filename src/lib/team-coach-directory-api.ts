import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/** Owner-only directory of existing lesson coaches and staff; emails never enter public responses. */
export const getAssignableTeamCoaches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { clubIdentity } = await import("@/lib/identity.server");
    const me = await clubIdentity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const { readWorkingFile } = await import("@/lib/pd/desk-impl.server");
    const { listStaffDirectory } = await import("@/lib/staff-directory.server");
    const [desk, staff] = await Promise.all([readWorkingFile(), listStaffDirectory(context.userId)]);
    const combined = [
      ...desk.coaches.filter(c => c.active !== false).map(c => ({ name: c.name, email: c.email, source: "Lesson coach" })),
      ...staff.map(c => ({ name: c.name, email: c.email, source: "Staff directory" })),
    ];
    return Array.from(new Map(combined.filter(c => c.email?.includes("@")).map(c => [c.email.trim().toLowerCase(), { ...c, email: c.email.trim().toLowerCase() }])).values()).sort((a,b) => a.name.localeCompare(b.name));
  });

/** Public team-coaching identities: only names and team details, never email or private records. */
export const getPublicTeamCoaches = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [row] = await sql<{ payload: unknown; demo: boolean }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  if (!row || row.demo) return [] as { name: string; teams: { id: string; name: string; sport: "baseball" | "softball"; age: string }[] }[];
  const raw = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const teams = (raw && typeof raw === "object" && Array.isArray((raw as { teams?: unknown }).teams)) ? (raw as { teams: unknown[] }).teams : [];
  const coaches = new Map<string, { name: string; teams: { id: string; name: string; sport: "baseball" | "softball"; age: string }[] }>();
  for (const candidate of teams) {
    if (!candidate || typeof candidate !== "object") continue;
    const t = candidate as Record<string, unknown>;
    if (t.closed === true || typeof t.id !== "string" || typeof t.name !== "string" || (t.sport !== "baseball" && t.sport !== "softball") || typeof t.age !== "string") continue;
    const summary = { id: t.id, name: t.name, sport: t.sport as "baseball" | "softball", age: t.age };
    const members: { name: string; email: string }[] = [];
    if (typeof t.headCoach === "string" && typeof t.coachEmail === "string") members.push({ name: t.headCoach, email: t.coachEmail });
    if (Array.isArray(t.staff)) for (const person of t.staff) {
      if (person && typeof person === "object" && typeof person.name === "string" && typeof person.email === "string") members.push({ name: person.name, email: person.email });
    }
    for (const person of members) {
      const email = person.email.trim().toLowerCase(), name = person.name.trim();
      if (!email.includes("@") || !name || name.length > 150) continue;
      const existing = coaches.get(email) ?? { name, teams: [] };
      if (!existing.teams.some(team => team.id === summary.id)) existing.teams.push(summary);
      coaches.set(email, existing);
    }
  }
  return [...coaches.values()].sort((a,b) => a.name.localeCompare(b.name));
});
