import { useState, type FormEvent } from "react";
import {sendInquiry} from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { AGE_GROUPS, TRYOUT_AGES, SOFTBALL_AGES, SOFTBALL_TRYOUT_SESSION } from "@/lib/club";
import { BASEBALL_TRYOUT_SESSIONS } from "@/lib/tryout-registration";
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

  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [sent,setSent]=useState(false);const [requestId]=useState(()=>crypto.randomUUID());
  async function onSubmit(event: FormEvent) {
    event.preventDefault();if(busy||sent)return;setBusy(true);setError("");
    try{await sendInquiry({data:{kind:"contact",requestId,...values}});setSent(true);}catch(e){setError(e instanceof Error?e.message:"Submission did not save. Please retry.");}finally{setBusy(false);}
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">{error?<p role="alert" className="text-maroon">{error}</p>:null}{sent?<p role="status">Saved to the club’s front-office queue. Reference: {requestId}</p>:null}
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
      <Button type="submit" disabled={busy||sent} variant="primary" className="w-full sm:w-auto">
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
  const initialAges: readonly string[] = initialSport === "Softball" ? SOFTBALL_AGES : intent === "register" ? TRYOUT_AGES : AGE_GROUPS;
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    age: initialAges.includes(initialAge)
      ? initialAge
      : "",
    parent: "",
    phone: "",
    email: "",
    notes: "",
    sport: initialSport,
    session: initialSport === "Softball" && intent === "register" ? SOFTBALL_TRYOUT_SESSION : "",
  });

  const softball = values.sport === "Softball";
  const ages: readonly string[] = softball ? SOFTBALL_AGES : intent === "register" ? TRYOUT_AGES : AGE_GROUPS;

  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [sent,setSent]=useState(false);const [requestId]=useState(()=>crypto.randomUUID());
  async function onSubmit(event: FormEvent) {
    event.preventDefault();if(busy||sent)return;setBusy(true);setError("");
    try{await sendInquiry({data:{kind:intent==="register"?"tryout":"team-inquiry",requestId,...values,sport:values.sport as "Baseball"|"Softball"}});setSent(true);}catch(e){setError(e instanceof Error?e.message:"Submission did not save. Please retry.");}finally{setBusy(false);}
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">{error?<p role="alert" className="text-maroon">{error}</p>:null}{sent?<p role="status">Saved to the club’s front-office queue. {softball && intent === "register" ? "Softball tryout dates and times are to be announced. Prospects will contact you with details. " : ""}Reference: {requestId}</p>:null}
      <label className="text-sm font-semibold">
        Sport <span className="text-maroon">*</span>
        <select required className={fieldClass} value={values.sport}
          onChange={(e) => {
            const sport = e.target.value;
            const nextAges: readonly string[] = sport === "Softball" ? SOFTBALL_AGES : intent === "register" ? TRYOUT_AGES : AGE_GROUPS;
            setValues((v) => ({ ...v, sport, age: nextAges.includes(v.age) ? v.age : "", session: sport === "Softball" && intent === "register" ? SOFTBALL_TRYOUT_SESSION : "" }));
          }}>
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
            value={values.age}
            onChange={(e) => setValues((v) => ({ ...v, age: e.target.value, session: softball && intent === "register" ? SOFTBALL_TRYOUT_SESSION : "" }))}
          >
            <option value="">Select age group</option>
            {ages.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        {intent === "register" && softball ? (
          <p className="rounded-md border border-powder bg-paper p-4 text-sm">
            <strong>Softball tryout dates and times to be announced.</strong> Register now for {SOFTBALL_AGES.join(", ")}. Prospects will contact you with tryout details. This does not reserve a November baseball session.
          </p>
        ) : intent === "register" ? (
          <label className="text-sm font-semibold">
            Session <span className="text-maroon">*</span>
            <select
              required
              className={fieldClass}
              value={values.session}
              onChange={(e) => {
                const session = e.target.value;
                const match = BASEBALL_TRYOUT_SESSIONS.find((row) => row.value === session);
                setValues((v) => ({
                  ...v,
                  session,
                  age: match?.age || v.age,
                }));
              }}
            >
              <option value="">Pick a session</option>
              {BASEBALL_TRYOUT_SESSIONS.filter((row) => !values.age || row.age === values.age).map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
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
      <Button type="submit" disabled={busy||sent} variant="primary" className="w-full sm:w-auto">
        Submit {intent === "register" ? "tryout registration" : "team inquiry"}
      </Button>
    </form>
  );
}
