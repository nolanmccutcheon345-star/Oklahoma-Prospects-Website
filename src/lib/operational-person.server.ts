import type { Sql } from "./db";
import type { Availability, Coach } from "./pd/types";
import { availabilityInput } from "./coaching-contracts";
export type OperationalPersonSetting = {
  user_id: string;
  revision: number;
  contact_email: string;
  phone: string;
  directory_active: boolean;
  coach_id: string;
  windows: { weekday: string; start: string; end: string }[] | null;
  availability_source: string;
  unavailable_service_ids: string[];
  classified_profile_revision: number | null;
};
export async function operationalPersonSettings(sql: Sql) {
  return sql<OperationalPersonSetting>`select user_id,revision,contact_email,phone,directory_active,coach_id,windows,availability_source,unavailable_service_ids,classified_profile_revision from operational_person_settings`;
}
export function availabilitySourceKey(rows: Availability[]) {
  return JSON.stringify(
    rows.map((a) => [a.id, a.weekday, a.window]).sort((a, b) => a[0].localeCompare(b[0])),
  );
}
/** Scheduling-only inputs for new selections, never prepared/paid validation,
 * compensation recognition or account authorization. */
export async function operationalCoachAvailability(
  sql: Sql,
  roster: Coach[],
  availability: Availability[],
) {
  const settings = await operationalPersonSettings(sql);
  const coaches = roster.map((c) =>
    settings.some((s) => s.coach_id === c.id && !s.directory_active) ? { ...c, active: false } : c,
  );
  const overridden = settings.filter(
    (s) =>
      s.coach_id &&
      s.windows !== null &&
      s.availability_source ===
        availabilitySourceKey(availability.filter((a) => a.coachId === s.coach_id)),
  );
  return {
    coaches,
    availability: [
      ...availability.filter(
        (a) =>
          !overridden.some((s) => s.coach_id === a.coachId) &&
          !settings.some((s) => s.coach_id === a.coachId && !s.directory_active),
      ),
      ...overridden
        .filter((s) => s.directory_active)
        .flatMap((s) =>
          availabilityInput
            .parse({ windows: s.windows })
            .windows.map((w, i) => ({
              id: `operational:${s.coach_id}:${i}`,
              coachId: s.coach_id,
              weekday: w.weekday,
              window: `${w.start}–${w.end}`,
            })),
        ),
    ],
  };
}
