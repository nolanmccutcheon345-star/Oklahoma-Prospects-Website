import { FIRST_VISIT } from "@/lib/club";

export function VisitChecklist() {
  return (
    <ol className="grid gap-3">
      {FIRST_VISIT.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-4 rounded-2xl bg-paper-2 p-4 shadow-border"
        >
          <span className="font-display text-3xl font-extrabold text-maroon">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>
            <span className="block font-display text-xl uppercase">
              {step.title}
            </span>
            <span className="mt-1 block text-sm text-muted">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
