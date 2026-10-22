import { RegistrationProfileFilters } from "./registration-profile-filters";
import { setTryoutCoordinator } from "@/lib/tryout-center-api";
import { useEffect, useMemo, useState } from "react";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import {
  getRegistrationAccess,
  getRegistrationRows,
  getRegistrationReaders,
  setRegistrationReader,
  reviewRegistrationEligibility,
} from "@/lib/registrations-api";

import { TryoutEventEditor } from "./tryout-event-editor";
import { UsssaPlayerId, usssaStatusLabel } from "./usssa-player-id";

type Rows = Awaited<ReturnType<typeof getRegistrationRows>>;
const labels: Record<string, string> = {
  birthMonthYear: "Birth month / year", graduationYear: "Graduation year", school: "School", schoolStatus: "School status", suggestedDivision: "Suggested division", eligibilityStatus: "Review status", eligibilityExplanation: "Eligibility explanation", season: "Season",
  player: "Player",
  parent: "Parent / guardian",
  name: "Name",
  age: "Age group",
  sport: "Sport",
  session: "Tryout session",
  email: "Email",
  phone: "Phone",
  notes: "Notes",
  positions: "Player positions",
  usssaStatus: "USSSA status",
  usssaAthleteId: "USSSA Player / Athlete ID",
  message: "Message",
};
export function RegistrationDesk() {
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getRegistrationAccess>>>();
  const [rows, setRows] = useState<Rows>([]);
  const [readers, setReaders] = useState<Awaited<ReturnType<typeof getRegistrationReaders>>>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [sport, setSport] = useState("all"),
    [kind, setKind] = useState("all");
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    setRows([]);
    setReaders([]);
    try {
      const next = await getRegistrationAccess();
      setAccess(next);
      if (next.allowed) setRows(await getRegistrationRows());
      if (next.owner) setReaders(await getRegistrationReaders());
    } catch (e) {
      setAccess(undefined);
      setError(e instanceof Error ? e.message : "Could not load registrations.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (sport === "all" || row.payload.sport === sport) &&
          (kind === "all" || row.kind === kind) &&
          Object.values(row.payload).join(" ").toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [rows, sport, kind, search],
  );
  return (
    <main id="main">
      <PageHero
        compact
        eyebrow="Coordinator desk · read only"
        title="Meet the next"
        accent="generation of Prospects."
        copy="Tryout signups, team inquiries, and messages from families."
        image="/brand/team.jpg"
        actions={
          <Button asChild variant="outline">
            <a href="/account">My account</a>
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-8 pb-28">
{access?.allowed&&<RegistrationProfileFilters busy={loading} onApply={async data=>{setLoading(true);setError('');try{setRows(await getRegistrationRows({data}));}catch(e){setRows([]);setError(e instanceof Error?e.message:'Could not load registrations.');}finally{setLoading(false);}}}/>}
        {error ? (
          <p role="alert" className="mb-4 text-maroon">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mb-4">
            {notice}
          </p>
        ) : null}
        {loading ? (
          <p role="status">Loading registrations…</p>
        ) : !access?.allowed ? (
          <section className="rounded-xl border p-5">
            <h2 className="text-2xl">Access needed</h2>
            <p>Ask a club owner to enable registration viewing for your verified account.</p>
          </section>
        ) : (
          <>
            {access.owner ? <TryoutEventEditor /> : null}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-3xl">Registrations & inquiries</h2>
                <p className="text-sm text-muted">
                  Latest {rows.length} records (up to 100 per page). Viewing only.
                </p>
              </div>
              <Button variant="outlineDark" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-semibold">
                Search
                <input
                  className="mt-1 min-h-11 w-full rounded-md border bg-paper px-3"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Player, parent, email…"
                />
              </label>
              <label className="text-sm font-semibold">
                Sport
                <select
                  className="mt-1 min-h-11 w-full rounded-md border bg-paper px-3"
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                >
                  <option value="all">All sports & messages</option>
                  <option>Softball</option>
                  <option>Baseball</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Request type
                <select
                  className="mt-1 min-h-11 w-full rounded-md border bg-paper px-3"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">All requests</option>
                  <option value="tryout">Tryouts</option>
                  <option value="team-inquiry">Team inquiries</option>
                  <option value="contact">Contact messages</option>
                </select>
              </label>
            </div>
            <p className="mb-3 text-sm" role="status">
              {filtered.length} matching records
            </p>
            <div className="grid gap-4">
              {filtered.map((row) => (
                <article key={row.id} className="rounded-2xl border bg-paper-2 p-5 shadow-border">
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {row.kind.replaceAll("-", " ")} · {row.status}
                  </p>
                  <h3 className="mt-1 text-2xl">
                    {row.payload.player || row.payload.name || "Inquiry"}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Submitted{" "}
                    {new Date(row.created_at).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                    })}{" "}
                    CT
                  </p>
                  <dl className="mt-4 grid gap-3">
                    {Object.entries(row.payload)
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <div key={key} className="break-words">
                          <dt className="text-sm font-semibold">{labels[key] || key}</dt>
                          <dd className="whitespace-pre-wrap">
                            {key === "usssaAthleteId" ? (
                              <UsssaPlayerId value={value} />
                            ) : key === "usssaStatus" ? (
                              usssaStatusLabel(value)
                            ) : (
                              value
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {access.owner && row.kind!=='contact' && row.payload.profileConfirmedAt && !['accepted','declined','closed','resolved'].includes(row.status) && <EligibilityReview row={row} onSaved={load}/>}
                </article>
              ))}
            </div>
            {!filtered.length ? (
              <p className="rounded-xl border p-5">No requests match these filters.</p>
            ) : null}
            {access.owner ? (
              <details className="mt-8 rounded-xl border p-5">
                <summary className="cursor-pointer font-semibold">
                  Owner controls · registration viewing access
                </summary>
                <p className="my-3 text-sm">
                  Enable read-only access to tryouts, team inquiries, and contact messages. This
                  does not grant payment, account, roster, or registration editing access.
                </p>
                <ul className="grid gap-3">
                  {readers.map((reader) => (
                    <li
                      key={reader.user_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper-2 p-3"
                    >
                      <div className="min-w-0 break-words">
                        <p className="font-semibold">{reader.name}</p>
                        <p className="text-sm">{reader.email}</p>
                        <p className="text-sm">
                          {reader.enabled ? "Registration viewing enabled" : "No additional access"}
                        </p>
                      </div>
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await setTryoutCoordinator({
                              data: { userId: reader.user_id, enabled: !reader.can_manage_tryouts },
                            });
                            setReaders(await getRegistrationReaders());
                            setNotice("Tryout coordinator access updated.");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Could not update coordinator.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {reader.can_manage_tryouts
                          ? "Remove tryout coordinator"
                          : "Enable tryout coordinator"}
                      </Button>
                      <Button
                        variant="outlineDark"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await setRegistrationReader({
                              data: { userId: reader.user_id, enabled: !reader.enabled },
                            });
                            setReaders(await getRegistrationReaders());
                            setNotice(
                              `${reader.name}: registration viewing ${reader.enabled ? "removed" : "enabled"}.`,
                            );
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Could not change access.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {reader.enabled ? "Remove viewing access" : "Enable viewing access"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
        {!loading && error ? <Button onClick={() => void load()}>Try again</Button> : null}
      </div>
    </main>
  );
}

function EligibilityReview({row,onSaved}:{row:Rows[number];onSaved:()=>Promise<void>}){
 const [reason,setReason]=useState(''),[rule,setRule]=useState(row.payload.eligibilityRule||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(decision:'approved'|'deferred'){
  setBusy(true);setError('');try{await reviewRegistrationEligibility({data:{requestId:row.id,revision:row.revision,decision,reason,ruleReference:rule}});await onSaved();}catch(e){setError(e instanceof Error?e.message:'Review could not be saved.');}finally{setBusy(false);}
 }
 return <details className="mt-4 rounded border p-3"><summary>Owner eligibility review</summary><p>This records a reviewed eligibility decision only. It does not assign a team or change permissions.</p><label>Rule or exception reference<input className="block min-h-11 w-full rounded border p-2" value={rule} onChange={e=>setRule(e.target.value)} maxLength={500}/></label><label>Reason and reviewed evidence<textarea className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>{error&&<p role="alert">{error}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy||reason.trim().length<5||rule.trim().length<3} onClick={()=>void save('approved')}>Record approval</Button><Button variant="outline" disabled={busy||reason.trim().length<5||rule.trim().length<3} onClick={()=>void save('deferred')}>Keep for review</Button></div></details>;
}
