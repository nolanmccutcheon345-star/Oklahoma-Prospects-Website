import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, Fold, NumRows, downloadText } from "@/components/teams/desk-kit";
import { positionsOf, useTeams } from "@/lib/teams/context";
import { useTeamsCopy } from "@/lib/teams/copy";
import { formatTeamMoney } from "@/lib/teams/os";
import {
  canAutoDraft,
  chargeOf,
  hasBackupCard,
  hasPrimaryCard,
  receiptText,
  recruitingOnePager,
  recruitingShareUrl,
  type OsPayMethod,
  type OsReenroll,
} from "@/lib/teams/money";
import { normalizeRsvp } from "@/lib/teams/schedule";
import type { OsPlayer, OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

function reenrollOf(player: OsPlayer | null): OsReenroll | null {
  const row = player?.reenroll;
  if (!row || typeof row !== "object") return null;
  return row as OsReenroll;
}

export function FamilyHome({
  team,
  player,
  onDesk,
}: {
  team: OsTeam;
  player: OsPlayer;
  onDesk?: (id: string) => void;
}) {
  const os = useTeams();
  const { t } = useTeamsCopy();
  const kids = os.myPlayers;
  const combined = kids.reduce((sum, p) => {
    const tm = os.teamById(p.teamId) ?? team;
    return sum + os.balanceFor(tm, p);
  }, 0);
  const miss = kids.reduce((n, p) => n + os.docsMissing(p).length, 0);
  const sizesOut = kids.filter((p) => !p.order?.submitted).length;
  const eventId = team.tournamentIds?.[0];
  const rsvpOpen = kids.some((p) => {
    const tm = os.teamById(p.teamId) ?? team;
    const board = tm.rsvps?.[eventId] || {};
    return normalizeRsvp(board[p.id]) !== "going";
  });
  const offer = kids.map(reenrollOf).find((r) => r?.status === "offer") || null;
  const live = os.gamesFor(team.id).find((g) => g.status === "live");
  const next = (team.practices || [])[0];

  const tiles = [
    {
      id: "balance",
      label: t("family.balance"),
      value: formatTeamMoney(combined),
      alert: combined > 0,
      desk: "fees",
    },
    {
      id: "availability",
      label: t("family.availability"),
      value: rsvpOpen ? t("family.rsvpNeed", "Need RSVP") : t("family.rsvpGoing", "Going"),
      alert: rsvpOpen,
      desk: "schedule",
    },
    {
      id: "documents",
      label: t("family.documents"),
      value: miss ? `${miss} ${t("family.docsMissing", "missing")}` : t("family.docsIn", "On file"),
      alert: miss > 0,
      desk: "documents",
    },
    {
      id: "sizes",
      label: t("family.sizes"),
      value: sizesOut ? `${sizesOut} ${t("family.sizesOut", "out")}` : t("family.sizesIn", "In"),
      alert: sizesOut > 0,
      desk: "my-player",
    },
    {
      id: "reenroll",
      label: t("family.reenroll"),
      value: offer ? `Save ${formatTeamMoney(offer.earlyBird)}` : t("family.reenrollClosed", "Closed"),
      alert: Boolean(offer),
      desk: "my-player",
    },
  ];

  return (
    <div data-teams-family-home="true" className="teams-stack">
      <DeskCard
        eyebrow={t("family.thisWeek")}
        title={next ? `Next up: ${next.time} ${next.place || "cages"}.` : t("family.noSession")}
        copy={`${kids.length} player${kids.length === 1 ? "" : "s"} on this login. Combined balance is one number.`}
      >
        <div className="grid grid-cols-2 gap-2" data-teams-quick="true">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              data-teams-quick={tile.id}
              data-teams-quick-alert={tile.alert ? "true" : "false"}
              onClick={() => onDesk?.(tile.desk)}
              className={cn(
                "min-h-11 rounded-xl px-3 py-4 text-left",
                tile.alert ? "bg-ok-maroon text-fg-inverse" : "bg-paper text-teams-ink shadow-border",
              )}
            >
              <span className="block text-xs font-semibold tracking-wide uppercase opacity-80">
                {tile.label}
              </span>
              <span className="mt-1 block font-display text-2xl">{tile.value}</span>
            </button>
          ))}
        </div>
      </DeskCard>
      {live ? (
        <Fold title="Live score" open>
          <p className="font-display text-3xl">
            {live.ourRuns}–{live.oppRuns}
          </p>
          <p className="mt-1 text-sm text-teams-muted">
            {live.opponent} · {live.inning} · {live.field}
          </p>
        </Fold>
      ) : null}
      <Fold title="Siblings on this login">
        <NumRows
          rows={kids.map((p) => {
            const tm = os.teamById(p.teamId) ?? team;
            return {
              label: `${p.name} · ${tm.name.replace("Prospects ", "")}`,
              value: formatTeamMoney(os.balanceFor(tm, p)),
              alert: os.balanceFor(tm, p) > 0,
            };
          })}
        />
      </Fold>
    </div>
  );
}

export function FamilyFees({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const { t } = useTeamsCopy();
  const kids = os.myPlayers;
  const [who, setWho] = useState(player.id);
  const kid = kids.find((p) => p.id === who) ?? player;
  const tm = os.teamById(kid.teamId) ?? team;
  const due = os.balanceFor(tm, kid);
  const plan = os.planFor(tm, kid);
  const breakdown = os.breakdownFor(tm, kid);
  const amend = os.amendmentFor(kid);
  const agreed = Number(kid.feeLock?.amount) || os.feeFor(tm, kid);
  const delta = typeof amend?.delta === "number" ? amend.delta : os.driftFor(tm, kid);
  const [amount, setAmount] = useState(String(due || ""));
  const [method, setMethod] = useState<OsPayMethod>("ach");
  const [note, setNote] = useState("");
  const charge = chargeOf(os.state, Number(amount) || 0, method);
  const backup = canAutoDraft(kid);

  useEffect(() => {
    setAmount(String(due || ""));
  }, [due, who]);

  function pay(kind: "full" | "part") {
    const n = kind === "full" ? due : Number(amount) || 0;
    const result = os.payBalance({
      teamId: tm.id,
      playerId: kid.id,
      amount: n,
      method,
      label: kind === "full" ? "Paid in full" : "Partial payment",
    });
    setNote(
      result.ok
        ? `Receipt ${result.receipt}. ${method === "ach" ? "Bank draft is free." : `Card fee ${formatTeamMoney(charge.fee)} charged for real.`}`
        : "Could not take that payment.",
    );
  }

  function draft() {
    const result = os.enrollDraft(tm.id, kid.id);
    setNote(
      result.ok
        ? "Monthly auto-draft is on. Primary and backup are on file."
        : "Monthly auto-draft needs a primary card and a backup.",
    );
  }

  return (
    <div data-teams-family-fees="true" className="teams-stack">
      {kids.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
          {kids.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setWho(p.id);
                const t = os.teamById(p.teamId) ?? team;
                setAmount(String(os.balanceFor(t, p) || ""));
              }}
              className={cn(
                "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
                who === p.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
              aria-pressed={who === p.id}
            >
              {p.name.split(" ")[0]}
            </button>
          ))}
        </div>
      ) : null}
      <DeskCard
        eyebrow={t("family.fees")}
        title={due ? `Balance ${formatTeamMoney(due)}.` : t("family.payTitleClear")}
        copy={t("family.payCopy")}
      >
        <div className="grid gap-3">
          <div className="flex gap-1 rounded-xl bg-ink p-1">
            {(["ach", "card"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-teams-pay-method={m}
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  "teams-control flex-1 rounded-lg px-3 text-xs font-semibold uppercase",
                  method === m ? "bg-maroon text-fg-inverse" : "text-fg-soft",
                )}
              >
                {m === "ach" ? "Bank draft · free" : "Card"}
              </button>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Amount</span>
            <input
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              data-teams-pay-amount="true"
            />
          </label>
          <NumRows
            rows={[
              { label: "Amount", value: formatTeamMoney(charge.amount) },
              { label: "Fee", value: formatTeamMoney(charge.fee), alert: charge.fee > 0 },
              { label: "Total charged", value: formatTeamMoney(charge.totalCharged) },
            ]}
          />
          <div className="grid gap-2">
            <Button type="button" data-teams-pay-full="true" onClick={() => pay("full")} disabled={due <= 0}>
              Pay in full
            </Button>
            <Button type="button" variant="outlineDark" data-teams-pay-part="true" onClick={() => pay("part")} disabled={due <= 0}>
              Pay this amount
            </Button>
            <Button type="button" variant="ghost" data-teams-pay-draft="true" onClick={draft}>
              Monthly auto-draft
            </Button>
          </div>
          {!backup ? (
            <p className="text-sm text-ok-maroon">
              Auto-draft needs a primary card and a backup. {hasPrimaryCard(kid) ? "Backup is missing." : "No card on file."}
            </p>
          ) : kid.draftEnrolled ? (
            <p className="text-sm text-teams-muted">Monthly auto-draft is on.</p>
          ) : null}
          {note ? <p className="text-sm text-teams-ink">{note}</p> : null}
        </div>
      </DeskCard>
      {amend ? (
        <DeskCard
          eyebrow="Amendment"
          title="What you agreed to did not move."
          copy="Club costs changed. Your signed fee stays until you accept."
        >
          <NumRows
            rows={[
              { label: "Agreed", value: formatTeamMoney(agreed) },
              {
                label: "What changed",
                value: `${delta > 0 ? "+" : ""}${formatTeamMoney(delta)}`,
                alert: true,
              },
              { label: "New total", value: formatTeamMoney(agreed + delta) },
              { label: "Status", value: amend.status, alert: true },
            ]}
          />
          <div className="mt-4 grid gap-2">
            <Button type="button" data-teams-amend-accept="true" onClick={() => os.acceptAmendment(tm.id, kid.id)}>
              Accept new total
            </Button>
            <Button type="button" variant="outlineDark" onClick={() => os.questionAmendment(tm.id, kid.id)}>
              Ask a question
            </Button>
          </div>
        </DeskCard>
      ) : null}
      <Fold title="Plan" open>
        <NumRows
          rows={(plan?.rows || []).map((row) => ({
            label: `${row.label} · ${row.due}`,
            value: `${formatTeamMoney(row.amount)} · ${row.status}`,
            alert: row.status === "due" || row.status === "urgent",
          }))}
        />
      </Fold>
      <Fold title="What's in the fee">
        <p className="mb-3 text-sm text-teams-muted">
          Four lines. Membership is included — we list what it covers, never a price.
        </p>
        {breakdown ? (
          <NumRows
            rows={breakdown.lines.map((line) => ({
              label: line.label,
              value: formatTeamMoney(line.amount),
            }))}
          />
        ) : null}
        <ul className="mt-4 grid gap-1 text-sm text-teams-ink">
          {os.viewer.membershipIncludes.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </Fold>
      <Fold title="Credits and receipts">
        <NumRows
          rows={(kid.credits || []).map((c) => ({
            label: c.note || c.type || "Credit",
            value: formatTeamMoney(c.amount),
          }))}
        />
        <ul className="mt-3 divide-y divide-line">
          {(kid.payments || []).map((p, i) => (
            <li key={p.receipt || i} className="teams-row flex items-center justify-between gap-3">
              <span className="text-sm">
                {p.label || "Payment"} · {p.date} · {p.method === "ach" ? "Bank" : "Card"}
              </span>
              <button
                type="button"
                className="text-xs font-semibold tracking-wide text-maroon uppercase"
                onClick={() => downloadText(`${p.receipt || "receipt"}.txt`, receiptText(kid, tm, p))}
              >
                Receipt {formatTeamMoney(p.totalCharged ?? p.amount)}
              </button>
            </li>
          ))}
        </ul>
        <NumRows
          rows={(kid.cards || []).map((c) => ({
            label: `${c.brand} ···· ${c.last4}`,
            value: c.primary ? "Primary" : "Backup",
            alert: !c.primary && !hasBackupCard(kid) ? true : false,
          }))}
        />
      </Fold>
    </div>
  );
}

export function FamilyDocuments({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  return (
    <DeskCard
      eyebrow="Documents"
      title="Paper that keeps him on the field."
      copy="Waiver, birth certificate, insurance, physical. Upload here. Red means he sits."
    >
      <ul className="divide-y divide-line">
        {Object.keys(os.docLabels).map((k) => (
          <li key={k} className="teams-row flex items-center justify-between gap-3">
            <span className={player.docs?.[k] ? "text-sm" : "text-sm text-ok-maroon"}>
              {os.docLabels[k]}
            </span>
            {player.docs?.[k] ? (
              <span className="text-xs font-semibold tracking-wide uppercase">On file</span>
            ) : (
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                data-teams-doc-upload={k}
                onClick={() => os.uploadDoc(team.id, player.id, k)}
              >
                Upload
              </Button>
            )}
          </li>
        ))}
      </ul>
    </DeskCard>
  );
}

export function FamilyPlayer({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const offer = reenrollOf(player);
  const [bio, setBio] = useState(player.publicProfile?.bio || "");
  const share = recruitingShareUrl(player);
  return (
    <div className="teams-stack">
      <DeskCard
        eyebrow="My player"
        title={`${player.name} · #${player.number}`}
        copy={`${positionsOf(player)}. Playing time notes stay with the coach.`}
      >
        <NumRows
          rows={[
            { label: "Bats / throws", value: `${player.bats} / ${player.throws}` },
            { label: "School", value: player.school },
            { label: "Siblings on club", value: String(os.myPlayers.length) },
          ]}
        />
      </DeskCard>
      {offer?.status === "offer" ? (
        <DeskCard
          eyebrow="Re-enrollment"
          title={`${offer.seasonLabel}. Early-bird ${formatTeamMoney(offer.earlyBird)}.`}
          copy={`Save ${formatTeamMoney(offer.earlyBird)} if you re-enroll by ${offer.deadline}.`}
        >
          <div className="grid gap-2">
            <Button type="button" data-teams-reenroll="accept" onClick={() => os.reenroll(team.id, player.id, "accepted")}>
              Re-enroll and save
            </Button>
            <Button type="button" variant="ghost" onClick={() => os.reenroll(team.id, player.id, "declined")}>
              Not this season
            </Button>
          </div>
        </DeskCard>
      ) : null}
      <Fold title="Contact preferences" open>
        <div className="grid gap-2">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={player.prefs?.email}
              onChange={(e) => os.setPrefs(team.id, player.id, { email: e.target.checked, sms: player.prefs?.sms })}
            />
            Email
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={player.prefs?.sms}
              onChange={(e) => os.setPrefs(team.id, player.id, { email: player.prefs?.email, sms: e.target.checked })}
            />
            Text
          </label>
        </div>
      </Fold>
      <Fold title="Recruiting profile">
        <p className="text-sm text-teams-muted">Share link and a one-pager. Family contact never goes on it.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(player.publicProfile?.enabled)}
            onChange={(e) => os.setProfile(team.id, player.id, { enabled: e.target.checked, bio })}
          />
          Public
        </label>
        <textarea
          className="mt-3 min-h-24 w-full rounded-lg bg-paper px-3 py-2 text-sm shadow-border"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={() => os.setProfile(team.id, player.id, { enabled: Boolean(player.publicProfile?.enabled), bio })}
        />
        <p className="mt-2 text-sm">{share}</p>
        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            variant="outlineDark"
            onClick={() => navigator.clipboard?.writeText(share)}
          >
            Copy share link
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-teams-one-pager="true"
            onClick={() => downloadText(`${player.name}-one-pager.txt`, recruitingOnePager(player, team))}
          >
            Download one-pager
          </Button>
        </div>
      </Fold>
      <Fold title="Uniform sizes">
        <p className="text-sm text-teams-muted">
          {player.order?.submitted ? "Sizes are in." : "Sizes are still out. Jersey number is conflict-checked on this roster."}
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-maroon"
          onClick={() => os.openPlayer(team.id, player.id, "uniform")}
        >
          {player.order?.submitted ? "Review sizes" : "Pick jersey number and sizes"}
        </button>
      </Fold>
    </div>
  );
}
