import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getTeamFundingStatus } from "@/lib/teams/fee-api";
export function TeamFundingNotice({ teamId }: { teamId: string }) {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeamFundingStatus>>>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    if (!user || user.isDevFallback) return;
    const load = () =>
      getTeamFundingStatus({ data: { teamId } })
        .then((d) => {
          if (active) setData(d);
        })
        .catch(() => {
          if (active) setData(null);
        });
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("team-budget-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("team-budget-updated", refresh);
    };
  }, [teamId, user?.id]);
  if (!data) return null;
  return (
    <section
      aria-label="Team funding status"
      className={`my-4 rounded-xl border p-4 ${data.hasOverduePayments ? "border-maroon bg-white" : "border-line bg-paper"}`}
    >
      <h3 className="text-xl">
        {data.hasOverduePayments ? "Team funding at risk" : "Team payment status"}
      </h3>
      {data.hasOverduePayments ? (
        <>
          <p className="mt-2 font-semibold">
            {data.overduePlayers === null
              ? "One or more team payments are overdue."
              : `${data.overduePlayers} ${data.overduePlayers === 1 ? "player has" : "players have"} overdue team payments.`}
          </p>
          <p className="mt-2 text-sm">
            Unpaid fees put planned team activities at risk. Prospects does not advance funds to
            cover unpaid player balances. Activities depend on the team collecting its required
            fees.
          </p>
          <p className="mt-2 text-sm">
            Please review your own payment schedule and contact Front Office about any outstanding
            payment. Other families do not receive names, individual statuses or an overdue-player
            count.
          </p>
          {data.overdueRoster !== null && (
            <div className="mt-4">
              <h4 className="font-semibold">Private staff payment follow-up</h4>
              <p className="mt-1 text-sm">
                Assigned coaches and financial administrators only. Confirm collection questions
                with Front Office; do not share this list with other families.
              </p>
              <ul className="mt-2 space-y-2">
                {data.overdueRoster.map((player) => (
                  <li key={player.playerId} className="rounded-lg border border-line p-3 text-sm">
                    <strong>{player.playerName}</strong> — Payment overdue
                    <div>
                      Listed parent/guardian:{" "}
                      {player.guardianNames.join(", ") || "Contact Front Office"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm">
          {data.tracking
            ? "All currently due team payments are up to date."
            : "Payment tracking begins when families accept their player fee agreements."}
        </p>
      )}
    </section>
  );
}
