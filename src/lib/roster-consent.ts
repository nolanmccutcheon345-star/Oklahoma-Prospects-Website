export const ROSTER_CONSENT_VERSION = "public-roster-2026-10-09";
export const ROSTER_CONSENT_TEXT = "If the participant joins a Prospects Sports Academy team, I authorize Prospects Sports Academy to display the participant’s full name and jersey number on the team’s publicly accessible online roster. Team records and aggregate team statistics are also public. Individual player statistics are restricted to verified members, parents and coaches of that team and authorized administrators. This consent does not authorize publication of contact information, date of birth, medical information, private documents, or photos.";

export type PublicRosterConsent = {version: string; text: string; signedBy: string; signerEmail: string; signedAt: string; revokedAt?: string};
export function hasPublicRosterConsent(consent?: PublicRosterConsent): boolean {
  return Boolean(consent && !consent.revokedAt && consent.version === ROSTER_CONSENT_VERSION &&
    consent.text === ROSTER_CONSENT_TEXT && consent.signedBy?.trim() && consent.signerEmail?.trim() &&
    Number.isFinite(Date.parse(consent.signedAt)));
}
