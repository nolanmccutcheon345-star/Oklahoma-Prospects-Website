import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClubRecord } from "@/lib/teams/types";
import { officeAddPlayer, officeAddTeam } from "@/lib/teams/store";
import { AGE_GROUPS } from "@/lib/club";
import { balance, docsComplete, fundingCount, priceComponents } from "@/lib/teams/pricing";
import { Section } from "./ui";
import { money } from "./ui";

export function OfficeApp({
  club,
  onChange,
  onSave,
}: {
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
  onSave: () => void;
}) {
  const players = club.teams.flatMap((t) => t.roster.map((p) => ({ team: t, player: p })));
  const attention = {
    unsigned: players.filter((x) => !x.player.agreement.signedAt),
    deposits: players.filter((x) => !x.player.depositPaid),
    pastDue: players.filter(
      (x) => balance(x.player, x.player.feeLock?.amount ?? 0) > 0 && x.player.depositPaid,
    ),
    paper: players.filter((x) => !docsComplete(x.player)),
    sizes: players.filter((x) => !x.player.order.submitted),
    thin: club.teams.filter((t) => fundingCount(t) < 10),
    noSched: club.teams.filter((t) => t.tournamentIds.length === 0),
  };
  const revenue = players.reduce((s, x) => s + (x.player.feeLock?.amount ?? 0), 0);
  const collected = players.reduce(
    (s, x) => s + x.player.payments.reduce((a, p) => a + p.amount, 0),
    0,
  );

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1);
      const label = d.toLocaleString("en-US", { month: "short" });
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inflow = players.reduce((sum, x) => {
        return (
          sum +
          (x.player.planLock?.rows.filter((r) => r.date.startsWith(key)).reduce((a, r) => a + r.amount, 0) ??
            0)
        );
      }, 0);
      const staff = club.teams.reduce((sum, t) => sum + t.coachMonthly, 0);
      const facility = club.settings.facilityMonthly * Math.max(1, club.teams.length);
      const outflow = staff + facility;
      return { label, inflow, outflow };
    });
  }, [club, players]);

  let run = 0;
  let shortMonth = "";
  const flow = months.map((m) => {
    run += m.inflow - m.outflow;
    if (run < 0 && !shortMonth) shortMonth = m.label;
    return { ...m, run };
  });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Teams" value={String(club.teams.length)} />
        <Stat label="Rostered" value={String(players.length)} />
        <Stat label="Contracted" value={money(revenue)} />
        <Stat label="Collected" value={money(collected)} />
      </div>
      <Button type="button" onClick={onSave}>
        Save club
      </Button>

      <RosterTools club={club} onChange={onChange} />

      <Section title="Attention queue" defaultOpen>
        <ul className="grid gap-1 text-sm">
          <li>Unsigned agreements {attention.unsigned.length}</li>
          <li>Unpaid deposits {attention.deposits.length}</li>
          <li>Past-due {attention.pastDue.length}</li>
          <li>Missing paperwork {attention.paper.length}</li>
          <li>Missing sizes {attention.sizes.length}</li>
          <li>Teams under ten {attention.thin.map((t) => t.name).join(", ") || "none"}</li>
          <li>No schedule {attention.noSched.map((t) => t.name).join(", ") || "none"}</li>
        </ul>
      </Section>

      <Section title="Collections">
        <ul className="grid gap-2">
          {attention.pastDue.concat(attention.deposits).map(({ team, player }) => (
            <li key={player.id} className="flex justify-between rounded-lg bg-paper-2 p-3 text-sm">
              <span>
                {player.name} · {team.name}
              </span>
              <span>{money(balance(player, player.feeLock?.amount ?? 0))}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Cash flow" defaultOpen>
        {shortMonth ? (
          <p className="mb-2 font-semibold text-maroon">You go short in {shortMonth}.</p>
        ) : (
          <p className="mb-2 text-sm">Running balance stays non-negative in this model.</p>
        )}
        <ul className="grid gap-1 text-sm">
          {flow.map((m) => (
            <li key={m.label} className="flex justify-between gap-3">
              <span>{m.label}</span>
              <span>
                in {money(m.inflow)} · out {money(m.outflow)} · run {money(m.run)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Coach scorecard">
        {club.teams.map((t) => (
          <article key={t.id} className="mb-2 rounded-lg bg-paper-2 p-3 text-sm">
            <p className="font-semibold">{t.headCoach}</p>
            <p>
              Fill {fundingCount(t)}/10 · record {t.record.w}-{t.record.l} · events {t.tournamentIds.length}
            </p>
          </article>
        ))}
      </Section>

      <Section title="Staff and contractor payouts">
        {club.teams.flatMap((t) =>
          t.staff.map((s) => (
            <p key={s.id} className="text-sm">
              {s.name} · {money(s.monthly)}/mo · contractor record {s.w9 ? "yes" : "NO"} · SafeSport{" "}
              {s.safeSport ? "yes" : "NO"}
            </p>
          )),
        )}
      </Section>

      <Section title="Pricing rules">
        {(
          [
            ["contingencyPct", "Contingency"],
            ["membershipMonthly", "Membership / month"],
            ["facilityMonthly", "Facility / team / month"],
            ["fundingPlayers", "Funding players"],
            ["orgFeeFloor", "Org fee floor"],
            ["orgFeeCeiling", "Org fee ceiling"],
            ["cageHourly", "Cage hourly"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="mb-2 block text-sm">
            {label}
            <input
              type="number"
              step="any"
              className="mt-1 min-h-11 w-full rounded-md border border-line px-3"
              value={club.settings[key]}
              onChange={(e) =>
                onChange({
                  ...club,
                  settings: { ...club.settings, [key]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
        {club.teams[0] ? (
          <p className="text-sm">
            Example published price{" "}
            {money(
              priceComponents(
                club.teams[0],
                club.settings,
                club.uniforms.find((u) => u.id === club.teams[0].uniformPackageId)?.price ?? 0,
              ).published,
            )}
          </p>
        ) : null}
      </Section>

      <Section title="Tryouts">
        <ul className="grid gap-2 text-sm">
          {club.leads.map((lead) => (
            <li key={lead.id} className="rounded-lg bg-paper-2 p-3">
              {lead.name} · {lead.age} · {lead.stage}
              <span className="block text-xs">
                H{lead.grades.hit} P{lead.grades.power} R{lead.grades.run} A{lead.grades.arm} F
                {lead.grades.field} M{lead.grades.makeup}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Alumni">
        {club.alumni.length === 0 ? (
          <p className="text-sm">No public count until a commitment exists.</p>
        ) : (
          <ul>
            {club.alumni.map((a) => (
              <li key={a.id}>
                {a.name} · {a.kind} · {a.detail}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Automations">
        <p className="text-sm">Notifications are recorded in-club. Email and text are not wired yet.</p>
        <p className="text-sm">Paperwork chase would hit {attention.paper.length} families.</p>
        <p className="text-sm">Deposit chase would hit {attention.deposits.length} families.</p>
      </Section>

      <Section title="Audit">
        <ul className="text-sm">
          {club.audit.slice(0, 12).map((a, i) => (
            <li key={i}>
              {a.at} · {a.action} · {a.detail}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Exports">
        <Button
          type="button"
          variant="outlineDark"
          onClick={() => {
            const blob = new Blob([JSON.stringify(club, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "oklahoma-prospects-club.json";
            a.click();
          }}
        >
          Download JSON backup
        </Button>
      </Section>
    </div>
  );
}

function RosterTools({
  club,
  onChange,
}: {
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [age, setAge] = useState("13U");
  const [sport, setSport] = useState<"baseball" | "softball">("baseball");
  const [teamId, setTeamId] = useState(club.teams[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Roster tools" defaultOpen>
      <p className="mb-3 text-sm text-muted">
        Add a team, then add a player with the parent’s email so their family desk opens.
      </p>
      <form
        className="mb-4 grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const row = await officeAddTeam({ data: { name: teamName, age, sport } });
            onChange(row.club);
            setTeamName("");
            setTeamId(row.club.teams.at(-1)?.id ?? teamId);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add team.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm font-semibold">New team</p>
        <input
          required
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name"
          className="min-h-11 rounded-md border border-line px-3"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="min-h-11 rounded-md border border-line px-3"
          >
            {AGE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value as "baseball" | "softball")}
            className="min-h-11 rounded-md border border-line px-3"
          >
            <option value="baseball">Baseball</option>
            <option value="softball">Softball</option>
          </select>
        </div>
        <Button type="submit" disabled={busy}>
          Add team
        </Button>
      </form>
      <form
        className="grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const row = await officeAddPlayer({
              data: { teamId, name: playerName, parentName, parentEmail },
            });
            onChange(row.club);
            setPlayerName("");
            setParentName("");
            setParentEmail("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add player.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm font-semibold">New player</p>
        {club.teams.length === 0 ? (
          <p className="text-sm text-muted">Add a team first.</p>
        ) : (
          <>
            <select
              required
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="min-h-11 rounded-md border border-line px-3"
            >
              {club.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <input
              required
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Player name"
              className="min-h-11 rounded-md border border-line px-3"
            />
            <input
              required
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Parent name"
              className="min-h-11 rounded-md border border-line px-3"
            />
            <input
              required
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="Parent email — used to open their family desk"
              className="min-h-11 rounded-md border border-line px-3"
            />
            <Button type="submit" disabled={busy || !teamId}>
              Add player and link family
            </Button>
          </>
        )}
      </form>
      {error ? (
        <p className="mt-2 text-sm text-maroon" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink p-4 text-fg-inverse">
      <p className="text-xs tracking-widest text-powder uppercase">{label}</p>
      <p className="font-display text-3xl">{value}</p>
    </div>
  );
}
