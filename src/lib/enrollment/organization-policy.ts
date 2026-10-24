import { handbookSeeds } from "./seed";
import type { z } from "zod";
import type { documentContent, standardsSchema } from "./contracts";

export const POLICY_RELEASE = "organization-2026-10-24";
export const POLICY_EFFECTIVE_ON = "2026-10-24";
export const CONCUSSION_MATERIALS_VERSION = "prospects-concussion-2026-10-24";
export const concussionResources = [
  {
    label: "Oklahoma athlete and parent fact sheets (English and Spanish)",
    url: "https://oklahoma.gov/health/health-education/injury-prevention-service/concussions/schools-and-sports-organizations.html",
  },
  {
    label: "CDC concussion signs and emergency symptoms",
    url: "https://www.cdc.gov/heads-up/signs-symptoms/index.html",
  },
  {
    label: "CDC response and return to sport",
    url: "https://www.cdc.gov/heads-up/response/index.html",
  },
] as const;
export const concussionFacts = [
  "A concussion is a brain injury that may follow a blow to the head or body, even without losing consciousness. Symptoms can appear later. Report headache, dizziness, nausea, balance or vision changes, confusion, memory difficulty, unusual mood or sleep changes to an adult immediately. Never hide symptoms to keep playing.",
  "Stop activity immediately when concussion is suspected. There is no same-day return. A licensed healthcare provider must evaluate the athlete and give written clearance before a supervised, gradual return. A coach, parent, fee payment or enrollment status cannot provide medical clearance. Returning too early can cause another serious injury.",
  "Call 911 for seizures, repeated vomiting, worsening headache, increasing confusion, unusual behavior, slurred speech, weakness, unequal pupils or double vision, or inability to wake or stay awake after a head injury. Follow emergency-dispatch instructions. Do not attempt to diagnose the injury yourself.",
] as const;
export const CONCUSSION_ACKNOWLEDGMENT =
  "The athlete and guardian received and reviewed the displayed concussion information and linked Oklahoma athlete/parent fact sheets, understand the reporting, removal and return requirements, and acknowledge this information for the next year. The athlete gives their own acknowledgment with age-appropriate reading assistance when needed. This is an education acknowledgment, not a release of liability or medical clearance.";

export const organizationStandards: z.infer<typeof standardsSchema> = {
  designation: "developmental",
  playingTime:
    "Prospects develops athletes while competing. Every roster athlete receives instruction, feedback and meaningful opportunities appropriate to readiness, age and the team’s competition. Equal innings, a fixed position, a batting-order spot and advancement are not promised. Coaches consider safety, preparation, effort, attendance, skill readiness and game strategy; concerns receive a private development discussion. A published team addendum may explain competitive expectations but cannot reduce organization safety or development minimums.",
  practiceExpectations:
    "Attend the practices shown in the team calendar, arrive ready at the coach’s published reporting time, bring required equipment and water, and communicate conflicts. The published team offer controls the number and type of included practices; this standard adds no fee or unpromised training. Notify the coach promptly when a schedule is announced too late to meet the usual notice period.",
  tournamentCommitment:
    "Families commit to the season schedule disclosed in their team offer and subsequently published calendar. The coach communicates organizer changes and travel requirements promptly. Added events or material financial changes require the applicable owner-approved agreement; coaches cannot create new family obligations through a calendar entry. Parents arrange transportation, lodging and supervision outside official team activity.",
  evaluationMethod:
    "Use the existing athlete development record to set goals within the first 30 days, provide at least one documented in-season update and a final evaluation. Record observed skills, effort, decision-making and next steps; identify estimates and unverified measurements. A baseline assessment is recommended and is only recorded as completed after it actually occurs. Families may request a private review with the assigned coach.",
  communicationChannel:
    "Team account for schedules and availability; direct coach contact for an absence or urgent change; Steve or Nolan for financial matters; the published safety contacts for safety concerns",
  rsvpIsNotice: false,
  practiceNoticeHours: 48,
  tournamentNoticeDays: 14,
  inSeasonUpdates: 1,
  finalEvaluation: true,
};

const replacements: Record<string, string> = {
  "How this handbook works":
    "These organization policies apply to Prospects Sports Academy baseball and softball teams and relevant academy activities. The sport supplement and published team standards explain additional expectations. Organization team standards apply when no team-specific addendum is published. Your separately accepted financial agreement controls the actual services, fees, installment dates and financial obligations. Cage rentals, lessons and memberships use their own purchase terms. This handbook does not amend an earlier agreement, release claims, expand a waiver or guarantee insurance coverage. Owners publish versioned changes with effective dates; material contractual changes require a separate agreement where applicable.",
  "Development and competition":
    "Prospects combines player development with competition. Movement, skill execution, decisions, preparation, confidence and consistency matter alongside game results. Every athlete receives instruction and feedback. Younger and developmental athletes receive meaningful opportunities to learn positions and skills; competitive situations also consider readiness, performance and strategy. Fees do not buy equal innings, a particular position, a roster promotion or a lineup spot. Coaches explain their approach through published team standards and private development conversations.",
  "Development feedback and training":
    "Each enrolled team athlete receives development goals within the first 30 days, at least one documented in-season update, and a final evaluation. A higher published team requirement still applies. A baseline assessment is recommended. Coaches record observed progress and next steps in the existing development workspace and distinguish measurements from estimates. A checklist does not complete an assessment, lesson or training assignment. Workload and goals must respect age, experience, recovery and medical restrictions. Private lessons and other optional services are included only when stated in the accepted offer.",
  "Attendance and preparation":
    "For a planned absence, notify the coach at least 48 hours before practice or 14 calendar days before a tournament. Record availability in the team account and contact the coach directly unless the team’s published standards accept the account notice as sufficient. If a conflict, emergency, illness, injury or late schedule change becomes known after that deadline, communicate as soon as reasonably possible. Notify the coach before arriving late or leaving early. Notice does not automatically excuse an absence, but legitimate medical restrictions, emergencies and an impossible notice deadline are not automatic disciplinary violations. Coaches discuss recurring avoidable absences privately and document the response.",
  "Conduct and discipline":
    "Players, families and staff must treat others respectfully. Bullying, hazing, discrimination, retaliation, threats, abusive coaching, physical punishment, harassment and equipment abuse are prohibited. Routine misconduct receives a proportionate verbal warning, written warning, temporary restriction and, when warranted, removal. Serious safety concerns permit immediate protective action. For nonemergency permanent removal, ownership reviews the facts, gives the family a chance to respond, and issues a written decision. A family may request review by the other owner within 10 calendar days. Safety reporting never has to wait for this process. Financial adjustments follow the existing signed agreement and applicable rights, not an automatic punishment created by this handbook.",
  "Communication and concerns":
    "Start routine schedule or development questions with the head coach. Staff should acknowledge routine messages within 48 hours; allow until the next day for a heated, nonurgent game disagreement. Escalate unresolved operational concerns to the authorized sport coordinator and then ownership. Only Steve and Nolan administer finances. Safety concerns, suspected abuse, discrimination, medical restrictions and emergencies bypass both the coach-first rule and any cooling-off period. No person is required to report only to the subject of a concern.",
  "Withdrawal, injury and cancellation":
    "Submit a season withdrawal request to Steve or Nolan in writing. The signed season agreement and applicable law determine refunds and remaining obligations; injury, schedule conflicts and playing-time concerns do not automatically cancel it. Medical restrictions remain in force regardless of account status. If Prospects cancels a team or cannot deliver the agreed season, ownership gives the family an itemized decision within 30 calendar days, identifying delivered services, documented nonrecoverable commitments and unspent or recoverable funds. Refunds, credits and any deduction must be permitted by the signed agreement and applicable law. A canceled team is not treated as a family’s voluntary withdrawal. Cage, lesson and membership cancellation policies do not govern a seasonal team withdrawal.",
  "Replacement players and financial adjustments":
    "Only Steve or Nolan may approve a replacement offer, release an obligation, issue a refund or apply a credit. The written review identifies delivered services, unavoidable commitments, recoverable costs and new player-specific expenses. Prospects will not recover the same expense twice from departing and replacement families. Record an approved adjustment separately and preserve the original agreement. Coaches and coordinators cannot promise a refund, change a balance or collect an unapproved fee.",
  "Athlete protection":
    "Adults with regular athlete access must satisfy applicable background screening and athlete-protection training before service, including contractors and volunteers. No one may treat enrollment activation as proof that these requirements were completed. Activities must be observable and interruptible. Include a guardian or another authorized adult in communications with minors; do not use disappearing messages or secret one-to-one contact. No hazing, sexual misconduct, grooming, corporal punishment or retaliation is permitted. Anyone suspecting child abuse or neglect must report directly to Oklahoma’s 24-hour Abuse and Neglect Hotline, 1-800-522-3511; call 911 for immediate danger. An internal report does not replace an external report or delay it.",
  "Safety contacts and escalation":
    "Steve McCutcheon is the primary organization safety contact at stevemccutcheon89@gmail.com. Nolan McCutcheon is the alternate at nolanmccutcheon@icloud.com. Concerns involving Steve go directly to Nolan; concerns involving Nolan go directly to Steve. If both are involved, or an internal response is unsafe or inadequate, contact the appropriate outside authority directly. Use the restricted account safety form for nonurgent reports; these inboxes are not emergency dispatch and are not represented as monitored continuously. Call 911 for immediate danger and 1-800-522-3511 for suspected child abuse or neglect. Do not post safety reports or medical details in team messages. Ownership limits disclosure to those who need it to respond and preserves reporting records.",
  "Medical information and return to activity":
    "Guardians maintain current emergency contacts, relevant medical alerts and activity restrictions through the private enrollment form. Owners review these records and communicate the minimum necessary participation restrictions or emergency instructions to assigned staff; full medical records do not become team or coordinator records. A parent should also tell the coach about an immediate restriction. Stop activity that causes pain or unsafe symptoms. Only a qualified healthcare professional can provide a diagnosis or required return-to-play clearance. Enrollment clearance, a paid fee and a general waiver never override medical restrictions. Staff may share necessary information with emergency responders when responding to an emergency.",
  "Facility and equipment":
    "Use the Prospects Sports Facility, 3804 S. Elm Pl., Suite A, Broken Arrow, OK 74011, only for an authorized booking or scheduled activity. A responsible adult must supervise minors; a membership or access credential does not authorize unattended activity. Staff identify safe boundaries, exits and equipment rules before use. Use appropriate helmets, protective screens and sport-specific protective equipment; only an authorized adult operates a pitching machine. Keep spectators and siblings clear of active lanes, return equipment and report hazards immediately. Each participating athlete needs the current required waiver. Booking availability and purchase terms govern optional access; team enrollment does not promise unlimited facility use.",
  "Travel and supervision":
    "Parents arrange and remain responsible for transportation, lodging, meals and supervision outside official team activity. Prospects does not provide transportation or hotel supervision through team enrollment. A guardian may identify a responsible adult aged 18 or older as a private travel contact, but that does not transfer legal custody, authorize a coach to transport a minor, or establish insurance coverage. Organization-arranged travel or transport requires a separate owner-approved arrangement and verified applicable coverage before it occurs. Staff remain responsible for supervision during official practices, games, warmups and coach-directed activity.",
  "Privacy, media and technology":
    "Guardians use the family account for their own athletes. Do not let a child independently provide required enrollment or medical information through an adult account. Medical details and safety reports are restricted; operational staff receive only their authorized team information and completion status. Photos/video consent is a separate optional choice that may be declined without blocking enrollment and withdrawn for future use. Public roster and recruiting permissions remain separate. Do not publish minor contact information, medical information or private evaluations. Families may contact ownership to request access, correction or deletion of their records, subject to documented legal, safety and record-retention obligations. Current privacy and account terms continue to apply.",
  "Versions and acknowledgment":
    "The account retains the exact policy versions, signer names, acknowledgment text and date accepted by the guardian. Existing financial agreements and earlier signatures remain intact. Electronic acknowledgment is voluntary; contact ownership for an accessible or paper process when needed. Payment is not a signature, and a signature is not payment or medical clearance. Optional media consent is separate. Organization activation makes the enrollment workflow available; it does not assert that any athlete, staff member, venue or insurance requirement is already cleared.",
};

export const organizationPolicies: Record<string, z.infer<typeof documentContent>> = {
  ...handbookSeeds,
  "academy-2027": {
    title: "Prospects Sports Academy — Parent & Player Handbook",
    sections: [
      ...handbookSeeds["academy-2027"].sections.map((s) => ({
        ...s,
        body: replacements[s.title] || s.body,
      })),
      {
        title: "Concussion education and participation",
        body: "Before participation and annually, athletes and guardians receive concussion information and acknowledge it. All team and game officials complete annual comparable concussion training; ownership maintains completion records. A suspected concussion means immediate removal, no same-day return and written healthcare-provider clearance. Staff who fail to remove an athlete or bypass clearance are removed from duty pending owner review, retraining and a documented decision; serious or repeated violations can end the assignment. Steve and Nolan review this policy annually. The enrollment workspace supplies the athlete/guardian acknowledgment and Oklahoma/CDC educational resources.",
      },
      {
        title: "Emergency-response plan",
        body: "Before every practice or event, the supervising coach identifies the exact venue address, emergency access route, shelter, first-aid resources, available AED and the adults assigned to call 911, meet responders, supervise the other athletes and contact guardians. Check equipment and access before activity; do not assume an AED or trained responder is available. For an emergency, stop activity, call 911 with the exact location, follow dispatcher instructions and provide only aid within your training. Do not move a potentially serious head/neck injury unless needed to avoid immediate danger or directed by emergency personnel. Notify the guardian and ownership promptly and record the incident privately. Staff review this plan during team orientation and adapt it to each away venue.",
      },
      {
        title: "Weather, heat and hydration",
        body: "The supervising coach monitors conditions before and during activity and may stop activity for safety regardless of tournament pressure. On hearing thunder or seeing lightning, stop outdoor activity and move everyone to a substantial enclosed building or enclosed hard-topped vehicle; dugouts and open shelters are inadequate. Wait at least 30 minutes after the last thunder or lightning before resuming. Adjust activity for heat, humidity and athlete acclimatization; provide water, cooling breaks and access to shade or a cool location. Stop activity for concerning symptoms, move the athlete to safety and seek appropriate medical help; call 911 for collapse, confusion or another emergency. Follow stricter venue or governing-body requirements.",
      },
      {
        title: "Insurance and incident records",
        body: "Insurance coverage is determined by the actual applicable policies, endorsements, exclusions and insurer decisions. This handbook and enrollment activation do not certify coverage or promise payment of an injury claim. Owners maintain the relevant insurance records, verify that operations and venues are covered, and notify the insurer as required after an incident. Staff preserve factual incident records and do not promise that a claim will be paid. Existing waivers and financial agreements remain separate; no new release of liability is created by this acknowledgment.",
      },
    ],
  },
  "baseball-2027": { ...handbookSeeds["baseball-2027"], title: "Prospects Baseball Supplement" },
  "softball-2027": { ...handbookSeeds["softball-2027"], title: "Prospects Softball Supplement" },
  "medical-2027": {
    title: "Emergency Medical Authorization",
    sections: [
      {
        title: "Emergency arrangements",
        body: "If my athlete needs urgent medical attention during an official Prospects activity and I cannot be reached promptly, I authorize staff to contact emergency services and arrange evaluation and transportation by qualified emergency personnel. Treatment decisions remain with qualified medical professionals under applicable law. Staff will attempt to notify me or my designated emergency contact as soon as practical; urgent care must not be delayed while waiting for a reply.",
      },
      {
        title: "Information and limits",
        body: "I will keep emergency contacts, relevant medical alerts and activity restrictions current. I authorize necessary information to be given to emergency responders for this purpose. This authorization does not authorize elective care, give coaches medical authority, waive nonwaivable rights, permit activity against medical restrictions, or replace a provider’s clearance. Medical costs and coverage are governed by applicable law, insurance and separate agreements; this form does not guarantee insurance payment or create a new release of liability.",
      },
    ],
  },
};
