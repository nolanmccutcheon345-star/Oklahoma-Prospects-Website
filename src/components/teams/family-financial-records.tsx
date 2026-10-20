import type { TeamFinancialView } from "@/lib/teams/financial-view";
import { TeamFeeWorkspace } from "./fee-workspace";
import { Section, money } from "./ui";

/** Historical billing remains reachable without a current operational player. */
export function FamilyFinancialRecords({
  financial,
  familyId,
}: {
  financial: TeamFinancialView;
  familyId: string;
}) {
  const obligations = financial.owner
    ? financial.obligations.filter((p) => p.familyId === familyId)
    : financial.obligations;
  if (!obligations.length)
    return (
      <p className="rounded-xl bg-paper-2 p-4 text-sm">
        No team financial agreement is linked to this account.
      </p>
    );
  return (
    <section className="grid gap-3" aria-label="Family financial agreements">
      <TeamFeeWorkspace />
      <p className="text-sm">
        Family combined balance {money(obligations.reduce((sum, p) => sum + p.due, 0))}
      </p>
      {obligations.map((p) => (
        <Section key={p.agreementId} title={`${p.playerName} · ${p.teamName}`} defaultOpen>
          <p className="font-display text-3xl">{money(p.due)}</p>
          <p className="text-sm">Season total {money(p.signed)}</p>
          {p.feeLock?.components && !p.feeLock.components.season && (
            <ul className="mt-2 text-sm">
              <li>Team and event costs {money(p.feeLock.components.teamAndEvents ?? 0)}</li>
              <li>Coaching and instruction {money(p.feeLock.components.coaching ?? 0)}</li>
              <li>Program and membership {money(p.feeLock.components.program ?? 0)}</li>
              <li>Uniform {money(p.feeLock.components.uniform ?? 0)}</li>
            </ul>
          )}
          <p className="mt-2">
            Team invoices appear here when issued. Only verified payments appear in this history.
          </p>
          <a className="inline-flex min-h-11 items-center underline" href="/contact">
            Request a team invoice
          </a>
          <ul className="mt-2 text-sm">
            {p.payments.map((pay) => (
              <li key={pay.receipt}>
                {pay.date} · {pay.label} · {money(pay.amount)} · receipt {pay.receipt}
              </li>
            ))}
          </ul>
          <h3 className="mt-3 font-semibold">Plan</h3>
          {p.planLock ? (
            <ul className="text-sm">
              {p.planLock.rows.map((r, i) => (
                <li key={i}>
                  {r.date} · {money(r.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Plan locks when you sign.</p>
          )}
          <p className="mt-2 text-sm">
            Credits earned: {money(p.credits.reduce((sum, c) => sum + c.amount, 0))}
          </p>
        </Section>
      ))}
    </section>
  );
}
