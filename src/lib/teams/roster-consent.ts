import { ROSTER_CONSENT_TEXT, ROSTER_CONSENT_VERSION } from '../roster-consent';
import type { ClubRecord } from './types';

export function recordTeamRosterConsent(club: ClubRecord, input: {teamId: string; playerId: string; signerName: string; consent: true}, viewer: {role: string; email: string; familyIds: string[]}, now = new Date()) {
  const team = club.teams.find(t => t.id === input.teamId && !t.closed);
  const player = team?.roster.find(p => p.id === input.playerId && !p.withdrawn);
  if (!player || viewer.role !== 'parent' || !viewer.familyIds.includes(player.familyId))
    throw new Error('Only a parent or legal guardian in this player’s household can sign.');
  if (input.consent !== true || !input.signerName.trim()) throw new Error('Read and agree to the roster consent before signing.');
  player.rosterConsent = {version: ROSTER_CONSENT_VERSION, text: ROSTER_CONSENT_TEXT,
    signedBy: input.signerName.trim(), signerEmail: viewer.email, signedAt: now.toISOString()};
  club.audit.unshift({at: now.toISOString(), action: 'roster-consent', detail: `${player.name} on ${team!.name}: ${ROSTER_CONSENT_VERSION}`});
  return club;
}
