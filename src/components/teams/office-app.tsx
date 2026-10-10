import { RosterRoleSelect } from "@/components/teams/roster-role-select";
import type { RosterRole } from "@/lib/teams/po-roster";
import { SeasonPicker } from "./season-picker";
import { teamSeasons } from "@/lib/teams/seasons";
import { useEffect, useState } from "react";
import { TeamCoachProfileEditor } from "./team-coach-profile-editor";
import { getAssignableTeamCoaches } from "@/lib/team-coach-directory-api";
import { Button } from "@/components/ui/button";
import type { ClubRecord, StaffMember } from "@/lib/teams/types";
import { officeAddPlayer, officeAddTeam, officeRemoveTeam, officeSaveTeamSeasons } from "@/lib/teams/store";
import { AGE_GROUPS } from "@/lib/club";
import { balance, docsComplete, fundingCount } from "@/lib/teams/pricing";
import { Section } from "./ui";
import { money } from "./ui";

export function OfficeApp({
  club,
  onChange,
  onSave,
  initialTab = "overview",
}: {
  initialTab?: "teams" | "overview";
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const [activeTab, setActiveTab] = useState<"teams" | "overview">(initialTab);
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
          <RosterTools club={club} onChange={onChange} onSave={onSave} />
          <CoachManagement club={club} onSave={onSave} />
        </section>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Teams" value={String(club.teams.length)} />
        <Stat label="Rostered" value={String(players.length)} />
        <Stat label="Contracted" value={money(revenue)} />
        <Stat label="Collected" value={money(collected)} />
      </div>
      <Button type="button" onClick={() => { void onSave(); }}>Save club</Button>
      <Section title="Attention queue" defaultOpen>
        <ul className="grid gap-1 text-sm">
          <li>Unsigned agreements {attention.unsigned.length}</li>
          <li>Unpaid deposits {attention.deposits.length}</li>
          <li>Balances remaining {attention.pastDue.length}</li>
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

function CoachManagement({ club, onSave }: {
  club: ClubRecord;
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
  const [assignmentRoles, setAssignmentRoles] = useState<Record<string,string>>({});
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
    // Only the confirmed server response updates the selected coach and profile editor.
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
          if (selected.coachEmail.trim().toLowerCase() === normalized || selected.staff.some(c => c.email.toLowerCase() === normalized)) {
            setMessage("This coach is already on the selected team."); return;
          }
          const coach: StaffMember = {
            id: crypto.randomUUID(), name: name.trim(), email: normalized, role,
            monthly: 0, childId: "", applyAmount: 0, w9: false,
            backgroundCheck: false, safeSport: false, expires: "",
          };
          void updateTeam(teamId, t => role === "Head coach" ? {...t, headCoach: coach.name, coachEmail: coach.email} : ({ ...t, staff: [...t.staff, coach] }));
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
                updateTeam(team.id, t => ({ ...t, headCoach: coach?.name ?? "", coachEmail: coach?.email ?? "", headCoachBio: t.staff.find(s=>s.email===coach?.email)?.bio ?? "", headCoachPhoto: t.staff.find(s=>s.email===coach?.email)?.photo ?? "", staff: t.staff.filter(s=>s.email.trim().toLowerCase()!==t.coachEmail.trim().toLowerCase() || s.email.trim().toLowerCase()===coach?.email?.trim().toLowerCase()) }));
              }} className="min-h-11 rounded-md border border-line px-3">
                <option value="">Unassigned</option>
                {coaches.map(c => <option key={c.email} value={c.email}>{c.name} ({c.email})</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {team.staff.filter(person => person.email.trim().toLowerCase() !== team.coachEmail.trim().toLowerCase()).map(person => <button key={person.id} type="button" disabled={saving} className="rounded border px-3 py-2 text-xs" onClick={() => {
                if (!window.confirm(`Remove ${person.name} from ${team.name}? Their lesson profile will be kept.`)) return;
                void updateTeam(team.id, t => ({...t, staff:t.staff.filter(s => s.id!==person.id)}));
              }}>Remove {person.name} from team</button>)}
            </div>
            {team.coachEmail && <TeamCoachProfileEditor key={team.id+"-head-"+team.coachEmail} email={team.coachEmail} name={team.headCoach} bio={(team as typeof team & {headCoachBio?:string}).headCoachBio} photo={(team as typeof team & {headCoachPhoto?:string}).headCoachPhoto} onSaved={()=>window.location.reload()}/>}
            {team.staff.filter(person => person.email.trim().toLowerCase() !== team.coachEmail.trim().toLowerCase()).map(person=><TeamCoachProfileEditor key={person.id} email={person.email} name={person.name} bio={(person as typeof person & {bio?:string}).bio} photo={(person as typeof person & {photo?:string}).photo} onSaved={()=>window.location.reload()}/>)}
            <p className="text-xs text-muted">Assigned staff: {team.staff.filter(c => c.email.trim().toLowerCase() !== team.coachEmail.trim().toLowerCase()).map(c => c.name + " (" + c.role + ")").join(", ") || "None"}</p>
            <label className="grid gap-1 text-sm">Additional coach role
              <select value={assignmentRoles[team.id] ?? "Assistant coach"} onChange={e=>setAssignmentRoles({...assignmentRoles,[team.id]:e.target.value})} className="min-h-11 rounded-md border border-line px-3">
                <option>Assistant coach</option><option>Pitching coach</option><option>Hitting coach</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Add assistant or additional coach
              <select disabled={saving} value="" onChange={e => {
                const coach = coaches.find(c => c.email === e.target.value);
                if (!coach || coach.email.trim().toLowerCase() === team.coachEmail.trim().toLowerCase() || team.staff.some(s => s.email.toLowerCase() === coach.email.toLowerCase())) return;
                updateTeam(team.id, t => ({ ...t, staff: [...t.staff, {
                  id: crypto.randomUUID(), name: coach.name, email: coach.email,
                  role: assignmentRoles[team.id] ?? "Assistant coach", monthly: 0, childId: "", applyAmount: 0,
                  w9: false, backgroundCheck: false, safeSport: false, expires: "",
                }] }));
              }} className="min-h-11 rounded-md border border-line px-3">
                <option value="">Choose existing coach</option>
                {coaches.filter(c=>c.email.trim().toLowerCase()!==team.coachEmail.trim().toLowerCase() && !team.staff.some(s=>s.email.trim().toLowerCase()===c.email.trim().toLowerCase())).map(c => <option key={c.email} value={c.email}>{c.name} ({c.email})</option>)}
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
  onSave,
}: {
  club: ClubRecord;
  onChange: (club: ClubRecord) => void;
  onSave: (next?: ClubRecord) => Promise<boolean>;
}) {
  const [teamName, setTeamName] = useState("");
  const [age, setAge] = useState("13U");
  const [sport, setSport] = useState<"baseball" | "softball">("baseball");
  const [seasons, setSeasons] = useState(["Spring 2027"]);
  const [seasonDrafts, setSeasonDrafts] = useState<Record<string,string[]>>({});
  const [notice, setNotice] = useState("");
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
            const row = await officeAddTeam({ data: { name: teamName, age, sport, season: seasons.join(" & ") } });
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
        <SeasonPicker label="Seasons for new team" value={seasons} onChange={setSeasons} disabled={busy} />
        <Button type="submit" disabled={busy || !seasons.length}>
          Add team
        </Button>
      </form>
      <div className="grid gap-2 rounded-xl border p-3">
        <h3 className="font-semibold">Manage existing teams</h3>
        {notice && <p role="status">{notice}</p>}
        {club.teams.map(team => <div key={team.id} className="grid gap-2 border-b py-3 text-sm">
          <span className="font-semibold">{team.name} · {team.sport}</span>
          <SeasonPicker label={`Seasons for ${team.name}`} value={seasonDrafts[team.id] ?? teamSeasons(team)} disabled={busy}
            onChange={value => setSeasonDrafts(prev => ({...prev, [team.id]: value}))} />
          <Button type="button" disabled={busy || !(seasonDrafts[team.id] ?? teamSeasons(team)).length} onClick={async () => {
            setBusy(true); setError(""); setNotice("");
            try {
              const row = await officeSaveTeamSeasons({data: {teamId: team.id, baseRev: club._rev, seasons: seasonDrafts[team.id] ?? teamSeasons(team)}});
              onChange(row.club);
              setSeasonDrafts(prev => { const next={...prev}; delete next[team.id]; return next; });
              setNotice(`Saved ${team.name}: ${row.club.teams.find(t=>t.id===team.id)?.seasonLabel}.`);
            } catch(err) { setError(err instanceof Error ? err.message : "Could not save seasons."); }
            finally { setBusy(false); }
          }}>Save seasons</Button><Button type="button" variant="outlineDark" disabled={busy} onClick={async () => {
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
              data: { teamId, name: playerName, parentName, parentEmail, rosterRole: new FormData(event.currentTarget).get("rosterRole") as RosterRole },
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
            <RosterRoleSelect teamId={teamId}/>
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
