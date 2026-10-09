import { CoachBio } from "@/components/coach-bio";
import { CLUB } from "@/lib/club";
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
function Coaches() {
  const { coaches: rows, staff, teamCoaches } = Route.useLoaderData();
  type Card = {name:string; title:string; bio:string; photo?:string; email?:string; phone?:string; teams:{id:string;name:string;sport:string;age:string}[]; lessons?:boolean};
  const cards = new Map<string,Card>();
  const key = (name:string) => name.trim().toLowerCase();
  for (const person of staff) cards.set(key(person.name), {
    name:person.name, title:[person.program,person.title].filter(Boolean).join(" · "), bio:person.bio,
    email:person.email,phone:person.phone,teams:[],
  });
  for (const {profile:p,teams} of rows) {
    const existing=cards.get(key(p.name));
    cards.set(key(p.name), {...existing,name:p.name,title:existing?.title || p.specialties.join(" · "),
      bio:[p.career,p.approach,p.ages,p.achievements,p.welcome].filter(Boolean).join("\n\n"),teams,lessons:true});
  }
  for (const person of teamCoaches) {
    const existing=cards.get(key(person.name));
    const teams=[...(existing?.teams || [])];
    for (const t of person.teams) if (!teams.some(prior=>prior.id===t.id)) teams.push(t);
    cards.set(key(person.name), {...existing,name:person.name,title:existing?.title || "Team coach",bio:person.bio || existing?.bio || "",photo:person.photo,teams});
  }
  return <main id="main">
    <PageHero eyebrow={CLUB.name} title="Coaches & staff." copy={`Meet the people helping your family train, find a team and grow with ${CLUB.name}.`} compact />
    <section aria-label="Coaches and staff" className="mx-auto grid max-w-3xl gap-5 px-5 py-8">
      {[...cards.values()].map(person=><article key={key(person.name)} className="rounded-xl border p-5">
        {person.photo && <img src={person.photo} alt={person.name} className="mb-3 h-32 w-32 rounded-lg object-cover" />}
        <h2 className="text-3xl">{person.name}</h2><p className="mt-2 font-semibold">{person.title}</p>
        {person.teams.length > 0 && <div className="mt-3"><h3 className="text-lg font-semibold">Teams coached</h3>
          <ul className="mt-2 grid gap-1">{person.teams.map(team=><li key={team.id}>
            <a className="inline-flex min-h-11 items-center underline" href={"/teams/"+encodeURIComponent(team.id)}>{team.name}</a>
            {" · "}{team.sport === "baseball" ? "Baseball" : "Softball"}{team.age ? " · "+team.age : ""}
          </li>)}</ul></div>}
        <CoachBio>{person.bio}</CoachBio>
        <div className="mt-3 flex flex-wrap gap-3">
          {person.email && <a className="inline-flex min-h-11 items-center break-all underline" href={`mailto:${person.email}`}>{person.email}</a>}
          {person.phone && <a className="inline-flex min-h-11 items-center underline" href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>{person.phone}</a>}
          {person.lessons && <Link to="/training" className="inline-flex min-h-11 items-center underline">Find lessons and assessments</Link>}
        </div>
      </article>)}
      {!cards.size && <p>Coach profiles are being prepared. <Link to="/contact" className="underline">Ask the desk about instructors.</Link></p>}
    </section>
  </main>;
}
