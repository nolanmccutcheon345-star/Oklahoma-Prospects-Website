import {CLUB} from './club';
export const WAIVER_VERSION='facility-2026-09-15';
// Existing legal wording, preserved verbatim. This is not a legal-content revision.
export const WAIVER_PARAGRAPHS=[
 `In consideration of using the Oklahoma Prospects facility at ${CLUB.addressLine1}, ${CLUB.addressLine2}, I understand that baseball, softball, and athletic training involve risk of injury, including serious injury. I voluntarily assume those risks for myself and, if signing for a minor, for that athlete.`,
 'I release Oklahoma Prospects, its owners, coaches, and staff from claims arising from ordinary participation, except for claims caused by gross negligence or willful misconduct. I confirm I am legally authorized to sign, and that emergency contact information is accurate.',
 `This waiver covers Prospects activity for one year from the signature date. Questions: ${CLUB.phoneDisplay}.`,
];
export const WAIVER_TEXT=WAIVER_PARAGRAPHS.join('\n\n');
