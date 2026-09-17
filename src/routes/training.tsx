import {pageHead} from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { type LessonService } from "@/lib/catalog";
import { getCheckoutContext } from "@/lib/commerce/api";
import { MEMBERSHIP_RULES, OP_LEVELS } from "@/lib/pd";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { PdErrorBoundary } from "@/components/pd/error-boundary";

export const Route = createFileRoute("/training")({head:()=>pageHead("/training","Train & Player Development","Assessments, private coaching, packages, and monthly development at Oklahoma Prospects.",false), component: TrainingPage });

function TrainingPage() {
  return (
    <main id="main">
      <PdErrorBoundary section="Train · catalog">
        <PageHero
        eyebrow="Player development"
        title="Monthly coaching."
        accent="That’s how the game moves."
        copy="Four coached sessions a month, a plan, and tracking. Baseball and softball, ages 8 through college. Cage passes live on Book."
        image="/brand/training.jpg"
        actions={
          <>
            <Button asChild>
              <a href="#memberships">Start a monthly plan</a>
            </Button>
            <SignedOut>
              <Button asChild variant="outline">
                <Link to="/login" search={{ next: "/account" }}>
                  Member sign in
                </Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild variant="outline">
                <Link to="/account">Open my development</Link>
              </Button>
            </SignedIn>
          </>
        }
      />
      <CatalogAndBook />
      </PdErrorBoundary>
    </main>
  );
}

function CatalogAndBook() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const catalog = useLiveCatalog();
  const [hasAssessment, setHasAssessment] = useState(false);
  const [lessonId, setLessonId] = useState<string>("");
  const [athletes, setAthletes] = useState<{id:string;name:string;assessmentComplete:boolean}[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const lessons = catalog.lessons;
  const selectedId = lessonId && lessons.some((item) => item.id === lessonId) ? lessonId : lessons[0]?.id;

  useEffect(() => {
    if (!user) { setHasAssessment(false); setAthletes([]); return; }
    getCheckoutContext()
      .then(value => { setAthletes(value.athletes); const athlete = value.athletes.find(a => a.id === athleteId) || (value.athletes.length === 1 ? value.athletes[0] : undefined); setHasAssessment(athlete?.assessmentComplete === true); if (athlete) setAthleteId(athlete.id); })
      .catch(() => setHasAssessment(false));
  }, [user?.id, athleteId]);

  const groups = ["Pitching", "Hitting", "Catching", "Fielding"] as const;
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {athletes.length > 0 ? <label className="mb-6 grid gap-2">Athlete<select value={athleteId} onChange={e=>setAthleteId(e.target.value)} className="min-h-11 rounded-lg border p-3"><option value="">Select an athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.assessmentComplete ? " · assessment completed" : " · assessment needed"}</option>)}</select></label> : null}
      <section id="memberships" className="scroll-mt-24">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          How serious families train
        </p>
        <h2 className="mt-2 text-3xl">Monthly development</h2>
        <p className="mt-2 text-sm text-muted">
          Four coached sessions a month, a written plan, and tracking. First month
          adds $50 if there is no assessment on file.
        </p>
        <div className="mt-4 grid gap-3">
          {catalog.memberships.map((plan) => {
            const featured = plan.id === "m2" || plan.tier === "performance";
            const firstMonth =
              !hasAssessment
                ? plan.price + 50
                : plan.price;
            return (
              <article
                key={plan.id}
                className={
                  featured
                    ? "rounded-2xl bg-maroon p-5 text-fg-inverse"
                    : "rounded-2xl bg-paper-2 p-5 shadow-border"
                }
              >
                {featured ? (
                  <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
                    Core monthly plan
                  </p>
                ) : null}
                <h3 className="mt-1 font-display text-2xl uppercase">{plan.name}</h3>
                <p className={featured ? "mt-1 text-sm text-fg-soft" : "mt-1 text-sm text-muted"}>
                  {plan.detail}
                </p>
                <p className="mt-3 pd-num font-display text-3xl">
                  ${plan.price}
                  <span className="ml-1 font-sans text-base font-medium opacity-80">/mo</span>
                </p>
                {firstMonth !== plan.price ? (
                  <p className={`mt-1 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>
                    First month ${firstMonth} without an assessment on file, then ${plan.price}.
                  </p>
                ) : null}
                <ul className={`mt-2 list-disc pl-5 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>
                  {plan.includes.filter(line => !/^Four (30|60)-minute sessions$/.test(line)).slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <Button asChild className="mt-4" variant={featured ? "outline" : "primary"}>
                  <Link
                    to="/pay"
                    search={{ kind: "membership", id: plan.id }}
                  >
                    Start {plan.name}
                  </Link>
                </Button>
                <a className="ml-4 inline-flex min-h-11 items-center underline" href={`/contact?subject=${encodeURIComponent(plan.name)}`}>Ask about this plan</a>
              </article>
            );
          })}
        </div>
        <ul className="mt-6 grid gap-2 text-sm text-muted">
          {MEMBERSHIP_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <h2 className="mt-12 text-3xl">Session packages</h2>
      <p className="mt-2 text-sm text-muted">
        A block of lessons after assessment completion. Monthly development includes a written plan, athlete profile, progress tracking, and one-session rollover.
      </p>
      <div className="mt-4 grid gap-3">
        {catalog.packages.map((pack) => (
          <article key={pack.id} className="rounded-2xl bg-paper-2 p-5 shadow-border">
            <h3 className="font-display text-2xl uppercase">{pack.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {pack.credits} credits · {pack.minutes} min · expires in {pack.expiresDays} days
            </p>
            <p className="mt-3 pd-num font-display text-3xl">${pack.price}</p>
            {!hasAssessment ? <Button disabled className="mt-4">Locked until assessment completion</Button> : <Button asChild className="mt-4">
              <Link to="/pay" search={{ kind: "package", id: pack.id }}>
                Buy {pack.credits} sessions · ${pack.price}
              </Link>
            </Button>}
            <a className="ml-4 inline-flex min-h-11 items-center underline" href={`/contact?subject=${encodeURIComponent(pack.name)}`}>Ask about this package</a>
          </article>
        ))}
      </div>

      <h2 className="mt-12 text-3xl">Single sessions</h2>
      <p className="mt-2 mb-8 text-sm text-muted">
        Ordinary lessons and packages remain locked until your coach records your assessment as completed. Assessments are available now; paying for one does not complete it.
      </p>

      {groups.map((group) => {
        const items = lessons.filter((item) => item.discipline === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="mb-10">
            <h2 className="text-3xl">{group}</h2>
            <div className="mt-4 grid gap-2">
              {items.map((item) => (
                <ServiceCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  locked={!hasAssessment && item.requiresAssessment}
                  onSelect={() => {
                    setLessonId(item.id);
                    void navigate({ to: "/pay", search: { kind: item.id === "s6" ? "membership" : "lesson", id: item.id === "s6" ? "m4" : item.id } });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      <h2 className="mt-12 text-3xl">Pitching ladder · OP-1 through OP-7</h2>
      <p className="mt-2 text-sm text-muted">
        The pitching development ladder. Coaches use evidence from completed sessions to advance each athlete.
      </p>
      <ol className="mt-4 grid gap-2">
        {OP_LEVELS.map((level) => (
          <li key={level.code} className="rounded-xl bg-paper-2 px-4 py-3 shadow-border">
            <span className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {level.code} · {level.ages}
            </span>
            <span className="mt-1 block font-display text-xl uppercase">{level.name}</span>
            <span className="block text-sm text-muted">{level.goal}</span>
          </li>
        ))}
      </ol>

      <section className="mt-12 rounded-2xl bg-ink p-5 text-fg-inverse">
        <h2 className="text-2xl">Need lane time without a coach?</h2>
        <p className="mt-2 text-sm text-fg-soft">
          Household cage passes and drop-in hours live on Book. This page is coaching.
        </p>
        <Button asChild className="mt-4">
          <Link to="/book">Book a cage</Link>
        </Button>
      </section>
    </div>
  );
}

function ServiceCard({
  item,
  selected,
  locked,
  onSelect,
}: {
  item: LessonService;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const due = item.price;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked}
      aria-pressed={selected}
      className={cn(
        "rounded-xl px-4 py-3 text-left shadow-border disabled:opacity-60",
        selected ? "bg-maroon text-fg-inverse" : "bg-paper-2",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xl uppercase">{item.name}</span>
        <span className="pd-num font-display text-2xl">${due}</span>
      </span>
      <span className="mt-1 block text-sm opacity-80">
        {item.minutes} min · {item.purpose}
      </span>
      {locked ? (
        <span className="mt-1 block text-xs font-semibold tracking-widest uppercase">
          Locked until assessment completion
        </span>
      ) : null}
    </button>
  );
}

