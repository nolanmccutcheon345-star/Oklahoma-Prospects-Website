import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CoachBio } from "./coach-bio";
import type { PublicPerson } from "@/lib/person-contracts";
export function PeopleDirectory({
  people,
  kind,
}: {
  people: PublicPerson[];
  kind: "coaches" | "instructors";
}) {
  const [sport, setSport] = useState("all");
  const rows = people.filter((p) => (kind === "coaches" ? p.teams.length : p.instructor));
  const visible = rows.filter(
    (p) =>
      sport === "all" ||
      p.sports.includes(sport as "baseball" | "softball") ||
      p.teams.some((t) => t.sport === sport),
  );
  return (
    <section
      className="mx-auto max-w-5xl px-5 py-8"
      aria-label={kind === "coaches" ? "Team coaches" : "Lesson instructors"}
    >
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by sport">
        {["all", "baseball", "softball"].map((s) => (
          <button
            key={s}
            aria-pressed={sport === s}
            className={`min-h-11 rounded-full border px-5 capitalize ${sport === s ? "bg-navy text-white" : "bg-white"}`}
            onClick={() => setSport(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {visible.map((p) => (
          <article key={p.id} className="flex flex-col rounded-xl border border-line bg-white p-5">
            <div className="mb-4 flex h-48 items-center justify-center overflow-hidden rounded-lg bg-paper-2">
              {p.photo ? (
                <img src={p.photo} alt={p.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-5xl font-semibold text-navy" aria-hidden="true">
                  {p.name
                    .replace(/^Coach\s+/i, "")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </span>
              )}
            </div>
            <h2 className="text-3xl">{p.name}</h2>
            <p className="mt-2 font-semibold">
              {kind === "instructors"
                ? "Lesson Instructor"
                : [...new Set(p.teams.map((t) => t.role))].join(" · ")}
            </p>
            <p className="mt-1 capitalize text-muted">
              {[...new Set([...p.sports, ...p.teams.map((t) => t.sport)])].join(" · ")}
            </p>
            {kind === "instructors" && (
              <>
                <p className="mt-3">{p.specialties.join(" · ")}</p>
                {p.ages && <p className="mt-1 text-sm">Ages & experience: {p.ages}</p>}
              </>
            )}
            {p.teams.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xl">Coaching assignments</h3>
                {p.teams.map((t) => (
                  <div key={t.id} className="mt-2">
                    <Link
                      to="/teams/$teamId"
                      params={{ teamId: t.id }}
                      className="font-semibold underline"
                    >
                      {t.name}
                    </Link>
                    <p className="text-sm">{t.role}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.seasons.map((s) => (
                        <span className="rounded bg-paper-2 px-2 py-1 text-xs" key={s}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <CoachBio>
                {[p.bio, p.approach, p.ages, p.achievements, p.welcome]
                  .filter(Boolean)
                  .join("\n\n")}
              </CoachBio>
            </div>
            {p.bookable && (
              <a
                href={`/training?instructor=${encodeURIComponent(p.coachId)}`}
                className="mt-5 flex min-h-12 items-center justify-center rounded-lg bg-maroon px-4 py-3 font-semibold text-white"
              >
                Book a Lesson
              </a>
            )}
            {kind === "instructors" && !p.bookable && (
              <p className="mt-4 text-sm text-muted">
                Online lesson availability has not been published.{" "}
                <Link to="/contact" className="underline">
                  Contact the office
                </Link>{" "}
                for options.
              </p>
            )}
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="rounded-xl border p-5">
          No published {kind} match this view.{" "}
          <Link to="/contact" className="underline">
            Contact the office
          </Link>{" "}
          for help.
        </p>
      )}
    </section>
  );
}
