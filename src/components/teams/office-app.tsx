import { useEffect, useMemo, useState } from "react";
import { getAssignableTeamCoaches } from "@/lib/team-coach-directory-api";
import { Button } from "@/components/ui/button";
import type { ClubRecord, StaffMember } from "@/lib/teams/types";
import { officeAddPlayer, officeAddTeam, officeRemoveTeam } from "@/lib/teams/store";
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
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const [activeTab, setActiveTab] = useState<"teams" | "overview">("overview");
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
      <nav aria-label="Front office admin tabs" className="flex flex-wrap gap-2 rounded-xl bg-paper-2 p-3">
        <Button type="button" variant={activeTab === "teams" ? "primary" : "outlineDark"} onClick={() => setActiveTab("teams")}>Teams & coaches</Button>
        <Button type="button" variant={activeTab === "overview" ? "primary" : "outlineDark"} onClick={() => setActiveTab("overview")}>Office overview</Button>
      </nav>
      {activeTab === "teams" ? (
        <section id="team-coach-assignments" aria-labelledby="team-coach-assignments-title" className="rounded-2xl border-2 border-maroon bg-paper p-5 scroll-mt-32">
          <h2 id="team-coach-assignments-title" className="text-2xl font-bold text-ink">Teams & coaches administration</h2>
          <p className="my-3 text-sm text-muted">Create baseball or softball teams, build coach profiles, and assign head or assistant coaches to teams.</p>
          <RosterTools club={club} onChange={onChange} />
          <CoachManagement club={club} onChange={onChange} onSave={onSave} />
        </section>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Teams" value={String(club.teams.length)} />
        <Stat label="Rostered" value={String(players.length)} />
        <Stat label="Contracted" value={money(revenue)} />
        <Stat label="Collected" value={money(collected)} />
      </div>
      <Button type="button" onClick={onSave}>Save club</Button>
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
      </>
      )}
    </div>
  );
}

function CoachManagement({ club, onChange, onSave }: {
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Assistant coach");
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");
  const [directory, setDirectory] = useState<Awaited<ReturnType<typeof getAssignableTeamCoaches>>>([]);
  const [directoryError, setDirectoryError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    getAssignableTeamCoaches().then(rows => { if (active) setDirectory(rows); }).catch(err => { if (active) setDirectoryError(err instanceof Error ? err.message : "Could not load existing coaches."); });
    return () => { active = false; };
  }, []);
  const coaches = Array.from(new Map([...directory.map(c => [c.email, { name: c.name, email: c.email }] as const), ...club.teams.flatMap(t => [
    ...(t.coachEmail ? [[t.coachEmail.trim().toLowerCase(), { name: t.headCoach, email: t.coachEmail }] as const] : []),
    ...t.staff.filter(s => s.email).map(s => [s.email.trim().toLowerCase(), { name: s.name, email: s.email }] as const),
  ])]).values());
  async function updateTeam(id: string, update: (team: ClubRecord["teams"][number]) => ClubRecord["teams"][number]) {
    if (saving) return;
    const next = { ...club, teams: club.teams.map(t => t.id === id ? update(t) : t) };
    onChange(next);
    setSaving(true);
    setMessage("Saving coach assignment…");
    try {
      const saved = await onSave(next);
      setMessage(saved ? "Coach assignment saved. Public pages will show it after refresh." : "Could not save coach assignment. Please try again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save coach assignment.");
    } finally { setSaving(false); }
  }
  return (
    <div className="mt-5 grid gap-5">
      <section className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-xl font-semibold">Create coach profile</h3>
        <p className="mb-3 text-sm text-muted">Team coach profiles are stored with the selected team and displayed on the public Coaches page. Existing lesson coaches retain their lesson profiles and can also be assigned to teams.</p>
        <form className="grid gap-3" onSubmit={e => {
          e.preventDefault();
          const selected = club.teams.find(t => t.id === teamId);
          if (!selected) { setMessage("Select a team first."); return; }
          const normalized = email.trim().toLowerCase();
          if (club.teams.some(t => t.staff.some(c => c.email.toLowerCase() === normalized && t.id === teamId))) {
            setMessage("This coach is already on the selected team."); return;
          }
          const coach: StaffMember = {
            id: crypto.randomUUID(), name: name.trim(), email: normalized, role,
            monthly: 0, childId: "", applyAmount: 0, w9: false,
            backgroundCheck: false, safeSport: false, expires: "",
          };
          updateTeam(teamId, t => ({ ...t, staff: [...t.staff, coach] }));
          setName(""); setEmail("");
        }}>
          <input required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder="Coach full name" aria-label="Coach full name" className="min-h-11 rounded-md border border-line px-3" />
          <input required type="email" maxLength={200} value={email} onChange={e => setEmail(e.target.value)} placeholder="Coach sign-in email" aria-label="Coach sign-in email" className="min-h-11 rounded-md border border-line px-3" />
          <select value={role} onChange={e => setRole(e.target.value)} aria-label="Coach role" className="min-h-11 rounded-md border border-line px-3">
            <option>Head coach</option><option>Assistant coach</option><option>Pitching coach</option><option>Hitting coach</option>
          </select>
          <select required value={teamId} onChange={e => setTeamId(e.target.value)} aria-label="Assign profile to team" className="min-h-11 rounded-md border border-line px-3">
            <option value="">Select baseball or softball team</option>
            {club.teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.sport}</option>)}
          </select>
          <Button type="submit" disabled={!club.teams.length || saving}>Create coach profile & assign</Button>
        </form>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-xl font-semibold">Assign coaches to teams</h3>
        <p className="text-sm text-muted">Choose from existing lesson coaches, staff directory profiles, and team coaches. Team assignments do not change lesson availability.</p>
        {directoryError ? <p role="alert" className="text-sm text-maroon">Existing coach directory could not load: {directoryError}</p> : null}
        {club.teams.length === 0 ? <p className="text-sm">Create a baseball or softball team above to begin.</p> : club.teams.map(team => (
          <div key={team.id} className="my-3 grid gap-2 rounded-lg border border-line p-3">
            <h4 className="font-semibold">{team.name} · {team.sport} · {team.age}</h4>
            <label className="grid gap-1 text-sm">Head coach
              <select disabled={saving} value={team.coachEmail} onChange={e => {
                const coach = coaches.find(c => c.email === e.target.value);
                updateTeam(team.id, t => ({ ...t, headCoach: coach?.name ?? "", coachEmail: coach?.email ?? "" }));
              }} className="min-h-11 rounded-md border border-line px-3">
                <option value="">Unassigned</option>
                {coaches.map(c => <option key={c.email} value={c.email}>{c.name} ({c.email})</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {team.staff.map(person => <button key={person.id} type="button" disabled={saving} className="rounded border px-3 py-2 text-xs" onClick={() => {
                if (!window.confirm(`Remove ${person.name} from ${team.name}? Their lesson profile will be kept.`)) return;
                void updateTeam(team.id, t => ({...t, staff:t.staff.filter(s => s.id!==person.id)}));
              }}>Remove {person.name} from team</button>)}
            </div>
            <p className="text-xs text-muted">Assigned staff: {team.staff.map(c => c.name + " (" + c.role + ")").join(", ") || "None"}</p>
            <label className="grid gap-1 text-sm">Add existing coach to this team
              <select disabled={saving} value="" onChange={e => {
                const coach = coaches.find(c => c.email === e.target.value);
                if (!coach || team.staff.some(s => s.email.toLowerCase() === coach.email.toLowerCase())) return;
                updateTeam(team.id, t => ({ ...t, staff: [...t.staff, {
                  id: crypto.randomUUID(), name: coach.name, email: coach.email,
                  role: "Assistant coach", monthly: 0, childId: "", applyAmount: 0,
                  w9: false, backgroundCheck: false, safeSport: false, expires: "",
                }] }));
              }} className="min-h-11 rounded-md border border-line px-3">
                <option value="">Choose existing coach</option>
                {coaches.map(c => <option key={c.email} value={c.email}>{c.name} ({c.email})</option>)}
              </select>
            </label>
          </div>
        ))}
      </section>
      {message && <p role="status" className="text-sm">{message}</p>}
      <Button type="button" disabled={saving} onClick={() => { void onSave(); }}>{saving ? "Saving…" : "Save assignments"}</Button>
      <p className="text-xs text-muted">Coach profiles and assignments do not automatically send invitations. Coaches must have authorized sign-in access.</p>
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
  const [season, setSeason] = useState("Spring 2027");
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
            const row = await officeAddTeam({ data: { name: teamName, age, sport, season } });
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
        <label className="grid gap-1 text-sm">Season
          <input required maxLength={100} value={season} onChange={e => setSeason(e.target.value)} list="team-season-options" className="min-h-11 rounded-md border border-line px-3" placeholder="Spring & Summer 2027" />
          <datalist id="team-season-options">{["Fall 2026","Spring 2027","Summer 2027","Spring & Summer 2027","Fall 2027","Spring 2028","Summer 2028"].map(x => <option key={x} value={x} />)}</datalist>
        </label>
        <Button type="submit" disabled={busy}>
          Add team
        </Button>
      </form>
      <div className="grid gap-2 rounded-xl border p-3">
        <h3 className="font-semibold">Manage existing teams</h3>
        {club.teams.map(team => <div key={team.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span>{team.name} · {team.sport} · {team.seasonLabel}</span><Button type="button" variant="outlineDark" disabled={busy} onClick={async () => {
          if (!window.confirm(`Delete ${team.name}? This cannot be undone. Teams with roster or activity records cannot be deleted.`)) return;
          setBusy(true);setError("");
          try { const row=await officeRemoveTeam({data:{teamId:team.id,baseRev:club._rev}});onChange(row.club);if(teamId===team.id)setTeamId(row.club.teams[0]?.id??""); }
          catch(err){setError(err instanceof Error?err.message:"Could not delete team.");}
          finally{setBusy(false);}
        }}>Remove team</Button></div>)}
      </div>
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
