/** Manual-only disclosure for retained agreements without automatic-collection terms. */
export const teamPaymentDisclosure =
  "Team installments are paid individually through secure Square checkout. You must submit each payment by its published due date. Team checkout does not schedule automatic charges, store a primary/backup card arrangement, or retry a backup card. Processing is already included in the accepted season fee; checkout adds no second processing surcharge. Late-payment thresholds below use calendar days overdue. Roster actions and any agreed late fee require owner review and are not automatic.";

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
