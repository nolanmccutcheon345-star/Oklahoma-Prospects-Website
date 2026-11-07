/** Manual-only disclosure for retained agreements without automatic-collection terms. */
export const teamPaymentDisclosure =
  "Team installments are paid individually through secure Square checkout. You must submit each payment by its published due date. Team checkout does not schedule automatic charges, store a primary/backup card arrangement, or retry a backup card. Processing is already included in the accepted season fee; checkout adds no second processing surcharge. Late-payment thresholds below use calendar days overdue. Roster actions and any agreed late fee require owner review and are not automatic.";

export const collectionActivationDisclosure =
  "Accepting this fee agreement does not activate automatic payments. Automatic installments and backup-card retries require separate authorization and an active collection service. Until your account confirms that automatic payments are active, or while they are paused, submit each installment through secure individual Square checkout by its due date. The 20% late-fee condition below requires confirmed failures of both authorized cards and owner review; a service outage or unactivated authorization is not a card failure. Processing is already included in the season fee.";

/** Owner-directed prospective template. Applying it never changes an accepted agreement. */
export const seasonPaymentPolicy = [
  "This seasonal team agreement covers the approved team direct costs, scheduled team practices and tournaments, coaching, included uniform items and Team & Development Program services listed in this offer. Personal player equipment and gate fees are paid separately by families. Personal memberships are separate purchases at the full published site price. Lessons, cages and memberships have separate purchase and cancellation terms.",
  "Weather and tournament-director cancellations are outside Prospects' control. When a suitable replacement tournament is available within the approved budget and season, Prospects will replace a canceled tournament. If a coach leaves, a replacement coach will fill that role.",
  "A player is committed after accepting the offer and paying the deposit. Team formation requires at least nine committed players and deposits from every player on the final roster. Team expenses are funded only from that team's settled player-fee proceeds. An invitation is not a confirmed place or participation clearance.",
  "The accepted fee and payment schedule remain the guardian's responsibility. Scholarships, stacked discounts, discretionary extensions and hardship or late-fee waivers are not offered. Verified fundraising proceeds may be applied to the athlete's fee by Steve or Nolan. An account credit is not a cash receipt or a pledge of funding.",
  "Submit withdrawal requests to Steve or Nolan in writing. Before the team's first event, the contingency refund provision permits a refund of up to 50% of the player's allocated contingency, less unpaid obligations and incurred or committed costs, capped at the amount actually paid. Eligibility is reviewed within 15 business days of written notice. No refund under this provision is available after the first event. Uniform and tournament commitments are not refundable merely because a player withdraws. Team cancellation, duplicate or erroneous charges, and nonwaivable rights are reviewed separately under the applicable agreement and law. A cash refund alone does not release the remaining fee obligation.",
].join("\n\n");
export const seasonReinstatementPolicy =
  "Steve or Nolan reviews reinstatement after outstanding required payments and enrollment requirements are satisfied, subject to roster availability. Payment does not override a medical or safety restriction. Coaches and coordinators cannot change fees, deadlines or financial holds.";

/** Detect contradictory instructions before a new offer becomes signable. Historical agreements are unchanged. */
export function unsupportedTeamPaymentPolicy(policy: string, automaticPayments = false): string[] {
  const issues: string[] = [];
  const statements = policy
    .split(/[.!?\n]+/)
    .filter(
      (s) => !/\b(?:does not|do not|no automatic|not automatically|never automatically)\b/i.test(s),
    );
  if (
    !automaticPayments &&
    statements.some((s) =>
      /\b(?:auto[ -]?(?:pay|draft)|automatic(?:ally)? (?:charg|debit)|backup.{0,50}(?:charg|requir)|primary.{0,30}backup.{0,30}requir)/i.test(
        s,
      ),
    )
  )
    issues.push(
      "Remove automatic-charge or required backup-card promises: team checkout collects one-time payments only.",
    );
  if (
    policy
      .split(/[.!?\n]+/)
      .some(
        (s) =>
          /\b\d+\s+business days?\b/i.test(s) &&
          /unpaid|overdue|grace|roster hold|remov|late payment/i.test(s),
      )
  )
    issues.push(
      "Use calendar days for payment grace, roster hold and removal thresholds; business-day automation is not supported. Describe unrelated review deadlines separately.",
    );
  if (
    !automaticPayments &&
    /(?:\d+(?:\.\d+)?\s*%[^.!?\n]{0,30}late fee|late fee[^.!?\n]{0,30}\d+(?:\.\d+)?\s*%)/i.test(
      policy,
    )
  )
    issues.push(
      "Use the configured fixed-dollar late fee; percentage late fees are not supported.",
    );
  if (
    automaticPayments &&
    [
      ...policy.matchAll(
        /(\d+(?:\.\d+)?)\s*%[^.!?\n]{0,30}late fee|late fee[^.!?\n]{0,30}(\d+(?:\.\d+)?)\s*%/gi,
      ),
    ].some((m) => Number(m[1] || m[2]) !== 20)
  )
    issues.push(
      "The automatic-installment policy must use 20% of the unpaid overdue installment; future installments and prior late fees are excluded.",
    );
  return issues;
}
