import { z } from "zod";
import type { Sql } from "./db";
import type { ClubRole } from "./club-data";

export const legacyProgramInput = z.object({ athlete: z.string().trim().min(1).max(120), focus: z.string().trim().min(1).max(120) }).strict();
export const legacyDrillInput = z.object({ programId: z.number().int().positive(), name: z.string().trim().min(1).max(150), detail: z.string().trim().max(3000) }).strict();
type Viewer = { userId: string; role: ClubRole };

function requireAuthor(viewer: Viewer) {
  if (!["parent", "coach", "admin"].includes(viewer.role))
    throw new Error("Players can follow assigned programs, but cannot create programs or assign drills.");
}

export async function createLegacyProgram(sql: Sql, viewer: Viewer, input: z.infer<typeof legacyProgramInput>) {
  requireAuthor(viewer);
  const data = legacyProgramInput.parse(input);
  const [row] = await sql<{ id: number }>`insert into programs (user_id, athlete, focus)
    values (${viewer.userId}, ${data.athlete}, ${data.focus}) returning id`;
  return { id: row.id };
}

export async function addLegacyDrill(sql: Sql, viewer: Viewer, input: z.infer<typeof legacyDrillInput>) {
  requireAuthor(viewer);
  const data = legacyDrillInput.parse(input);
  // Ownership and insertion are one statement; the supplied ID never grants access.
  const rows = await sql<{ id: number }>`insert into drills (program_id, user_id, name, detail)
    select id, ${viewer.userId}, ${data.name}, ${data.detail} from programs
    where id = ${data.programId} and user_id = ${viewer.userId} returning id`;
  if (!rows.length) throw new Error("Choose a program belonging to your account.");
  return { ok: true };
}
