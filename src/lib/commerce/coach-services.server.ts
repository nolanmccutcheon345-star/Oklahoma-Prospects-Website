import type { Sql } from "../db";
import type { Coach } from "../pd/types";

/** Public booking choices come from admin assignments, never editable coach bios. */
export async function bookableCoaches(sql: Sql, roster: Coach[]) {
  const rows = await sql<{
    id: string;
    name: string;
    email: string;
    service_ids: string[];
    specialties: string[];
  }>`
    select staff.id, staff.name, staff.email,
      array_agg(service.id order by service.sort_order, service.id) as service_ids,
      array_agg(distinct service.discipline) as specialties
    from club_staff staff
    join club_staff_services offer on offer.staff_id=staff.id
    join club_services service on service.id=offer.service_id
    where staff.active=true and staff.role in ('coach','admin') and staff.email<>''
      and service.active=true and service.kind='lesson'
    group by staff.id, staff.name, staff.email order by staff.name, staff.id`;
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const email = row.email.trim().toLowerCase();
    const coach = roster.find((c) => c.email.trim().toLowerCase() === email);
    // Same identifier as first-sign-in provisioning; existing schedule IDs stay intact.
    const id = coach?.id || `c-${email.replace(/[^a-z0-9]/g, "").slice(0, 18) || "staff"}`;
    if (coach?.active === false || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: row.name, serviceIds: row.service_ids, specialties: row.specialties }];
  });
}

export async function requireCoachService(
  sql: Sql,
  roster: Coach[],
  coachId: string | undefined,
  serviceId: string,
) {
  const coach = (await bookableCoaches(sql, roster)).find((c) => c.id === coachId);
  if (!coach?.serviceIds.includes(serviceId))
    throw new Error("This coach is not assigned to this service. Choose an available coach.");
  return coach;
}

/** Run inside the staff-save transaction so invalid assignments cannot erase existing ones. */
export async function replaceCoachServices(
  sql: Sql,
  staffId: string,
  offerings: { serviceId: string; profitSplit: number }[],
) {
  const ids = offerings.map((o) => o.serviceId);
  if (new Set(ids).size !== ids.length) throw new Error("Choose each service once.");
  const services = await sql<{
    id: string;
  }>`select id from club_services where id=any(${ids}::text[]) and kind='lesson'`;
  if (services.length !== ids.length)
    throw new Error("Choose existing lesson services for this coach.");
  if (
    offerings.some(
      (o) => !Number.isInteger(o.profitSplit) || o.profitSplit < 0 || o.profitSplit > 100,
    )
  )
    throw new Error("Coach shares must be whole percentages from 0 to 100.");
  await sql`delete from club_staff_services where staff_id=${staffId}`;
  for (const offer of offerings)
    await sql`insert into club_staff_services(staff_id,service_id,profit_split) values(${staffId},${offer.serviceId},${offer.profitSplit})`;
}
