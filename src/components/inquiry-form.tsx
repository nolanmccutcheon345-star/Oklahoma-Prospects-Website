import { useEffect, useState, type FormEvent } from "react";
import { sendInquiry } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { TRYOUT_AGE_GROUPS, TRYOUT_REQUEST_SESSION } from "@/lib/club";
import { getPublicTryoutTeams } from "@/lib/tryout-events-api";
import type { TryoutEvent } from "@/lib/tryout-events-contracts";
import { publishedTryoutSeasons } from "@/lib/tryout-season-options";
import type { PublicTryoutTeam } from "@/lib/tryout-preferences.server";
import { cn } from "@/lib/utils";

const fieldClass =
  "mt-1.5 block min-h-11 w-full rounded-md border border-muted/40 bg-paper-2 px-3 text-base text-ink placeholder:text-muted";

type ContactValues = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

type TryoutValues = {
  player: string;
  age: string;
  parent: string;
  phone: string;
  email: string;
  notes: string;
  sport: string;
  session: string;
  season: string;
  autoEnroll: boolean;
  preferredTeamId: string;
  preferredCoachId: string;
};

export function ContactForm({ initialSubject = "" }: { initialSubject?: string }) {
  const [values, setValues] = useState<ContactValues>({
    name: "",
    email: "",
    phone: "",
    message: initialSubject ? `I’m interested in ${initialSubject}. ` : "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    setBusy(true);
    setError("");
    try {
      await sendInquiry({ data: { kind: "contact", requestId, ...values } });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission did not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status">Saved to the club’s front-office queue. Reference: {requestId}</p>
      ) : null}
      <label className="text-sm font-semibold">
        Name <span className="text-maroon">*</span>
        <input
          required
          autoComplete="name"
          className={fieldClass}
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Email <span className="text-maroon">*</span>
          <input
            required
            type="email"
            autoComplete="email"
            className={fieldClass}
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold">
          Phone
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className={fieldClass}
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          />
        </label>
      </div>
      <label className="text-sm font-semibold">
        Message <span className="text-maroon">*</span>
        <textarea
          required
          rows={5}
          className={cn(fieldClass, "min-h-32 py-2.5")}
          value={values.message}
          onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
        />
      </label>
      <Button type="submit" disabled={busy || sent} variant="primary" className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}

export function TryoutForm({
  initialAge = "",
  initialSport = "Baseball",
  intent = "register",
  publishedEvents = [],
}: {
  initialAge?: string;
  initialSport?: "Baseball" | "Softball";
  intent?: "register" | "inquiry";
  publishedEvents?: TryoutEvent[];
}) {
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    age: initialAge,
    parent: "",
    phone: "",
    email: "",
    notes: "",
    sport: initialSport,
    season: "",
    autoEnroll: false,
    preferredTeamId: "",
    preferredCoachId: "",
    session: intent === "register" ? TRYOUT_REQUEST_SESSION : "",
  });
  const [ageChoice, setAgeChoice] = useState(
    initialAge && TRYOUT_AGE_GROUPS.some(group => group === initialAge) ? initialAge : ""
  );
  const [teams, setTeams] = useState<PublicTryoutTeam[]>([]);
  const [teamError, setTeamError] = useState("");
  useEffect(() => {
    if (intent !== "register") return;
    let live = true;
    getPublicTryoutTeams()
      .then(rows => { if (live) setTeams(rows); })
      .catch(() => { if (live) { setTeams([]); setTeamError("Team preferences are currently unavailable. You can still submit without a preference."); } });
    return () => { live = false; };
  }, [intent]);
  const eligibleTeams = teams.filter(team => team.sport === values.sport && team.age.toLowerCase() === values.age.trim().toLowerCase());
  const selectedTeam = eligibleTeams.find(team => team.id === values.preferredTeamId);
  const availableSeasons = publishedTryoutSeasons(publishedEvents, values.sport, values.age);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    setBusy(true);
    setError("");
    try {
      await sendInquiry({
        data: {
          kind: intent === "register" ? "tryout" : "team-inquiry",
          requestId,
          ...values,
          sport: values.sport as "Baseball" | "Softball",
        },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission did not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status">
          Saved to the club’s front-office queue.{" "}
          {intent === "register"
            ? values.preferredTeamId
              ? "Your preferred team or coach request is saved for office review. It does not reserve a roster place, session or appointment. "
              : "Your request was saved. Automatic group enrollment happens only if you opted in and an eligible published group has capacity; private appointments require coach confirmation. "
            : ""}
          Reference: {requestId}
        </p>
      ) : null}
      <label className="text-sm font-semibold">
        Sport <span className="text-maroon">*</span>
        <select
          required
          className={fieldClass}
          value={values.sport}
          onChange={(e) => {
            const sport = e.target.value;
            setValues((v) => ({
              ...v,
              sport,
              preferredTeamId: "",
              preferredCoachId: "",
              autoEnroll: false,
              season: "",
              session: intent === "register" ? TRYOUT_REQUEST_SESSION : "",
            }));
          }}
        >
          <option value="Baseball">Baseball</option>
          <option value="Softball">Softball</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Player name <span className="text-maroon">*</span>
          <input
            required
            className={fieldClass}
            placeholder="Player full name"
            value={values.player}
            onChange={(e) => setValues((v) => ({ ...v, player: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold">
          Age group <span className="text-maroon">*</span>
          <select
            required
            className={fieldClass}
            value={ageChoice}
            onChange={(e) => {
              const nextAge = e.target.value;
              setAgeChoice(nextAge);
              setValues(v => ({ ...v, age: nextAge, season: "", preferredTeamId: "", preferredCoachId: "", autoEnroll: false }));
            }}
          >
            <option value="">Choose age group</option>
            {TRYOUT_AGE_GROUPS.map(age => <option key={age} value={age}>{age}</option>)}
          </select>
        </label>
      </div>
      {intent === "register" ? (
        <>
          <label className="text-sm font-semibold">
            Season <span className="text-maroon">*</span>
            {availableSeasons.length ? (
              <>
                <select
                  required
                  className={fieldClass}
                  value={availableSeasons.includes(values.season) ? values.season : ""}
                  onChange={e => setValues(v => ({ ...v, season: e.target.value, autoEnroll: false }))}
                >
                  <option value="">Choose a published tryout season</option>
                  {availableSeasons.map(season => <option key={season} value={season}>{season}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted">Published group evaluations matching this sport and age use these exact season names.</span>
              </>
            ) : (
              <>
                <input
                  required
                  className={fieldClass}
                  maxLength={120}
                  value={values.season}
                  placeholder="For example, Spring 2027"
                  onChange={e => setValues(v => ({ ...v, season: e.target.value, autoEnroll: false }))}
                />
                <span className="mt-1 block text-xs text-muted">No group date is published for this sport and age. Request an individual evaluation; the office will confirm its season and any appointment.</span>
              </>
            )}
          </label>
          <fieldset className="grid gap-3 rounded-xl border border-line p-4">
            <legend className="px-2 font-semibold">Team and coach preference (optional)</legend>
            {teamError ? <p role="status" className="text-sm text-muted">{teamError}</p> : null}
            <label className="text-sm font-semibold">Preferred team
              <select
                className={fieldClass}
                value={values.preferredTeamId}
                onChange={e => setValues(v => ({ ...v, preferredTeamId: e.target.value, preferredCoachId: "", autoEnroll: false }))}
              >
                <option value="">No preference — have the office match me</option>
                {eligibleTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            {selectedTeam ? <label className="text-sm font-semibold">Preferred coach
              <select
                className={fieldClass}
                value={values.preferredCoachId}
                onChange={e => setValues(v => ({ ...v, preferredCoachId: e.target.value }))}
              >
                <option value="">No particular coach preference</option>
                {selectedTeam.coaches.map(coach => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
              </select>
            </label> : <p className="text-sm text-muted">{values.age ? "No publicly assigned team has been verified for this sport and age, or no preference selected. Requests for all age groups remain open." : "Choose a sport and age group to see any publicly assigned team options."}</p>}
            <p className="text-sm text-muted">Preferences are requests, not guaranteed team assignments or appointments.</p>
          </fieldset>
          {!values.preferredTeamId ? <label className="rounded-md border border-powder bg-paper p-4 text-sm">
            <input
              type="checkbox"
              checked={values.autoEnroll}
              onChange={e => setValues(v => ({ ...v, autoEnroll: e.target.checked }))}
              className="mr-2"
            />
            If a published group tryout matches my player's sport, age group and season, I agree to automatic enrollment when capacity allows. Leave unchecked for office follow-up.
          </label> : <p className="text-sm text-muted">The office will review your preferred team or coach. Automatic group enrollment is disabled to avoid placing you with a different team.</p>}
          <p className="text-sm text-muted">
            All ages are welcome. If no matching place is available, your request stays open.
            Private appointments require agreement with a coach.
          </p>
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Parent / Guardian <span className="text-maroon">*</span>
          <input
            required
            autoComplete="name"
            className={fieldClass}
            value={values.parent}
            onChange={(e) => setValues((v) => ({ ...v, parent: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold">
          Phone <span className="text-maroon">*</span>
          <input
            required
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className={fieldClass}
            placeholder="(###) ###-####"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          />
        </label>
      </div>
      <label className="text-sm font-semibold">
        Email <span className="text-maroon">*</span>
        <input
          required
          type="email"
          autoComplete="email"
          className={fieldClass}
          placeholder="you@example.com"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </label>
      <label className="text-sm font-semibold">
        Notes
        <textarea
          rows={4}
          className={cn(fieldClass, "min-h-28 py-2.5")}
          placeholder="Positions, current team, goals, or questions"
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
        />
      </label>
      <Button type="submit" disabled={busy || sent} variant="primary" className="w-full sm:w-auto">
        Submit {intent === "register" ? "tryout request" : "team inquiry"}
      </Button>
    </form>
  );
}
