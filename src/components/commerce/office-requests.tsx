import { useEffect, useState, type FormEvent } from "react";
import { getOfficeRequests, closeOfficeRequest } from "@/lib/portal-api";
import { getPublicTryoutTeams } from "@/lib/tryout-events-api";
import { getTeamsClub, reviewTeamInquiry } from "@/lib/teams/store";
import { chicagoDate, validDate } from "@/lib/scheduling";
import type { PublicTryoutTeam } from "@/lib/tryout-preferences.server";
import { Button } from "@/components/ui/button";

type OfficeRequest = Awaited<ReturnType<typeof getOfficeRequests>>[number];
type TeamChoice = {
  id: string;
  name: string;
  sport: string;
  age: string;
  closed: boolean;
  seasonEnd: string;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function RequestStageForm({
  request,
  teams,
  publicTeams,
  onComplete,
  onError,
}: {
  request: OfficeRequest;
  teams: TeamChoice[];
  publicTeams: PublicTryoutTeam[];
  onComplete: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [stage, setStage] = useState<"registered" | "evaluated" | "offer" | "waitlist" | "accepted">("registered");
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const sport = String(request.payload.sport ?? "");
  const age = String(request.payload.age ?? "");
  const preferredTeamId = String(request.payload.preferredTeamId ?? "");
  const preferredCoachId = String(request.payload.preferredCoachId ?? "");
  const eligible = teams.filter(team =>
    !team.closed && validDate(team.seasonEnd) && team.seasonEnd >= chicagoDate()
    && same(team.sport, sport) && same(team.age, age)
  );
  const preferredTeamName = teams.find(t => t.id === preferredTeamId)?.name;
  const preferredCoachName = publicTeams
    .flatMap(t => t.coaches)
    .find(coach => coach.id === preferredCoachId)?.name;
  const differentTeam = Boolean(preferredTeamId && teamId && teamId !== preferredTeamId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !teamId || (differentTeam && !acknowledge)) return;
    setBusy(true);
    onError("");
    try {
      const result = await reviewTeamInquiry({
        data: { id: request.id, teamId, stage, acknowledgePreferenceOverride: acknowledge },
      });
      await onComplete(result.message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update the registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 grid gap-3 rounded-xl border border-line p-3" onSubmit={save}>
      <p className="font-semibold">Owner placement review · {sport || "Sport not recorded"} · {age || "Age not recorded"}</p>
      {preferredTeamId || preferredCoachId ? (
        <p className="text-sm">
          Family preference: {preferredTeamName || (preferredTeamId ? "Previously selected team (no longer listed)" : "No team preference")}
          {preferredCoachId ? ` · Coach: ${preferredCoachName || "Previously selected coach (no longer listed)"}` : ""}
          . This is a preference, not a guaranteed placement.
        </p>
      ) : <p className="text-sm text-muted">No specific team or coach preference requested.</p>}
      <label className="grid gap-1 text-sm font-semibold">
        Eligible team
        <select required name="team" className="min-h-11 rounded-lg border border-line bg-paper px-3" value={teamId}
          onChange={e => { setTeamId(e.target.value); setAcknowledge(false); }}>
          <option value="">Choose a matching team</option>
          {eligible.map(team => <option key={team.id} value={team.id}>{team.name} · {team.age}</option>)}
        </select>
      </label>
      {eligible.length === 0 ? <p role="status" className="text-sm text-maroon">No active team matches this request's sport and age. Update the team records or review the registration before placing this athlete.</p> : null}
      {differentTeam ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={acknowledge} onChange={e => setAcknowledge(e.target.checked)} />
          <span>I reviewed the family's preferred team and explicitly approve a different eligible team assignment.</span>
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-semibold">
        Registration stage
        <select name="stage" className="min-h-11 rounded-lg border border-line bg-paper px-3" value={stage}
          onChange={e => setStage(e.target.value as typeof stage)}>
          <option value="registered">Registered</option>
          <option value="evaluated">Evaluated</option>
          <option value="offer">Offer</option>
          <option value="waitlist">Waitlist</option>
          <option value="accepted">Accepted — add to roster and create guardian invitation</option>
        </select>
      </label>
      <Button type="submit" disabled={busy || !teamId || (differentTeam && !acknowledge)}>
        {busy ? "Saving…" : "Save registration stage"}
      </Button>
    </form>
  );
}

export function OfficeRequests() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getOfficeRequests>>>([]);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [publicTeams, setPublicTeams] = useState<PublicTryoutTeam[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const [requests, club, listed] = await Promise.all([
      getOfficeRequests(),
      getTeamsClub(),
      getPublicTryoutTeams().catch(() => [] as PublicTryoutTeam[]),
    ]);
    setRows(requests);
    setTeams(club.ok ? club.club.teams.map(team => ({
      id: team.id,
      name: team.name,
      sport: team.sport,
      age: team.age,
      closed: team.closed,
      seasonEnd: team.seasonEnd,
    })) : []);
    setPublicTeams(listed);
  }

  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : "Could not load registrations.")); }, []);

  return (
    <section className="my-6 grid gap-3">
      <h2 className="text-3xl">Registrations & requests</h2>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!rows.length && !error ? <p>No submitted requests.</p> : null}
      {rows.map(request => (
        <article key={request.id} className="rounded-xl border p-4">
          <h3 className="text-xl">{request.kind} · {request.status}</h3>
          <p>{new Date(request.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}</p>
          <dl>
            {Object.entries(request.payload).filter(([key]) => key !== "requestId").map(([key, value]) =>
              <div key={key} className="mt-1 break-words">
                <dt className="font-semibold">{key}</dt>
                <dd>{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</dd>
              </div>
            )}
          </dl>
          {["tryout", "team-inquiry"].includes(request.kind) && !request.payload.rosterPlayerId ? (
            <RequestStageForm request={request} teams={teams} publicTeams={publicTeams}
              onError={setError}
              onComplete={async message => { setNotice(message); await load(); }} />
          ) : null}
          {request.status === "open" && !["tryout", "team-inquiry", "membership-pause", "refund-review"].includes(request.kind) ? (
            <Button className="mt-3" variant="outlineDark" disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await closeOfficeRequest({ data: { id: request.id } }); await load(); }
                catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
                finally { setBusy(false); }
              }}>
              Mark request resolved
            </Button>
          ) : null}
          {["membership-pause", "refund-review"].includes(request.kind) ? (
            <p className="mt-3">Billing review required. This request does not change a subscription or issue a refund. Confirm the policy and provider outcome before closing it.</p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
