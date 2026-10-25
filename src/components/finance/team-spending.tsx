import { useState } from "react";
import type { getFinance } from "@/lib/finance/api";
import { spendingCategories } from "@/lib/finance/team-spending";
import { money } from "@/lib/teams/fee-model";
import { Button } from "../ui/button";
type View = Awaited<ReturnType<typeof getFinance>>["teamSpending"][number];
export function TeamSpending({
  teams,
  busy,
  save,
}: {
  teams: View[];
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const team = teams.find((t) => t.teamId === selected) || teams[0];
  return (
    <section className="grid gap-4 rounded-xl border p-4" aria-label="Team spending controls">
      <h3 className="text-2xl">Team spending</h3>
      <p>
        Only the team's own settled, reconciled funding may support its expenses. This is an owner
        certification supported by bank evidence, not an automatic bank connection. New approvals
        reserve cash; no payment is sent here.
      </p>
      <label className="grid gap-1">
        Team
        <select
          className="office-control"
          value={team?.teamId || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {team ? (
        <TeamReview
          key={
            team.teamId + ":" + (team.review?.asOf || "") + ":" + (team.review?.evidenceKey || "")
          }
          team={team}
          busy={busy}
          save={save}
        />
      ) : (
        <p>No financial team records.</p>
      )}
    </section>
  );
}
function TeamReview({
  team,
  busy,
  save,
}: {
  team: View;
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [cash, setCash] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      spendingCategories.map((c) => [c, String((team.review?.limits[c] || 0) / 100)]),
    ),
  );
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const dollars = (value: string) => Math.round(Number(value) * 100);
  return (
    <div className="grid gap-4">
      <p>
        {team.committed} of {team.roster} roster players have recorded accepted agreements and
        deposit coverage. Minimum roster: 9. Owners must verify the underlying receipts.{" "}
        {team.current
          ? `Current reviewed approval cash: ${money(team.remaining)}.`
          : "A current funding review is required before expense approval."}
      </p>
      <p>
        Published external-cost and contingency ceiling: {money(team.ceiling)}. Set exact category
        allocations from the approved preseason budget. Saving locks these category ceilings; this
        screen cannot increase them. Program allocations stay separate from external spending.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {spendingCategories.map((c) => (
          <label key={c} className="grid gap-1 capitalize">
            {c} ceiling ($)
            <input
              className="office-control"
              type="number"
              min="0"
              step="0.01"
              value={limits[c]}
              onChange={(e) => setLimits({ ...limits, [c]: e.target.value })}
            />
            <span className="text-xs normal-case">
              Recorded commitments: {money(team.usage[c])}
            </span>
          </label>
        ))}
      </div>
      <label className="grid gap-1">
        Available settled team cash after existing commitments and protections ($)
        <input
          className="office-control"
          type="number"
          min="0"
          step="0.01"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </label>
      <label className="grid gap-1">
        Bank/settlement references and allocation evidence
        <textarea
          className="office-control"
          maxLength={1500}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Masked statement references; this team's fee receipts; deductions for existing commitments, taxes, restricted and unformed-team funds. No account numbers."
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I verified the final roster has at least nine players, every roster player accepted and paid
        their deposit, and this amount is this team's settled funding after all existing commitments
        and required protections. No other team's funds, pledges or unsettled payments are included.
      </label>
      <Button
        disabled={
          busy ||
          !confirmed ||
          cash === "" ||
          evidence.trim().length < 20 ||
          !team.formationReady ||
          !team.published ||
          team.closed
        }
        onClick={async () => {
          await save(
            {
              action: "teamFundingReview",
              value: {
                teamId: team.teamId,
                availableCents: dollars(cash),
                limits: Object.fromEntries(spendingCategories.map((c) => [c, dollars(limits[c])])),
                evidence,
                formationVerified: true,
                protectedFundsVerified: true,
              },
            },
            "Owner certified team-only settled funding and preseason spending limits",
          );
          setConfirmed(false);
        }}
      >
        Save today's funding review
      </Button>
      <p className="text-sm">
        Review again whenever bank evidence, roster, payments or accepted terms change, and before
        external payment. Reconcile monthly; retain original records and post corrections
        separately. Payment authorization and required formation evidence are independent of
        enrollment or medical clearance.
      </p>
    </div>
  );
}
