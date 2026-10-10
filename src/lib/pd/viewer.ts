import type { PdViewer } from "./access";
/** Explicit browser projection: server grants and household IDs stay internal. */
export function publicPdViewer(viewer: PdViewer): PdViewer {
 return {...(viewer.canInstruct!==undefined?{canInstruct:viewer.canInstruct}:{}),...(viewer.playerIds?{playerIds:[...viewer.playerIds]}:{}),role:viewer.role,email:viewer.email,name:viewer.name,playerName:viewer.playerName,
  ...(viewer.role!=="player" && viewer.householdEmails ? {householdEmails:[...viewer.householdEmails]} : {})};
}
