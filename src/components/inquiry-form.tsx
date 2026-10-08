import { useState, type FormEvent } from "react";
import { sendInquiry } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { AGE_GROUPS, TRYOUT_REQUEST_SESSION } from "@/lib/club";
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
}: {
  initialAge?: string;
  initialSport?: "Baseball" | "Softball";
  intent?: "register" | "inquiry";
}) {
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    age: initialAge,
    parent: "",
    phone: "",
    email: "",
    notes: "",
    sport: initialSport,
    session: intent === "register" ? TRYOUT_REQUEST_SESSION : "",
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
            ? "Your request does not reserve an appointment. Prospects will respond with next steps. "
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
          <input
            required
            className={fieldClass}
            value={values.age}
            maxLength={120}
            list={`tryout-ages-${intent}`}
            placeholder="For example, 9U or 18U"
            onChange={(e) => setValues((v) => ({ ...v, age: e.target.value }))}
          />
          <datalist id={`tryout-ages-${intent}`}>
            {AGE_GROUPS.map((age) => (
              <option key={age} value={age} />
            ))}
          </datalist>
        </label>
      </div>
      {intent === "register" ? (
        <p className="rounded-md border border-powder bg-paper p-4 text-sm">
          All age groups are welcome for baseball and softball. Submit your player information to
          request an individual tryout. A coach can arrange a private tryout with you; submitting
          does not assign an appointment.
        </p>
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
