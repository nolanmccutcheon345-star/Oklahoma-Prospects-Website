import { z } from "zod";
import type { Sql } from "../db";
import type { ClubRecord } from "./types";

export const seasonSaveInput = z.object({
  teamId: z.string().min(1).max(150), baseRev: z.number().int().nonnegative(),
  seasons: z.array(z.string().trim().min(3).max(100)).min(1).max(12)
    .refine(s => new Set(s).size === s.length, "Remove duplicate seasons."),
}).strict();

export async function persistTeamSeasons(sql: Sql, input: z.infer<typeof seasonSaveInput>) {
  const data = seasonSaveInput.parse(input);
  return sql.transaction(async tx => {
    const [row] = await tx<{payload: ClubRecord; rev: number; demo: boolean}>`select payload,rev,demo from club_state where id='oklahoma-prospects' for update`;
    if (!row || row.rev !== data.baseRev) throw new Error("The club changed. Reload before saving seasons.");
    const club: ClubRecord = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const team = club.teams.find(t => t.id === data.teamId);
    if (!team) throw new Error("Team not found.");
    team.seasons = data.seasons;
    team.seasonLabel = data.seasons.join(" & ");
    club._rev = row.rev + 1;
    club._savedAt = new Date().toISOString();
    club._demo = row.demo;
    club.audit.unshift({at: club._savedAt, action: "team-season", detail: `${team.name}: ${team.seasonLabel}`});
    await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=${club._rev},updated_at=now() where id='oklahoma-prospects' and rev=${row.rev}`;
    return club;
  });
}
