import { z } from "zod";
import type { Sql } from "./db";

// This public DTO is intentionally separate from the private/editable profile.
const publicProfile = z.object({
  name: z.string().trim().min(1).max(120),
  specialties: z.array(z.string().max(60)).max(8),
  career: z.string().trim().min(1).max(3000),
  approach: z.string().trim().max(2000),
  ages: z.string().trim().max(500),
  achievements: z.string().trim().max(2000),
  welcome: z.string().trim().max(1000),
});
export async function publicCoachProfilesFor(sql: Sql) {
  const rows = await sql<{ id: string; profile: unknown }>`
    select id,jsonb_build_object(
      'name',profile->'name', 'specialties',profile->'specialties',
      'career',profile->'career', 'approach',profile->'approach',
      'ages',profile->'ages', 'achievements',profile->'achievements',
      'welcome',profile->'welcome'
    ) as profile from coach_profiles where published=true order by profile->>'name',id`;
  return rows.flatMap(({ id, profile }) => {
    const result = publicProfile.safeParse(profile);
    return result.success ? [{ id, profile: result.data }] : [];
  });
}
