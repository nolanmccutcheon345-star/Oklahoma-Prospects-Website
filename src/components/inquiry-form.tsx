import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AGE_GROUPS, CLUB } from "@/lib/club";
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
};

function persist(key: string, payload: unknown) {
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
    localStorage.setItem(key, JSON.stringify([payload, ...prev].slice(0, 12)));
  } catch {
    /* ignore quota */
  }
}

export function ContactForm() {
  const [values, setValues] = useState<ContactValues>({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    persist("prospects-contact", { ...values, at: Date.now() });
    const subject = encodeURIComponent(`Prospects inquiry from ${values.name}`);
    const body = encodeURIComponent(
      `Name: ${values.name}\nEmail: ${values.email}\nPhone: ${values.phone}\n\n${values.message}`,
    );
    toast.success("Opening email to send this to Prospects.");
    window.location.href = `mailto:${CLUB.email}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
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
      <Button type="submit" variant="primary" className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}

export function TryoutForm() {
  const [values, setValues] = useState<TryoutValues>({
    player: "",
    age: "",
    parent: "",
    phone: "",
    email: "",
    notes: "",
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    persist("prospects-tryout", { ...values, at: Date.now() });
    const subject = encodeURIComponent(
      `Team inquiry — ${values.player} (${values.age})`,
    );
    const body = encodeURIComponent(
      `Player: ${values.player}\nAge group: ${values.age}\nParent / Guardian: ${values.parent}\nPhone: ${values.phone}\nEmail: ${values.email}\n\nNotes:\n${values.notes}`,
    );
    toast.success("Opening email to send this tryout request.");
    window.location.href = `mailto:${CLUB.email}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
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
            {AGE_GROUPS.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </label>
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
      <Button type="submit" variant="primary" className="w-full sm:w-auto">
        Submit tryout request
      </Button>
    </form>
  );
}
