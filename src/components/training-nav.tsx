export function TrainingNav({ current }: { current: "lessons" | "instructors" | "plans" }) {
  return (
    <nav aria-label="Training" className="mx-auto grid max-w-3xl grid-cols-3 gap-2 px-5 pt-5">
      {(
        [
          { id: "lessons", label: "Lessons", href: "/training" },
          { id: "instructors", label: "Instructors", href: "/instructors" },
          { id: "plans", label: "Training Plans", href: "/training?view=plans" },
        ] as const
      ).map((t) => (
        <a
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? "page" : undefined}
          className={`flex min-h-12 items-center justify-center rounded-lg border px-2 py-2 text-center text-sm font-semibold ${current === t.id ? "border-maroon bg-maroon text-white" : "border-line bg-white"}`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
