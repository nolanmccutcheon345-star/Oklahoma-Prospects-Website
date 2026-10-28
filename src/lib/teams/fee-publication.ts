import {
  calculateFees,
  scheduleRows,
  withBillableMonths,
  money,
  type FeeBudget,
} from "./fee-model";
import { feeExplanationText } from "./fee-explanation";
import { collectionConsent } from "./collection-policy";
import { separateMembershipPolicy } from "./retired-membership";
import { collectionActivationDisclosure, teamPaymentDisclosure } from "./payment-policy";

/** The exact prospective family offer shared by review and publication. No private budget fields. */
export function publicationOffer(b: FeeBudget, poEnabled: boolean, final: string, asOf: string) {
  b = withBillableMonths(b);
  const f = calculateFees(b);
  const schedules = {
    full: scheduleRows(b, f.full, "full", final, asOf).map((r, i) =>
      i || b.eventPaymentSchedule ? r : { ...r, due: "" },
    ),
    po: poEnabled
      ? scheduleRows(b, f.po, "po", final, asOf).map((r, i) =>
          i || b.eventPaymentSchedule ? r : { ...r, due: "" },
        )
      : [],
  };
  return {
    // PostgreSQL JSONB and browser transport may reorder object keys. Normalize the
    // public fields before serializing a review; key order is not a changed term.
    explanation: b.parentExplanation
      ? {
          initialDeposit: b.parentExplanation.initialDeposit,
          monthlyDues: b.parentExplanation.monthlyDues,
          teamExpenses: b.parentExplanation.teamExpenses,
          additionalNotes: b.parentExplanation.additionalNotes,
        }
      : undefined,
    schedules,
    full: f.full,
    po: poEnabled ? f.po : 0,
    secondDue: b.secondDue,
    finalDue: final,
    policy:
      (b.parentExplanation ? feeExplanationText(b.parentExplanation) + "\n\n" : "") +
      b.policy +
      "\n\n" +
      (b.automaticPayments
        ? collectionActivationDisclosure +
          "\n\nSeparate automatic-payment authorization terms: " +
          collectionConsent
        : teamPaymentDisclosure) +
      (b.programModel === 3
        ? `\n\nRequired Team & Development Program Fee: ${money(b.membershipMonthly)}/month per full player${poEnabled ? `; ${money(b.poMembershipMonthly ?? 15000)}/month per PO player` : ""} × ${b.months} Actual Billable Months.${b.programCostModel === 1 ? ` Approved billing term: ${b.months} months; season dates ${b.start} through ${b.end}. The program allocation is included in direct costs before contingency.` : ""} Scheduled team facility use and platform programming are included. ${separateMembershipPolicy}`
        : "") +
      "\n\nFull player schedule: " +
      schedules.full
        .map(
          (r, i) =>
            `${r.label}: ${money(r.amount)} ${i === 1 && !b.eventPaymentSchedule && !b.paymentSchedule && !b.secondDue ? "at the acceptance midpoint" : r.due ? "by " + r.due : "at acceptance"}`,
        )
        .join("; ") +
      (poEnabled
        ? "\nPitcher-only schedule: " +
          schedules.po
            .map((r) => `${r.label}: ${money(r.amount)} ${r.due ? "by " + r.due : "at acceptance"}`)
            .join("; ")
        : "") +
      (!b.eventPaymentSchedule && !b.paymentSchedule && !b.secondDue
        ? "\nSecond payment is due midway between acceptance and the final deadline; the exact date is confirmed when you accept."
        : "") +
      ". Grace period: " +
      b.graceDays +
      " calendar days overdue. One-time late fee after grace: " +
      (b.lateFeeBps === 2000
        ? "20% of the unpaid overdue installment after confirmed primary and backup card failures; no compounding"
        : "$" + (b.lateFee / 100).toFixed(2)) +
      ", subject to admin review. Roster hold review after " +
      b.holdDays +
      " calendar days overdue; removal review after " +
      b.removalDays +
      " calendar days overdue.\n\nReinstatement: " +
      b.reinstatement,
  };
}
