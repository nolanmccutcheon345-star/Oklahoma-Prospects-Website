import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { recordTeamPayment } from "@/lib/teams/store";
import type { ClubRecord, Player } from "@/lib/teams/types";
import { balance, docsComplete } from "@/lib/teams/pricing";
import { Section } from "./ui";
import { money } from "./ui";

const copy = {
  en: {
    actions: "Needs doing",
    pay: "Payments",
    plan: "Plan",
    docs: "Documents",
    uniform: "Uniform",
    avail: "Availability",
    member: "Membership includes",
    fund: "Fundraising",
    sib: "Siblings",
    cage: "Cage credits",
  },
  es: {
    actions: "Pendiente",
    pay: "Pagos",
    plan: "Plan",
    docs: "Documentos",
    uniform: "Uniforme",
    avail: "Disponibilidad",
    member: "La membresía incluye",
    fund: "Recaudación",
    sib: "Hermanos",
    cage: "Créditos de jaula",
  },
};

export function FamilyApp({
  club,
  familyId,
  isPlayer,
  lang,
  onChange,
  onReload,
}: {
  club: ClubRecord;
  familyId: string;
  isPlayer: boolean;
  lang: "en" | "es";
  onChange: (club: ClubRecord) => void;
  onReload: () => void;
}) {
  const t = copy[lang];
  const mine = club.teams.flatMap((team) =>
    team.roster.filter((p) => p.familyId === familyId).map((p) => ({ team, player: p })),
  );
  const [active, setActive] = useState(mine[0]?.player.id ?? "");
  const row = mine.find((m) => m.player.id === active) ?? mine[0];
  if (!row) {
    return (
      <div className="rounded-2xl bg-paper-2 p-5 shadow-border">
        <h2 className="text-2xl">No player is linked to this login.</h2>
        <p className="mt-2 text-sm text-muted">
          The office adds your athlete with the same email you signed in with.
          You can still book cages, sign the waiver, and start training.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/book">Reserve a cage</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/contact">Text the office</Link>
          </Button>
        </div>
      </div>
    );
  }
  const { team, player } = row;
  const signed = player.feeLock?.amount ?? 0;
  const due = balance(player, signed);
  const combined = mine.reduce((sum, m) => sum + balance(m.player, m.player.feeLock?.amount ?? 0), 0);
  const red = {
    balance: due > 0,
    docs: !docsComplete(player),
    sizes: !player.order.submitted,
    avail: team.tournamentIds.some((id) => !player.rsvp[id]),
  };

  function patchPlayer(next: Player) {
    onChange({
      ...club,
      teams: club.teams.map((tm) => ({
        ...tm,
        roster: tm.roster.map((p) => (p.id === next.id ? next : p)),
      })),
    });
  }

  return (
    <div className="grid gap-3">
      {mine.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {mine.map((m) => (
            <button
              key={m.player.id}
              type="button"
              className="min-h-11 rounded-full bg-paper-2 px-3 text-sm font-semibold"
              onClick={() => setActive(m.player.id)}
            >
              {m.player.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["balance", t.pay, red.balance],
            ["docs", t.docs, red.docs],
            ["sizes", t.uniform, red.sizes],
            ["avail", t.avail, red.avail],
          ] as const
        ).map(([key, label, on]) => (
          <div
            key={key}
            className={on ? "rounded-xl bg-maroon p-4 text-fg-inverse" : "rounded-xl bg-paper-2 p-4"}
          >
            <p className="text-xs uppercase tracking-wide">{label}</p>
            <p className="font-display text-2xl">{on ? "Needs you" : "Set"}</p>
          </div>
        ))}
      </div>

      {!isPlayer ? (
        <Section title={t.pay} defaultOpen>
          <p className="font-display text-4xl">{money(due)}</p>
          <p className="text-sm text-muted">
            Season total {money(signed)} · family combined {money(combined)}
          </p>
          {player.feeLock?.components ? (
            <ul className="mt-2 text-sm">
              <li>Team and event costs {money(player.feeLock.components.teamAndEvents ?? 0)}</li>
              <li>Coaching and instruction {money(player.feeLock.components.coaching ?? 0)}</li>
              <li>Program and membership {money(player.feeLock.components.program ?? 0)}</li>
              <li>Uniform {money(player.feeLock.components.uniform ?? 0)}</li>
            </ul>
          ) : null}
          <p className="mt-2">Contact the front office for your team invoice. Only verified payments appear in this history.</p>
          <a className="inline-flex min-h-11 items-center underline" href="/contact">Request a team invoice</a>
          <ul className="mt-3 text-sm">
            {player.payments.map((pay) => (
              <li key={pay.receipt}>
                {pay.date} · {pay.label} · {money(pay.amount)} · receipt {pay.receipt}
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <p className="rounded-xl bg-paper-2 p-4 text-sm">
          Player view — no dollar figures. Ask a parent about fees.
        </p>
      )}

      <Section title={t.plan}>
        {player.planLock ? (
          <ul className="text-sm">
            {player.planLock.rows.map((r) => (
              <li key={r.date}>
                {r.date} · {isPlayer ? "installment" : money(r.amount)}
              </li>
            ))}
          </ul>
        ) : (
          <p>Plan locks when you sign.</p>
        )}
      </Section>

      <Section title={t.docs}>
        <p>Document status is confirmed by the front office. Signed annual waivers are maintained in your account.</p>
        <Link to="/waiver" className="inline-flex min-h-11 items-center underline">View and sign annual waivers</Link>
        {(["birthCert", "insurance", "physical"] as const).map(k=><p key={k}>{k}: {player.docs[k]?"On file":"Not yet verified"}</p>)}
      </Section>

      <Section title={t.uniform}>
        <p className="text-sm">{club.uniforms.find((u) => u.id === team.uniformPackageId)?.name}</p>
        <label>Uniform number<input
          value={player.order.number}
          onChange={(e) =>
            patchPlayer({ ...player, order: { ...player.order, number: e.target.value } })
          }
          maxLength={3}
          placeholder="Number"
          className="mt-2 min-h-11 w-full rounded-md border border-line px-3"
        />
        </label>
        {(club.uniforms.find(u=>u.id===team.uniformPackageId)?.sizeFields||[]).map(field=><label className="mt-2 block" key={field}>{field}<input maxLength={30} value={player.order.sizes[field]||''} onChange={e=>patchPlayer({...player,order:{...player.order,sizes:{...player.order.sizes,[field]:e.target.value},submitted:false}})} className="mt-1 min-h-11 w-full rounded-md border px-3"/></label>)}
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={(club.uniforms.find(u=>u.id===team.uniformPackageId)?.sizeFields||[]).some(field=>!player.order.sizes[field]?.trim())}
            checked={player.order.submitted}
            onChange={(e) =>
              patchPlayer({ ...player, order: { ...player.order, submitted: e.target.checked } })
            }
          />
          Sizes submitted
        </label>
      </Section>

      <Section title={t.avail}>
        {team.tournamentIds.map((id) => {
          const ev = club.catalog.find((e) => e.id === id);
          return (
            <label key={id} className="block text-sm">
              {ev?.name}
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-line px-3"
                value={player.rsvp[id] ?? ""}
                onChange={(e) =>
                  patchPlayer({
                    ...player,
                    rsvp: { ...player.rsvp, [id]: e.target.value as never },
                  })
                }
              >
                <option value="">—</option>
                <option value="going">going</option>
                <option value="maybe">maybe</option>
                <option value="cant">can't</option>
              </select>
            </label>
          );
        })}
      </Section>

      <Section title={t.member}>
        <ul className="list-disc pl-5 text-sm">
          <li>Weekly cage time</li>
          <li>Development app access</li>
          <li>Practices and instruction</li>
          <li>Member pricing</li>
          <li>Recruiting support</li>
        </ul>
      </Section>

      <Section title={t.fund}>
        <p className="text-sm">
          Credits earned: {isPlayer ? "on file" : money(player.credits.reduce((s, c) => s + c.amount, 0))}
        </p>
        <p className="text-xs text-muted">Sponsorships reduce the balance, never the signed fee.</p>
      </Section>

      <Section title={t.cage}>
        <p className="text-sm">
          Weekly player credits: {team.playerCageHoursPerWeek} hours. No dollar figures on this screen.
        </p>
        <Button asChild className="mt-2">
          <Link to="/book">Book a cage</Link>
        </Button>
      </Section>

      <Section title="Player development">
        <Button asChild>
          <Link to="/account">Open programs, drills, and tracking</Link>
        </Button>
      </Section>
    </div>
  );
}
