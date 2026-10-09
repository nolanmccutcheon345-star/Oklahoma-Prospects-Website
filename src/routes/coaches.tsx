import { useState } from "react";
import { CoachBio } from "@/components/coach-bio";
import { CLUB } from "@/lib/club";
import { getPublicStaff } from "@/lib/staff-directory-api";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicCoaches } from "@/lib/coaching-api";
import { getPublicTeamsView } from "@/lib/teams/public-api";
import { PageHero } from "@/components/page-hero";
export const Route = createFileRoute("/coaches")({
  head: () =>
    pageHead(
      "/coaches",
      "Coaches & Staff",
      `Meet ${CLUB.name} instructors, coordinators and recruiting staff.`,
      false,
    ),
  loader: async () => {
    const [coaches, staff, teamCoaches] = await Promise.all([
      getPublicCoaches(),
      getPublicStaff(),
      getPublicTeamsView(),
    ]);
    return { coaches, staff, teamCoaches };
  },
  component: Coaches,
  errorComponent: () => (
    <main id="main" className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-4xl">Coaches & staff</h1>
      <p>Staff profiles could not load. Please try again.</p>
      <Link to="/contact" className="underline">
        Contact
      </Link>
    </main>
  ),
});
function Coaches() {
  const { coaches: rows, staff, teamCoaches: teams } = Route.useLoaderData();
  const [sport, setSport] = useState("All");
  type Assignment = { id: string; name: string; sport: string; role: string; seasons: string[] };
  type Card = {
    name: string;
    title: string;
    bio: string;
    photo?: string;
    email?: string;
    phone?: string;
    sports: string[];
    teams: Assignment[];
    lessons?: boolean;
  };
  const cards = new Map<string, Card>();
  const key = (name: string) => name.trim().toLowerCase();
  for (const person of staff)
    cards.set(key(person.name), {
      name: person.name,
      title: person.title,
      bio: person.bio,
      email: person.email,
      phone: person.phone,
      teams: [],
      sports: /baseball|softball/i.test(person.program) ? [person.program] : [],
    });
  for (const { profile: p, bookable } of rows) {
    const existing = cards.get(key(p.name));
    cards.set(key(p.name), {
      ...existing,
      name: p.name,
      title: existing?.title || "Instructor",
      bio: [p.career, p.approach, p.ages, p.achievements, p.welcome].filter(Boolean).join("\n\n"),
      teams: existing?.teams || [],
      sports: existing?.sports || [],
      lessons: bookable,
    });
  }
  for (const team of teams)
    for (const person of team.coaches) {
      const existing = cards.get(key(person.name));
      const assignments = [
        ...(existing?.teams || []),
        {
          id: team.id,
          name: team.name,
          sport: team.sport,
          role: person.role,
          seasons: team.seasons,
        },
      ];
      cards.set(key(person.name), {
        ...existing,
        name: person.name,
        title: existing?.title || person.role,
        bio: person.bio || existing?.bio || "",
        photo: person.photo || existing?.photo,
        teams: assignments,
        sports: [...new Set([...(existing?.sports || []), team.sport])],
      });
    }
  const visible = [...cards.values()].filter(
    (p) => sport === "All" || p.sports.some((s) => s.toLowerCase().includes(sport.toLowerCase())),
  );
  return (
    <main id="main">
      <PageHero
        eyebrow={CLUB.name}
        title="Meet our coaches."
        copy="Meet the coaches guiding our athletes’ development and leading our baseball and softball teams."
        compact
      />
      <section aria-label="Coaches and staff" className="mx-auto max-w-5xl px-5 py-8">
        {cards.size >= 6 && (
          <div
            role="group"
            aria-label="Filter coaches by sport"
            className="mb-6 flex flex-wrap gap-2"
          >
            {["All", "Baseball", "Softball"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={sport === value}
                className={
                  "min-h-11 rounded-full border px-5 font-semibold " +
                  (sport === value ? "bg-navy text-white" : "bg-paper")
                }
                onClick={() => setSport(value)}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map((person) => (
            <article
              key={key(person.name)}
              className="flex flex-col rounded-xl border bg-paper p-5"
            >
              <div className="mb-4 flex h-48 items-center justify-center overflow-hidden rounded-lg bg-paper-2">
                {person.photo ? (
                  <img
                    src={person.photo}
                    alt={person.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span aria-hidden="true" className="text-5xl font-semibold text-navy">
                    {person.name
                      .replace(/^Coach\s+/i, "")
                      .split(/\s+/)
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                )}
              </div>
              <h2 className="text-3xl">{person.name}</h2>
              <p className="mt-2 font-semibold">{person.title}</p>
              <p className="mt-1 capitalize text-muted">
                {[...new Set(person.sports.map((s) => s.toLowerCase()))].join(" · ") ||
                  "Sport assignments to be confirmed"}
              </p>
              {person.teams.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold">Coaching assignments</h3>
                  <ul className="mt-2 grid gap-3">
                    {person.teams.map((team) => (
                      <li key={team.id}>
                        <a
                          className="inline-flex min-h-11 items-center font-semibold underline"
                          href={"/teams/" + encodeURIComponent(team.id)}
                        >
                          {team.name}
                        </a>
                        <p className="text-sm capitalize">{team.role}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {team.seasons.map((season) => (
                            <span
                              key={season}
                              className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold"
                            >
                              {season}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <CoachBio>{person.bio}</CoachBio>
              <div className="mt-auto flex flex-wrap gap-3 pt-4">
                {person.email && (
                  <a
                    className="inline-flex min-h-11 items-center break-all underline"
                    href={`mailto:${person.email}`}
                  >
                    {person.email}
                  </a>
                )}
                {person.phone && (
                  <a
                    className="inline-flex min-h-11 items-center underline"
                    href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}
                  >
                    {person.phone}
                  </a>
                )}
                {person.lessons && (
                  <Link
                    to="/training"
                    className="inline-flex min-h-11 items-center font-semibold underline"
                  >
                    Find lessons and assessments
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <p>
            No coach profiles match this view.{" "}
            <Link to="/contact" className="underline">
              Ask the desk about instructors.
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
