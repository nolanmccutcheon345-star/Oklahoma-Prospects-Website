/** Facility-only checkout for independently paid instruction with Rachael Blake. */
export const RACHAEL_CAGE_SERVICE = "rachael-cage-60";
export const RACHAEL_COACH_ID = "c-d5ae129775a2e0118a85541172a72fd5";
export const RACHAEL_CAGE_CENTS = 3500;
export const RACHAEL_CAGE_MINUTES = 60;
export const RACHAEL_CAGE_TERMS =
  "$35 pays Prospects for one hour of cage time. Pay Coach Rachael separately for instruction. No evaluation required.";

export function isRachaelCageLesson(kind: string, id: string) {
  return kind === "lesson" && id === RACHAEL_CAGE_SERVICE;
}

/** All allowed resource IDs here are runnable cages, never the fielding area. */
export function hasOneRachaelCage(resources: readonly string[]) {
  const lanes = resources.filter((id) => id.startsWith("lane:"));
  return lanes.length === 1 && /^lane:(1|2|5|6|7)$/.test(lanes[0]);
}
