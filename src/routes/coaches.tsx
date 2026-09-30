import { getPublicStaff } from "@/lib/staff-directory-api";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicCoaches } from "@/lib/coaching-api";
import { PageHero } from "@/components/page-hero";
export const Route = createFileRoute("/coaches")({
  head: () =>
    pageHead(
      "/coaches",
      "Coaches & Staff",
      "Meet Oklahoma Prospects instructors, coordinators and recruiting staff.",
      false,
    ),
  loader: async () => {
    const [coaches, staff] = await Promise.all([getPublicCoaches(), getPublicStaff()]);
    return { coaches, staff };
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
  const { coaches: rows, staff } = Route.useLoaderData();
  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects"
        title="Coaches & staff."
        copy="Meet the people helping your family train, find a team and grow with Oklahoma Prospects."
        compact
      />
      <section aria-label="Program staff" className="mx-auto grid max-w-3xl gap-5 px-5 pt-8">
        {staff.map((person) => (
          <article key={person.id} className="rounded-xl border p-5">
            <p className="text-sm font-semibold text-maroon">{person.program}</p>
            <h2 className="mt-1 text-3xl">{person.name}</h2>
            <p className="mt-2 font-semibold">{person.title}</p>
            {person.bio && <p className="mt-3 whitespace-pre-line">{person.bio}</p>}
            <div className="mt-4 flex flex-col items-start gap-2">
              <a
                className="inline-flex min-h-11 items-center break-all underline"
                href={`mailto:${person.email}`}
              >
                {person.email}
              </a>
              {person.phone && (
                <a
                  className="inline-flex min-h-11 items-center underline"
                  href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}
                >
                  {person.phone}
                </a>
              )}
            </div>
          </article>
        ))}
      </section>
      <section aria-label="Coaching instructors" className="mx-auto grid max-w-3xl gap-5 px-5 py-8">
        {rows.length ? (
          rows.map(({ id, profile: p }) => (
            <article key={id} className="rounded-xl border p-5">
              <h2 className="text-3xl">{p.name}</h2>
              <p className="mt-2 font-semibold">{p.specialties.join(" · ")}</p>
              {[
                ["Career & background", p.career],
                ["Approach", p.approach],
                ["Athletes I work with", p.ages],
                ["Accomplishments", p.achievements],
                ["Welcome", p.welcome],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div className="mt-4" key={label}>
                    <h3 className="text-xl">{label}</h3>
                    <p className="mt-1 whitespace-pre-line">{value}</p>
                  </div>
                ))}
              <Link to="/training" className="mt-4 inline-flex min-h-11 items-center underline">
                Find lessons and assessments
              </Link>
            </article>
          ))
        ) : (
          <p>
            Coach profiles are being prepared.{" "}
            <Link to="/contact" className="underline">
              Ask the desk about instructors.
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
