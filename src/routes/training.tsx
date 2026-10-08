import { canPurchase } from "@/lib/purchase-availability";
import { FIRST_MONTH_SETUP_CENTS, formatMoney, formatDollars } from "@/lib/pricing";
import {pageHead} from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { type LessonService } from "@/lib/catalog";
import { getCheckoutContext } from "@/lib/commerce/api";
import { MEMBERSHIP_RULES } from "@/lib/pd";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { PdErrorBoundary } from "@/components/pd/error-boundary";

export const Route = createFileRoute("/training")({head:()=>pageHead("/training","Train & Player Development","Assessments, private coaching, packages, and monthly development at Oklahoma Prospects.",false), component: TrainingPage });

const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

function TrainingPage() {
  // Session resolution can finish before this route hydrates. Keep the server
  // and first client render identical before showing session-specific actions.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrated, serverHydrated);
  return (
    <main id="main">
      <PdErrorBoundary section="Train · catalog">
        <PageHero
        eyebrow="Player development"
        title="Lessons & training."
        compact

        copy="Find private lessons, assessments, and monthly coaching. View current availability or ask the club to help you get started."
        image="/brand/training.jpg"
        actions={
          <>
            <Button asChild>
              <a href="#lessons">Find a Lesson</a>
            </Button>
            <Button asChild variant="outline">
              <a href="#memberships">Monthly Training Plans</a>
            </Button>
            {hydrated && <SignedOut>
              <Button asChild variant="outline">
                <Link to="/login" search={{ next: "/account" }}>
                  Member sign in
                </Link>
              </Button>
            </SignedOut>}
            {hydrated && <SignedIn>
              <Button asChild variant="outline">
                <Link to="/account" search={{ desk: "programs" }}>My assigned programs</Link>
              </Button>
            </SignedIn>}
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
      {!canPurchase(catalog.purchaseAvailability, "lesson", "s1") ? <aside role="status" className="mb-6 rounded-xl border border-line p-4"><h2 className="text-xl">Lesson enrollment by inquiry</h2><p>Online lesson and training-plan purchases are not open yet. Ask about a service below and the club will help you arrange the next step. One-time cage availability is on Book.</p></aside> : null}
      <section id="lessons" className="scroll-mt-40" aria-label="Lesson booking">
      {athletes.length > 0 ? <label className="mb-6 grid gap-2">Athlete<select value={athleteId} onChange={e=>setAthleteId(e.target.value)} className="min-h-11 rounded-lg border p-3"><option value="">Select an athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.assessmentComplete ? " · assessment completed" : " · assessment needed"}</option>)}</select></label> : null}
        <nav aria-label="Lesson disciplines" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {groups.map(group => <Button asChild key={group} variant="outlineDark"><a href={`#lesson-${group.toLowerCase()}`}>{group}</a></Button>)}
        </nav>
        {!hasAssessment ? <aside className="mb-6 rounded-2xl bg-ink p-5 text-fg-inverse">
          <h2 className="text-2xl">Start with an assessment</h2>
          <p className="mt-2 text-base text-fg-soft">New athletes begin with an assessment. Once your coach records it as completed, lessons and packages unlock for that athlete.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {lessons.filter(item => item.id === "s1" || item.id === "s9").map(item => <Button asChild key={item.id} className="h-auto min-h-12 whitespace-normal text-center">{canPurchase(catalog.purchaseAvailability, "lesson", item.id) ? <Link to="/pay" search={{kind: "lesson", id: item.id}}>Book {item.name}</Link> : <Link to="/contact" search={{ subject: item.name }}>Ask about {item.name}</Link>}</Button>)}
          </div>
          <p className="mt-3 text-sm text-fg-soft">Already assessed? Sign in and select your athlete. If their assessment is missing, contact your coach.</p>
        </aside> : <p className="mb-6 text-base">Assessment completed. Choose a lesson below to book your next session.</p>}
      <h2 className="text-3xl">Choose your lesson</h2>
      <p className="mt-2 mb-8 text-sm text-muted">
        Choose a discipline below. Select a service to see instructors and available times.
      </p>

      {groups.map((group) => {
        const items = lessons.filter((item) => item.discipline === group);
        if (items.length === 0) return null;
        return (
          <section key={group} id={`lesson-${group.toLowerCase()}`} className="mb-10 scroll-mt-40">
            <h2 className="text-3xl">{group}</h2>
            <div className="mt-4 grid gap-2">
              {items.map((item) => (
                <ServiceCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  locked={canPurchase(catalog.purchaseAvailability, "lesson", item.id) && !hasAssessment && item.requiresAssessment}
                  inquiry={!canPurchase(catalog.purchaseAvailability, "lesson", item.id)}
                  onSelect={() => {
                    if (!canPurchase(catalog.purchaseAvailability, "lesson", item.id)) { void navigate({ to: "/contact", search: { subject: item.name } }); return; }
                    setLessonId(item.id);
                    void navigate({ to: "/pay", search: { kind: item.id === "s6" ? "membership" : "lesson", id: item.id === "s6" ? "m4" : item.id } });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section id="youth-lessons" className="rounded-xl bg-paper-2 p-5">
        <h2 className="text-2xl">Youth lessons · ages 10 and under</h2>
        <p className="mt-2">Ask about 30- or 60-minute pitching, hitting, catching, and fielding lessons with a youth instructor. The club will confirm eligibility, the assessment requirement, and your price before booking.</p>
        <Button asChild className="mt-3"><Link to="/contact" search={{ subject: "Youth lessons · age 10 and under" }}>Ask about youth lessons</Link></Button>
      </section>
      </section>

      <section id="memberships" className="mt-12 scroll-mt-40">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          How serious families train
        </p>
        <h2 className="mt-2 text-3xl">Monthly development</h2>
        <p className="mt-2 text-sm text-muted">
          In-person plans include four coached sessions per billing month; remote coaching includes video reviews. The first month of an eligible in-person plan
          adds {formatMoney(FIRST_MONTH_SETUP_CENTS)} if there is no assessment on file. The first assessment replaces one of that month’s four coached sessions.
        </p>
        <div className="mt-4 grid gap-3">
          {catalog.memberships.map((plan) => {
            const featured = plan.id === "m2" || plan.tier === "performance";
            const firstMonth =
              !hasAssessment && plan.id !== "m5"
                ? plan.price + FIRST_MONTH_SETUP_CENTS / 100
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
                  {formatDollars(plan.price)}
                  <span className="ml-1 font-sans text-base font-medium opacity-80">/mo</span>
                </p>
                {plan.id === "m5" ? <p className="mt-2 text-sm">A completed assessment is required before remote enrollment.</p> : null}
                {firstMonth !== plan.price ? (
                  <p className={`mt-1 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>
                    First month {formatDollars(firstMonth)} without an assessment on file, then {formatDollars(plan.price)}.
                  </p>
                ) : null}
                <ul className={`mt-2 list-disc pl-5 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>
                  {plan.includes.filter(line => !/^Four (30|60)-minute sessions$/.test(line)).slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <Button asChild className="mt-4" variant={featured ? "outline" : "primary"}>
                  {canPurchase(catalog.purchaseAvailability, "membership", plan.id) && (plan.id !== "m5" || hasAssessment) ? <Link to="/pay" search={{ kind: "membership", id: plan.id }}>Start {plan.name}</Link> : <Link to="/contact" search={{ subject: plan.name }}>Ask about {plan.name}</Link>}
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
            <p className="mt-3 pd-num font-display text-3xl">{formatDollars(pack.price)}</p>
            {!canPurchase(catalog.purchaseAvailability, "package", pack.id) ? <Button asChild className="mt-4"><Link to="/contact" search={{ subject: pack.name }}>Ask about this package</Link></Button> : !hasAssessment ? <Button disabled className="mt-4">Locked until assessment completion</Button> : <Button asChild className="mt-4">
              <Link to="/pay" search={{ kind: "package", id: pack.id }}>
                Buy {pack.credits} sessions · {formatDollars(pack.price)}
              </Link>
            </Button>}
            <a className="ml-4 inline-flex min-h-11 items-center underline" href={`/contact?subject=${encodeURIComponent(pack.name)}`}>Ask about this package</a>
          </article>
        ))}
      </div>

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
  inquiry,
  onSelect,
}: {
  item: LessonService;
  selected: boolean;
  locked: boolean;
  inquiry?: boolean;
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
        <span className="pd-num font-display text-2xl">{formatDollars(due)}</span>
      </span>
      <span className="mt-1 block text-sm opacity-80">
        {item.minutes} min · {item.purpose}
      </span>
      {inquiry ? <span className="mt-2 block text-sm font-semibold">Ask about this lesson →</span> : null}
      {locked ? (
        <span className="mt-1 block text-xs font-semibold tracking-widest uppercase">
          Locked until assessment completion
        </span>
      ) : null}
    </button>
  );
}
