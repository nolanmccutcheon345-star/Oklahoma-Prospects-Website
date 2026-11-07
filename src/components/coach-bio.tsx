import { useId, useState, type ReactNode } from "react";

export function CoachBio({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (
    !children ||
    (typeof children === "string" &&
      children
        .split(/\n+/)
        .every(
          (line) => !line.trim() || /^(na|n\/a|none|bio coming soon\.?|tbd)$/i.test(line.trim()),
        ))
  )
    return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="min-h-11 rounded-md border border-line px-4 py-2 text-sm font-semibold text-maroon"
      >
        Bio <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id={id} hidden={!open} className="mt-3 whitespace-pre-line">
        {children || "Bio coming soon."}
      </div>
    </div>
  );
}
