import { Phone } from "lucide-react";
import { PEOPLE } from "@/lib/club";

export function PeopleCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PEOPLE.map((person) => (
        <a
          key={person.tel}
          href={person.href}
          aria-label={`${person.action} at ${person.phoneDisplay}`}
          className="flex min-h-20 items-center gap-3 rounded-xl bg-paper-2 px-4 py-3 no-underline shadow-border"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-paper text-maroon">
            <Phone className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-display text-xl uppercase">
              {person.name}
            </span>
            <span className="block text-sm text-muted">{person.role}</span>
            <span className="mt-1 block text-sm font-semibold text-ink">
              {person.action} · {person.phoneDisplay}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
