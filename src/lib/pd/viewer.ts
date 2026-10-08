import type { PdViewer } from "./access";
/** Explicit browser projection: server grants and household IDs stay internal. */
export function publicPdViewer(viewer: PdViewer): PdViewer {
 return {role:viewer.role,email:viewer.email,name:viewer.name,playerName:viewer.playerName,
  ...(viewer.role!=="player" && viewer.householdEmails ? {householdEmails:[...viewer.householdEmails]} : {})};
}
