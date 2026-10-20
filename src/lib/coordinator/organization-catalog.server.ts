import { operationalEventSessions } from "../commerce/operational-schedule.server";
/** Existing public catalog metadata only. Never hydrate commercial payloads to redact them. */
import type { Sql } from "../db";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";
import {
  organizationServiceMetadataInput,
  organizationTrainingEventMetadataInput,
  serviceNameEditable,
  type OrganizationCatalog,
  type OrganizationCatalogEvent,
  type OrganizationCatalogRegistration,
  type OrganizationCatalogService,
  type OrganizationServiceMetadataInput,
  type OrganizationTrainingEventMetadataInput,
} from "./organization-catalog-contracts";

/** Anonymous event publication also ends after the final session. Historical copy may
 * have been repurposed as private notes, so never hydrate it based on status alone. */
const publicEvent = `e.payload->>'status' in ('published','closed')
  and e.payload->>'sport' in ('Baseball','Softball','Both')
  and exists (select 1 from jsonb_array_elements(
    case when jsonb_typeof(e.payload->'sessions')='array' then e.payload->'sessions' else '[]'::jsonb end) upcoming
    where case when jsonb_typeof(upcoming->'date')='string' and upcoming->>'date' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and jsonb_typeof(upcoming->'end')='string' and upcoming->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then case when substring(upcoming->>'date',9,2)::int <=
        case substring(upcoming->>'date',6,2)::int
          when 2 then case when mod(substring(upcoming->>'date',1,4)::int,400)=0
            or (mod(substring(upcoming->>'date',1,4)::int,4)=0 and mod(substring(upcoming->>'date',1,4)::int,100)<>0) then 29 else 28 end
          when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end
        then (((upcoming->>'date') || ' ' || (upcoming->>'end'))::timestamp at time zone 'America/Chicago')>now()
        else false end
      else false end)`;

export async function organizationCatalog(sql: Sql, userId: string): Promise<OrganizationCatalog> {
  return secured(sql, userId, "organization.catalog.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    // Inactive service copy and draft/cancelled event copy have no publication guarantee.
    const services = await tx<Omit<OrganizationCatalogService, "nameEditable">>`
      select id,kind,name,discipline,purpose,detail,featured,sort_order as "sortOrder",lesson_version as revision
      from club_services where active=true and kind in ('lesson','package','membership','cage','cage_plan','fee','team_plan')
      order by sort_order,name,id`;
    const events = await tx.query<OrganizationCatalogEvent>(`
      select e.id,e.revision,md5(e.updated_at::text || coalesce(e.payload->>'name','') || coalesce(e.payload->>'description','')) as "editToken",
        case when jsonb_typeof(e.payload->'name')='string' then e.payload->>'name' else '' end as name,
        case when jsonb_typeof(e.payload->'description')='string' then e.payload->>'description' else '' end as description,
        case when e.payload->>'type' in ('camp','clinic','skills-class','small-group-training','speed-agility','showcase','combine','open-practice','special-event') then e.payload->>'type' else 'special-event' end as type,
        e.payload->>'sport' as sport,e.payload->>'status' as status,
        case when jsonb_typeof(e.payload->'location')='string' then e.payload->>'location' else '' end as location,
        coalesce((select jsonb_agg(jsonb_build_object('date',s->>'date','start',s->>'start','end',s->>'end') order by s->>'date',s->>'start')
          from jsonb_array_elements(case when jsonb_typeof(e.payload->'sessions')='array' then e.payload->'sessions' else '[]'::jsonb end) s
          where jsonb_typeof(s->'date')='string' and s->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and jsonb_typeof(s->'start')='string' and s->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            and jsonb_typeof(s->'end')='string' and s->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),'[]'::jsonb) as sessions
      from training_events e where ${publicEvent}
      order by e.updated_at desc,e.id`);
    const registrations = await tx.query<OrganizationCatalogRegistration>(`
      select r.id,r.event_id as "eventId",r.athlete_id as "athleteId",a.name as player,r.status,
        coalesce((select jsonb_agg(jsonb_build_object(
          'date',to_char(b.starts_at at time zone 'America/Chicago','YYYY-MM-DD'),
          'start',to_char(b.starts_at at time zone 'America/Chicago','HH24:MI'),
          'end',to_char(b.ends_at at time zone 'America/Chicago','HH24:MI')) order by b.starts_at,b.id)
          from operational_booking_schedule b where b.order_id=r.order_id and b.athlete_id=r.athlete_id and b.product_id=r.event_id
          and b.status in ('confirmed','completed')),'[]'::jsonb) as sessions
      from training_event_registrations r join club_athletes a on a.id=r.athlete_id join training_events e on e.id=r.event_id
      where ${publicEvent}
      order by a.name,r.created_at,r.id`);
    return {
      services: services.map((service) => ({
        ...service,
        nameEditable: serviceNameEditable(service.kind),
      })),
      events: await Promise.all(
        events.map(async (e) => ({
          ...e,
          sessions: (
            await operationalEventSessions(tx, e.id, e.sessions, e.location, {
              includeAdditional: true,
            })
          ).map((s) => ({
            date: s.date,
            start: s.start,
            end: s.end,
            ...(s.revision > 0 ? { location: s.location, status: s.status } : {}),
          })),
        })),
      ),
      registrations,
    };
  });
}

export async function saveOrganizationServiceMetadata(
  sql: Sql,
  userId: string,
  raw: OrganizationServiceMetadataInput,
) {
  return secured(sql, userId, "organization.catalog.service.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationServiceMetadataInput.parse(raw);
    const [prior] = await tx<Pick<OrganizationCatalogService, "id" | "kind" | "name" | "revision">>`
      select id,kind,name,lesson_version as revision from club_services where id=${input.id} and active=true
        and kind in ('lesson','package','membership','cage','cage_plan','fee','team_plan') for update`;
    if (!prior) throw new CoordinatorDenied();
    if (prior.revision !== input.revision)
      throw new Error("This service changed. Reload before saving.");
    if (!serviceNameEditable(prior.kind) && prior.name !== input.name)
      throw new Error(
        "This service name needs owner review. You can edit its public descriptions and display settings here.",
      );
    // Do not use saveService: it rewrites price, credits, duration and entitlement fields.
    const [saved] = await tx<{ id: string; revision: number }>`
      update club_services set name=${input.name},purpose=${input.purpose},detail=${input.detail},featured=${input.featured},sort_order=${input.sortOrder},updated_at=now()
      where id=${input.id} returning id,lesson_version as revision`;
    await audit(tx, userId, "organization.catalog.service.save", input.id, "allowed");
    return { ok: true, id: saved.id, revision: saved.revision };
  });
}

export async function saveOrganizationTrainingEventMetadata(
  sql: Sql,
  userId: string,
  raw: OrganizationTrainingEventMetadataInput,
) {
  return secured(sql, userId, "organization.catalog.event.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationTrainingEventMetadataInput.parse(raw);
    const [prior] = await tx.query<{ revision: number; editToken: string }>(
      `
      select e.revision,md5(e.updated_at::text || coalesce(e.payload->>'name','') || coalesce(e.payload->>'description','')) as "editToken"
      from training_events e where e.id=$1 and ${publicEvent} for update of e`,
      [input.id],
    );
    if (!prior) throw new CoordinatorDenied();
    if (prior.revision !== input.revision || prior.editToken !== input.editToken)
      throw new Error("This event changed. Reload before saving.");
    // Commerce uses revision to validate pending payment/fulfillment. Marketing-only edits
    // MUST preserve both revisions or an in-flight payment could enter refund review.
    // The public-copy edit token supplies independent optimistic concurrency instead.
    const [saved] = await tx<{ id: string; revision: number; editToken: string }>`
      update training_events set payload=payload || jsonb_build_object('name',${input.name}::text,'description',${input.description}::text),
        updated_by=${userId},updated_at=now() where id=${input.id}
      returning id,revision,md5(updated_at::text || coalesce(payload->>'name','') || coalesce(payload->>'description','')) as "editToken"`;
    await audit(tx, userId, "organization.catalog.event.save", input.id, "allowed");
    return { ok: true, id: saved.id, revision: saved.revision, editToken: saved.editToken };
  });
}
