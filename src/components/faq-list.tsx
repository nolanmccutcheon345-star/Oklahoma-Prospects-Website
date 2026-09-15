import { FAQ } from "@/lib/club";

export function FaqList({ tone = "light" }: { tone?: "light" | "dark" }) {
  const muted = tone === "dark" ? "text-fg-soft" : "text-muted";
  const line = tone === "dark" ? "divide-fg-inverse/10" : "divide-line";

  return (
    <div className={`divide-y ${line}`}>
      {FAQ.map((item) => (
        <details key={item.q} className="group py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {item.q}
            <span className="text-maroon group-open:hidden">+</span>
            <span className="hidden text-maroon group-open:inline">–</span>
          </summary>
          <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
