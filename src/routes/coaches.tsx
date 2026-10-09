import { CLUB } from "@/lib/club";
import type { ReactNode } from "react";
import { getPublicStaff } from "@/lib/staff-directory-api";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicCoaches } from "@/lib/coaching-api";
import { getPublicTeamCoaches } from "@/lib/team-coach-directory-api";
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
    const [coaches, staff, teamCoaches] = await Promise.all([getPublicCoaches(), getPublicStaff(), getPublicTeamCoaches()]);
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
type AssignedTeam = { id: string; name: string; sport: "baseball" | "softball"; age: string };
const coachKey = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
function TeamsCoached({ teams }: { teams: readonly AssignedTeam[] }) {
  if (!teams.length) return null;
  return <div className="mt-2 text-sm text-muted">
    <span className="font-semibold text-ink">Teams coached: </span>
    {teams.map((team, i) => <span key={team.id}>{i ? " · " : ""}<Link to="/teams" className="underline underline-offset-2">{team.name}</Link> ({team.sport === "baseball" ? "Baseball" : "Softball"}{team.age ? ` · ${team.age}` : ""})</span>)}
  </div>;
}
function CoachBio({ children }: { children: ReactNode }) {
  return <details className="mt-4 rounded-lg border border-line bg-paper-2">
    <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-semibold text-maroon focus-visible:outline-offset-[-3px]">Bio</summary>
    <div className="grid gap-3 border-t border-line px-4 py-4">{children}</div>
  </details>;
}
function Coaches() {
  const { coaches: rows, staff, teamCoaches } = Route.useLoaderData();
  // Public team assignments are maintained in Front Office and never expose
  // the private coach sign-in email or a team's roster.
  const teamByName = new Map<string, AssignedTeam[]>();
  for (const coach of teamCoaches) {
    const key = coachKey(coach.name);
    const list = teamByName.get(key) ?? [];
    for (const team of coach.teams)
      if (!list.some(t => t.id === team.id)) list.push(team);
    teamByName.set(key, list);
  }
  const shownNames = new Set(staff.map(person => coachKey(person.name)));
  const additionalTeamCoaches = teamCoaches.filter(person =>
    !shownNames.has(coachKey(person.name)) &&
    !rows.some(row => coachKey(row.profile.name) === coachKey(person.name))
  );
  const visibleLessonCoaches = rows.filter(row => !shownNames.has(coachKey(row.profile.name)));
  return (
    <main id="main">
      <PageHero
        eyebrow={CLUB.name}
        title="Coaches & staff."
        copy={`Meet the people helping your family train, find a team and grow with ${CLUB.name}.`}
        compact
      />
      <section aria-label="Program staff" className="mx-auto grid max-w-3xl gap-5 px-5 pt-8">
        {staff.map(person => {
          const assigned = teamByName.get(coachKey(person.name)) ?? [];
          return <article key={person.id} className="rounded-xl border p-5">
            <p className="text-sm font-semibold text-maroon">{person.program}</p>
            <h2 className="mt-1 text-3xl">{person.name}</h2>
            <p className="mt-2 font-semibold">{person.title}</p>
            <TeamsCoached teams={assigned} />
            <CoachBio>
              {person.bio ? <p className="whitespace-pre-line">{person.bio}</p> : <p>Biography coming soon.</p>}
              {person.email ? <a className="inline-flex min-h-11 items-center break-all underline" href={`mailto:${person.email}`}>{person.email}</a> : null}
              {person.phone ? <a className="inline-flex min-h-11 items-center underline" href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>{person.phone}</a> : null}
            </CoachBio>
          </article>;
        })}
      </section>
      {additionalTeamCoaches.length > 0 ? <section aria-label="Team coaches" className="mx-auto grid max-w-3xl gap-5 px-5 pt-8">
        <h2 className="text-2xl font-semibold">Team coaches</h2>
        {additionalTeamCoaches.map(person => <article key={coachKey(person.name)} className="rounded-xl border p-5">
          {person.photo && <img src={person.photo} alt={person.name} className="mb-3 h-32 w-32 rounded-lg object-cover" />}
          <h3 className="text-2xl font-semibold">{person.name}</h3>
          <TeamsCoached teams={person.teams} />
          <CoachBio><p className="whitespace-pre-line">{person.bio || "Biography coming soon."}</p></CoachBio>
        </article>)}
      </section> : null}
      <section aria-label="Coaching instructors" className="mx-auto grid max-w-3xl gap-5 px-5 py-8">
        {visibleLessonCoaches.length ? (
          visibleLessonCoaches.map(({ id, profile: p, teams }) => {
            const assigned = [...teams];
            for (const team of teamByName.get(coachKey(p.name)) ?? [])
              if (!assigned.some(current => current.id === team.id)) assigned.push(team);
            const background = [
              ["Career & background", p.career],
              ["Approach", p.approach],
              ["Athletes I work with", p.ages],
              ["Accomplishments", p.achievements],
              ["Welcome", p.welcome],
            ].filter(([, value]) => Boolean(value));
            return <article key={id} className="rounded-xl border p-5">
              <h2 className="text-3xl">{p.name}</h2>
              <p className="mt-2 font-semibold">{p.specialties.join(" · ")}</p>
              <TeamsCoached teams={assigned} />
              <CoachBio>
                {background.length ? background.map(([label, value]) => <section key={label}>
                  <h3 className="font-semibold">{label}</h3>
                  <p className="mt-1 whitespace-pre-line">{value}</p>
                </section>) : <p>Biography coming soon.</p>}
              </CoachBio>
              <Link to="/training" className="mt-4 inline-flex min-h-11 items-center underline">
                Find lessons and assessments
              </Link>
            </article>;
          })
        ) : additionalTeamCoaches.length > 0 || staff.length > 0 ? null : (
          <p>Coach profiles are being prepared. <Link to="/contact" className="underline">Ask the desk about instructors.</Link></p>
        )}
      </section>
    </main>
  );
}
