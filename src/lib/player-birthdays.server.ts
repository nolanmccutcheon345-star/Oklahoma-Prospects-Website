import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { chicagoDate, validDate } from "./scheduling";
import type { ClubRecord } from "./teams/types";

export function validatePlayerBirthday(value: string) {
  if (!validDate(value) || value > chicagoDate())
    throw new Error("Enter a valid date of birth that is not in the future.");
}

/** Neither owner access nor a lesson booking grants access to a child's birthday. */
export async function birthdayAccess(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  const homes = me.role === "player" ? me.guardianHouseholdIds : me.billingHouseholdIds;
  const children = await sql<{
    id: string;
  }>`select id from club_athletes where household_id=any(${homes}::text[])`;
  const parentIds = new Set(children.map((a) => a.id));
  const [row] = await sql<{
    payload: ClubRecord;
    demo: boolean;
  }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  const club =
    typeof row?.payload === "string" ? (JSON.parse(row.payload) as ClubRecord) : row?.payload;
  const teamIds = new Set<string>();
  const rosterPlayers = new Map<string, { name: string; guardianEmail: string }>();
  if (club && !row.demo)
    for (const team of club.teams) {
      if (team.closed) continue;
      const assigned =
        team.coachEmail?.trim().toLowerCase() === me.email ||
        team.staff.some((s) => /coach/i.test(s.role) && s.email?.trim().toLowerCase() === me.email);
      for (const player of team.roster) {
        if (player.withdrawn) continue;
        const guardians = (player.parents || [])
          .map((p) => p.email?.trim().toLowerCase())
          .filter(Boolean);
        rosterPlayers.set(player.id, { name: player.name, guardianEmail: guardians[0] || "" });
        if (guardians.includes(me.email)) parentIds.add(player.id);
        if (assigned) teamIds.add(player.id);
      }
    }
  return { me, parentIds, rosterPlayers, visibleIds: new Set([...parentIds, ...teamIds]) };
}

export async function missingPlayerBirthdays(sql: Sql, userId: string) {
  const { me, parentIds, rosterPlayers } = await birthdayAccess(sql, userId);
  const ids = [...new Set([...parentIds, ...me.playerIds])];
  const saved = await sql<{
    id: string;
    name: string;
    birth_date: string | null;
  }>`select id,name,birth_date::text as birth_date from club_athletes where id=any(${ids}::text[])`;
  const rows = ids
    .filter((id) => !saved.find((a) => a.id === id)?.birth_date)
    .map((id) => ({
      id,
      name: saved.find((a) => a.id === id)?.name || rosterPlayers.get(id)?.name || me.name,
    }));
  // An unlinked player creates only their own record; never match children by name.
  if (me.role === "player" && !me.playerIds.length) rows.push({ id: "self", name: me.name });
  return rows;
}

export async function privatePlayerBirthday(sql: Sql, userId: string, athleteId: string) {
  const { visibleIds } = await birthdayAccess(sql, userId);
  if (!visibleIds.has(athleteId))
    throw new Error(
      "Only this player’s parent/guardian or assigned team coach can view their birthday.",
    );
  const [row] = await sql<{
    birth_date: string | null;
  }>`select birth_date::text as birth_date from club_athletes where id=${athleteId}`;
  return { birthDate: row?.birth_date || null };
}

export async function completePlayerBirthday(
  sql: Sql,
  userId: string,
  athleteId: string,
  birthDate: string,
) {
  validatePlayerBirthday(birthDate);
  const { me, parentIds, rosterPlayers } = await birthdayAccess(sql, userId);
  return sql.transaction(async (tx) => {
    if (athleteId === "self") {
      if (me.role !== "player" || me.playerIds.length)
        throw new Error("Select your linked player record.");
      const id = `player:${userId}`;
      await tx`insert into club_athletes(id,user_id,household_email,name,birth_date) values(${id},${userId},${me.email},${me.name},${birthDate}) on conflict(id) do nothing`;
      const [saved] = await tx<{
        birth_date: string;
      }>`select birth_date::text from club_athletes where id=${id} for update`;
      if (saved.birth_date !== birthDate)
        throw new Error(
          "A birthday is already saved. Ask your parent or assigned team coach to correct it.",
        );
      await tx`insert into person_player_links(user_id,player_id) values(${userId},${id}) on conflict do nothing`;
    } else {
      if (!parentIds.has(athleteId) && !me.playerIds.includes(athleteId))
        throw new Error("This player is not linked to your account.");
      const [row] = await tx<{
        birth_date: string | null;
      }>`select birth_date::text from club_athletes where id=${athleteId} for update`;
      if (!row) {
        const roster = rosterPlayers.get(athleteId);
        const householdEmail = parentIds.has(athleteId)
          ? me.email
          : roster?.guardianEmail || me.email;
        await tx`insert into club_athletes(id,user_id,household_email,name,birth_date) values(${athleteId},${userId},${householdEmail},${roster?.name || me.name},${birthDate})`;
      }
      if (row?.birth_date && row.birth_date !== birthDate)
        throw new Error(
          "A birthday is already saved. Ask your parent or assigned team coach to correct it.",
        );
      await tx`update club_athletes set birth_date=${birthDate} where id=${athleteId}`;
    }
    await tx`update pd_working_file set revision=revision+1,updated_at=now() where id='club'`;
    return { ok: true };
  });
}
