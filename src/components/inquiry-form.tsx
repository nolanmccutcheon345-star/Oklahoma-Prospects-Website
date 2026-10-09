import { useEffect, useState, type FormEvent } from "react";
import { sendInquiry } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { TRYOUT_AGE_GROUPS, TRYOUT_REQUEST_SESSION } from "@/lib/club";
import { getPublicTryoutTeams } from "@/lib/tryout-events-api";
import type { TryoutEvent } from "@/lib/tryout-events-contracts";
import { formatClockTime } from "@/lib/time-display";
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
  initialEventId = "",
  intent = "register",
  publishedEvents = [],
}: {
  initialAge?: string;
  initialSport?: "Baseball" | "Softball";
  initialEventId?: string;
  intent?: "register" | "inquiry";
  publishedEvents?: TryoutEvent[];
}) {
  const initialEvent = publishedEvents.find((e) => e.id === initialEventId);
  const [mode, setMode] = useState<"scheduled" | "individual">(
    initialEvent ? "scheduled" : "individual",
  );
  const [eventId, setEventId] = useState(initialEvent?.id || "");
  const [consent, setConsent] = useState(false);
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    parent: "",
    phone: "",
    email: "",
    notes: "",
    autoEnroll: false,
    sport: initialEvent?.sport || initialSport,
    age: initialEvent
      ? initialEvent.ageGroups.includes(initialAge)
        ? initialAge
        : initialEvent.ageGroups.length === 1
          ? initialEvent.ageGroups[0]
          : ""
      : initialAge,
    season: initialEvent?.season || "",
    session: intent === "register" ? TRYOUT_REQUEST_SESSION : "",
    preferredTeamId: "",
    preferredCoachId: "",
  });
  const [teams, setTeams] = useState<PublicTryoutTeam[]>([]);
  const [teamError, setTeamError] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (intent !== "register") return;
    let live = true;
    getPublicTryoutTeams()
      .then((rows) => {
        if (live) setTeams(rows);
      })
      .catch(() => {
        if (live)
          setTeamError(
            "Team preferences are unavailable. You can still submit without a preference.",
          );
      });
    return () => {
      live = false;
    };
  }, [intent]);
  const selectedEvent = publishedEvents.find((e) => e.id === eventId);
  const scheduled = intent === "register" && mode === "scheduled";
  const eligibleTeams = teams.filter(
    (t) => t.sport === values.sport && t.age.toLowerCase() === values.age.toLowerCase(),
  );
  const selectedTeam = eligibleTeams.find((t) => t.id === values.preferredTeamId);
  function selectEvent(id: string) {
    const event = publishedEvents.find((e) => e.id === id);
    setEventId(id);
    setValues((v) => ({
      ...v,
      season: event?.season || "",
      sport: event?.sport || v.sport,
      age: event?.ageGroups.includes(v.age)
        ? v.age
        : event?.ageGroups.length === 1
          ? event.ageGroups[0]
          : "",
      preferredTeamId: "",
      preferredCoachId: "",
    }));
  }
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    if (intent === "register" && !consent) {
      setError("Please confirm the request consent.");
      return;
    }
    if (scheduled && (!selectedEvent || !selectedEvent.ageGroups.includes(values.age))) {
      setError("Choose a published tryout and matching age group.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendInquiry({
        data: {
          ...values,
          kind: intent === "register" ? "tryout" : "team-inquiry",
          requestId,
          sport: values.sport as "Baseball" | "Softball",
          autoEnroll: false,
          ...(intent === "register"
            ? {
                requestType: mode,
                requestedEventId: scheduled ? eventId : "",
                requestConsent: consent,
              }
            : {}),
        },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission did not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div role="status" className="rounded-xl border bg-paper p-5">
        <h3 className="text-2xl">Request received</h3>
        <p className="mt-2">
          Our staff will contact your family to confirm the next step. This request does not reserve
          an event spot, appointment, or roster place.
        </p>
        <p className="mt-3 text-sm">Reference: {requestId}</p>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {initialEventId && !initialEvent && (
        <p role="status">
          That event is no longer available. Please select another published tryout or request an
          individual evaluation.
        </p>
      )}
      {intent === "register" && (
        <fieldset className="grid gap-2 rounded-xl border bg-paper p-4 sm:grid-cols-2">
          <legend className="px-2 font-semibold">Choose your next step</legend>
          {(
            [
              ["scheduled", "Scheduled Tryout"],
              ["individual", "Individual Evaluation"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="tryout-type"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setEventId("");
                  setValues((v) => ({
                    ...v,
                    season: "",
                    preferredTeamId: "",
                    preferredCoachId: "",
                  }));
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <label className="text-sm font-semibold">
        Sport <span className="text-maroon">*</span>
        <select
          required
          className={fieldClass}
          value={values.sport}
          onChange={(e) => {
            setEventId("");
            setValues((v) => ({
              ...v,
              sport: e.target.value,
              season: "",
              preferredTeamId: "",
              preferredCoachId: "",
            }));
          }}
        >
          <option>Baseball</option>
          <option>Softball</option>
        </select>
      </label>
      {scheduled && (
        <>
          <label className="text-sm font-semibold">
            Scheduled tryout <span className="text-maroon">*</span>
            <select
              required
              className={fieldClass}
              value={eventId}
              onChange={(e) => selectEvent(e.target.value)}
            >
              <option value="">Choose a published tryout</option>
              {publishedEvents
                .filter((e) => e.sport === values.sport)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.season} · {e.ageGroups.join(" / ")} · {e.date} ·{" "}
                    {formatClockTime(e.startTime)} Central
                  </option>
                ))}
            </select>
          </label>
          {selectedEvent ? (
            <div className="rounded-lg bg-paper p-4 text-sm">
              <strong>{selectedEvent.season}</strong>
              <p>
                {selectedEvent.date} · {formatClockTime(selectedEvent.startTime)}–
                {formatClockTime(selectedEvent.endTime)} Central
              </p>
              <p>{selectedEvent.location}</p>
              <p className="mt-2 text-muted">Season is set by the published event.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {publishedEvents.some((e) => e.sport === values.sport)
                ? "Choose an event to see its season, time and location."
                : "No group tryouts are currently scheduled for this sport. Choose Individual Evaluation to request an appointment."}
            </p>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Age group <span className="text-maroon">*</span>
          <select
            required
            className={fieldClass}
            value={values.age}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                age: e.target.value,
                preferredTeamId: "",
                preferredCoachId: "",
              }))
            }
          >
            <option value="">Choose age group</option>
            {(scheduled ? selectedEvent?.ageGroups || [] : TRYOUT_AGE_GROUPS).map((age) => (
              <option key={age}>{age}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Player name <span className="text-maroon">*</span>
          <input
            required
            maxLength={120}
            className={fieldClass}
            value={values.player}
            onChange={(e) => setValues((v) => ({ ...v, player: e.target.value }))}
          />
        </label>
      </div>
      {intent === "register" && !scheduled && (
        <label className="text-sm font-semibold">
          Preferred season <span className="text-maroon">*</span>
          <input
            required
            maxLength={120}
            className={fieldClass}
            placeholder="For example, Spring 2027"
            value={values.season}
            onChange={(e) => setValues((v) => ({ ...v, season: e.target.value }))}
          />
          <span className="mt-1 block text-xs text-muted">
            Our staff will confirm the season and appointment with your family.
          </span>
        </label>
      )}
      <label className="text-sm font-semibold">
        Parent / Guardian <span className="text-maroon">*</span>
        <input
          required
          autoComplete="name"
          maxLength={120}
          className={fieldClass}
          value={values.parent}
          onChange={(e) => setValues((v) => ({ ...v, parent: e.target.value }))}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Phone <span className="text-maroon">*</span>
          <input
            required
            type="tel"
            autoComplete="tel"
            maxLength={120}
            className={fieldClass}
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          />
        </label>
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
      </div>
      <details className="rounded-xl border bg-paper p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Additional Preferences <span className="font-normal">(optional)</span>
        </summary>
        <div className="mt-2 grid gap-4">
          {intent === "register" && (
            <>
              {teamError && (
                <p role="status" className="text-sm">
                  {teamError}
                </p>
              )}
              <label className="text-sm font-semibold">
                Preferred team
                <select
                  className={fieldClass}
                  value={values.preferredTeamId}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      preferredTeamId: e.target.value,
                      preferredCoachId: "",
                    }))
                  }
                >
                  <option value="">No preference — have the office match me</option>
                  {eligibleTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTeam && (
                <label className="text-sm font-semibold">
                  Preferred coach
                  <select
                    className={fieldClass}
                    value={values.preferredCoachId}
                    onChange={(e) => setValues((v) => ({ ...v, preferredCoachId: e.target.value }))}
                  >
                    <option value="">No coach preference</option>
                    {selectedTeam.coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-sm text-muted">
                Preferences are requests. Staff will confirm the right fit and availability.
              </p>
            </>
          )}
          <label className="text-sm font-semibold">
            Player notes
            <textarea
              rows={3}
              maxLength={5000}
              className={cn(fieldClass, "py-2.5")}
              placeholder="Positions, goals, or questions"
              value={values.notes}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            />
          </label>
        </div>
      </details>
      {intent === "register" && (
        <label className="flex items-start gap-3 rounded-xl border bg-paper p-4 text-sm">
          <input
            required
            type="checkbox"
            className="mt-1 size-5 shrink-0"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I agree to be contacted about this tryout request. I understand that submitting does not
            reserve an event spot, appointment, or roster place; staff must confirm it.
          </span>
        </label>
      )}
      <Button
        type="submit"
        disabled={busy || (scheduled && !selectedEvent)}
        className="w-full sm:w-auto"
      >
        {busy
          ? "Sending request…"
          : intent === "register"
            ? "Submit tryout request"
            : "Submit team inquiry"}
      </Button>
    </form>
  );
}
