import { Button } from "@/components/ui/button";

// Owner-approved public information only. This does not publish a fee plan,
// create an obligation, accept a player, or start a recurring payment.
export const BOBBY_7U_TEAM_ID = "t-prospects-7u-navy-bsb-x9k5";

export function BobbyMembership({ teamId }: { teamId: string }) {
  if (teamId !== BOBBY_7U_TEAM_ID) return null;
  return (
    <section
      className="my-6 overflow-hidden rounded-2xl border border-line bg-paper"
      aria-labelledby="bobby-membership-title"
    >
      <div className="bg-navy p-5 text-fg-inverse sm:p-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
          Prospects Sports · Coach Bobby
        </p>
        <h2 id="bobby-membership-title" className="mt-2 text-3xl">
          7U Baseball Membership
        </h2>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <h3 className="text-2xl">$350 initial deposit</h3>
          <p className="mt-2">Due when you enroll. Prospects provides each player with:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>One team hat</li>
            <li>Two jerseys</li>
            <li>Two pairs of pants</li>
            <li>One team cage jacket</li>
          </ul>
        </div>
        <div>
          <h3 className="text-2xl">$99 monthly membership</h3>
          <p className="mt-2">Due on the 1st, January–June 2027 (six monthly payments).</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Guaranteed indoor team practice: one cage for 1½ hours each week</li>
            <li>Four practices totaling six hours in a four-week month</li>
            <li>Individual indoor training time</li>
            <li>Full access to all our website tools</li>
          </ul>
        </div>
        <div className="border-t border-line pt-5 sm:col-span-2">
          <p>
            All other season expenses, including tournaments, league fees and travel, are budgeted,
            collected and managed by the team, not Prospects. Parents register and pay the BAYB
            league fee directly.
          </p>
          <Button asChild className="mt-5 w-full sm:w-auto">
            <a href="/tryouts?sport=Baseball&age=7U#register">Request a 7U tryout</a>
          </Button>
          <p className="mt-3 text-sm text-muted">
            This opens our baseball tryout request form with 7U selected. Submitting a request does
            not reserve a roster place or collect a payment. Membership enrollment and payment
            details are confirmed separately after coach review.
          </p>
        </div>
      </div>
    </section>
  );
}
