import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, NumRows } from "@/components/teams/desk-kit";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import { takenNumbers } from "@/lib/teams/roster";
import type { OsInvite, OsPlayer, OsTeam } from "@/lib/teams/model";

export function SignFlow({
  team,
  player,
  invite,
  onDone,
  onCancel,
}: {
  team: OsTeam;
  player?: OsPlayer | null;
  invite?: OsInvite | null;
  onDone: (playerId: string) => void;
  onCancel: () => void;
}) {
  const os = useTeams();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [legalName, setLegalName] = useState("");
  const [ack, setAck] = useState(false);
  const [number, setNumber] = useState(
    player?.number && Number(player.number) > 0 ? String(player.number) : "",
  );
  const [planType, setPlanType] = useState<"monthly" | "full">(
    player?.planType === "full" ? "full" : "monthly",
  );
  const [error, setError] = useState("");
  const policy = os.state.settings.policy;
  const charge = os.chargeFor(team);
  const taken = takenNumbers(team, player?.id);
  const who = player?.name || invite?.name || "Player";

  const nameOk = legalName.trim().split(/\s+/).length >= 2;
  const num = Number(number);
  const numberOk = Number.isInteger(num) && num >= 1 && num <= 99;
  const conflict = numberOk && taken.has(String(num));

  const surchargeCopy = useMemo(() => {
    if (!os.state.settings.cardSurchargeEnabled || charge.fee === 0) {
      return "No card surcharge on this deposit.";
    }
    return `Card surcharge ${os.state.settings.cardFeePct}% is ${formatTeamMoney(charge.fee)}. Shown before you confirm.`;
  }, [os.state.settings, charge.fee]);

  function nextFromOne() {
    if (!nameOk) {
      setError("Type the legal first and last name.");
      return;
    }
    if (!ack) {
      setError("Check the box. The deposit is non-refundable.");
      return;
    }
    setError("");
    setStep(2);
  }

  function nextFromTwo() {
    if (!numberOk) {
      setError("Jersey number has to be 1–99.");
      return;
    }
    if (conflict) {
      setError(`#${num} is already on this roster.`);
      return;
    }
    setError("");
    setStep(3);
  }

  function confirmPay() {
    try {
      const playerId = os.signSpot({
        teamId: team.id,
        playerId: player?.id,
        inviteId: invite?.id,
        legalName: legalName.trim(),
        number: num,
        planType,
      });
      onDone(playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish signing.");
    }
  }

  return (
    <div data-teams-sign-step={step}>
      <DeskCard
        eyebrow={`Signing · step ${step} of 3`}
        title={who}
        copy="Read, pick a number, then pay the deposit. The fee freezes here."
      >
        {step === 1 ? (
          <div className="grid gap-4">
            <p className="whitespace-pre-line rounded-xl bg-cream/80 px-4 py-3 text-sm text-teams-ink">
              {policy?.text || "The roster deposit is non-refundable. The full fee is owed once the schedule commits."}
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                Legal name
              </span>
              <input
                data-teams-sign-name
                className="teams-control min-h-11 rounded-lg bg-paper px-3 shadow-border"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                autoComplete="name"
                placeholder="First and last name"
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                data-teams-sign-ack
                type="checkbox"
                className="mt-1 size-5 accent-maroon"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                I understand the roster deposit is non-refundable and the full season fee is owed once the schedule is committed.
              </span>
            </label>
            {error ? <p className="text-sm text-ok-maroon">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="maroon" className="min-h-12" onClick={nextFromOne}>
                Continue
              </Button>
              <Button type="button" variant="outlineDark" className="min-h-12" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                Jersey number
              </span>
              <input
                data-teams-sign-number
                inputMode="numeric"
                className="teams-control min-h-11 rounded-lg bg-paper px-3 shadow-border"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="1–99"
              />
              {conflict ? (
                <span className="text-ok-maroon">#{num} is taken on this roster.</span>
              ) : null}
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                Payment plan
              </legend>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="plan"
                  checked={planType === "monthly"}
                  onChange={() => setPlanType("monthly")}
                />
                Monthly installments through the payoff date
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="plan"
                  checked={planType === "full"}
                  onChange={() => setPlanType("full")}
                />
                Paid in full before the first event
              </label>
            </fieldset>
            {error ? <p className="text-sm text-ok-maroon">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="maroon" className="min-h-12" onClick={nextFromTwo}>
                Continue to deposit
              </Button>
              <Button type="button" variant="outlineDark" className="min-h-12" onClick={() => setStep(1)}>
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <p className="text-sm text-teams-muted">{surchargeCopy}</p>
            <NumRows
              rows={[
                { label: "Deposit", value: formatTeamMoney(charge.amount) },
                { label: "Card fee", value: formatTeamMoney(charge.fee) },
                {
                  label: "Total charged",
                  value: formatTeamMoney(charge.totalCharged),
                },
              ]}
            />
            <p
              className="sr-only"
              data-teams-charge-amount={charge.amount}
              data-teams-charge-fee={charge.fee}
              data-teams-charge-total={charge.totalCharged}
            >
              {charge.amount} {charge.fee} {charge.totalCharged}
            </p>
            {error ? <p className="text-sm text-ok-maroon">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="maroon" className="min-h-12" data-teams-sign-pay onClick={confirmPay}>
                Pay {formatTeamMoney(charge.totalCharged)}
              </Button>
              <Button type="button" variant="outlineDark" className="min-h-12" onClick={() => setStep(2)}>
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </DeskCard>
    </div>
  );
}
