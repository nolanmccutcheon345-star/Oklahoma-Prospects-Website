import { useState, type FormEvent } from "react";
import {sendInquiry} from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { AGE_GROUPS, TRYOUT_AGES, TRYOUT_DAYS } from "@/lib/club";
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

export function ContactForm() {
  const [values, setValues] = useState<ContactValues>({
    name: "",
    email: "",
    phone: "",
    message: "",
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

const TRYOUT_SESSIONS = TRYOUT_DAYS.flatMap((day) =>
  day.sessions.map((session) => ({
    value: `${day.weekday} ${day.date} · ${session.age} · ${session.time}`,
    age: session.age,
    label: `${session.age} · ${day.weekday} ${session.time}`,
  })),
);

export function TryoutForm({
  initialAge = "",
  intent = "register",
}: {
  initialAge?: string;
  intent?: "register" | "inquiry";
}) {
  const ages = intent === "register" ? TRYOUT_AGES : AGE_GROUPS;
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    age: ages.includes(initialAge as (typeof TRYOUT_AGES)[number]) || AGE_GROUPS.includes(initialAge as (typeof AGE_GROUPS)[number])
      ? initialAge
      : "",
    parent: "",
    phone: "",
    email: "",
    notes: "",
    sport: "",
    session: "",
  });

  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [sent,setSent]=useState(false);const [requestId]=useState(()=>crypto.randomUUID());
  async function onSubmit(event: FormEvent) {
    event.preventDefault();if(busy||sent)return;setBusy(true);setError("");
    try{await sendInquiry({data:{kind:intent==="register"?"tryout":"team-inquiry",requestId,...values,sport:values.sport as "Baseball"|"Softball"}});setSent(true);}catch(e){setError(e instanceof Error?e.message:"Submission did not save. Please retry.");}finally{setBusy(false);}
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">{error?<p role="alert" className="text-maroon">{error}</p>:null}{sent?<p role="status">Saved to the club’s front-office queue. Reference: {requestId}</p>:null}
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
            onChange={(e) => setValues((v) => ({ ...v, age: e.target.value }))}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Sport <span className="text-maroon">*</span>
          <select
            required
            className={fieldClass}
            value={values.sport}
            onChange={(e) => setValues((v) => ({ ...v, sport: e.target.value }))}
          >
            <option value="">Baseball or softball</option>
            <option value="Baseball">Baseball</option>
            <option value="Softball">Softball</option>
          </select>
        </label>
        {intent === "register" ? (
          <label className="text-sm font-semibold">
            Session <span className="text-maroon">*</span>
            <select
              required
              className={fieldClass}
              value={values.session}
              onChange={(e) => {
                const session = e.target.value;
                const match = TRYOUT_SESSIONS.find((row) => row.value === session);
                setValues((v) => ({
                  ...v,
                  session,
                  age: match?.age || v.age,
                }));
              }}
            >
              <option value="">Pick a session</option>
              {TRYOUT_SESSIONS.filter((row) => !values.age || row.age === values.age).map((row) => (
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
