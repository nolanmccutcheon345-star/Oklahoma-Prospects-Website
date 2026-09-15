import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { PeopleCards } from "@/components/people";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/recruiting")({head:()=>pageHead("/recruiting","Recruiting","Learn about Oklahoma Prospects recruiting support and player development.",false),
  component: RecruitingPage,
});

function RecruitingPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Development"
        title="Start with"
        accent="where they are."
        copy="We do not publish other programs’ alumni. A conversation with a Prospects coach is the next honest step."
        actions={
          <>
            <Button asChild>
              <Link to="/contact">Talk with Prospects</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/tryouts">Free Spring tryout</Link>
            </Button>
          </>
        }
      />

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Bring this to the conversation</h2>
        <ol className="mt-6 divide-y divide-line">
          {[
            {
              n: "01",
              title: "Player basics",
              body: "Age group, positions, current team, and what they want next.",
            },
            {
              n: "02",
              title: "Current work",
              body: "Recent game or training video if you have it. No video is fine — start with an assessment or tryout.",
            },
            {
              n: "03",
              title: "Ask the next step",
              body: "The right evaluation, the right lesson plan, or a reserved cage hour. We will tell you which one it is.",
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-5 py-6">
              <span className="font-display text-5xl font-extrabold text-maroon">
                {step.n}
              </span>
              <div>
                <h3 className="text-3xl">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Who to text</h2>
          <div className="mt-5">
            <PeopleCards />
          </div>
        </div>
      </section>
    </main>
  );
}
