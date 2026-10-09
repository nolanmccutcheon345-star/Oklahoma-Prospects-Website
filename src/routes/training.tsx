import { CLUB } from "@/lib/club";
import { canPurchase } from "@/lib/purchase-availability";
import { ASSESSMENT_PRODUCTS, formatDollars } from "@/lib/pricing";
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

export const Route = createFileRoute("/training")({head:()=>pageHead("/training","Train & Player Development",`Assessments, private coaching, packages, and monthly development at ${CLUB.name}.`,false), component: TrainingPage });

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

        copy="Private lessons require a completed New Player Assessment. Or start a monthly in-person development plan now: your first session is the assessment, with a one-time $50 first-month fee."
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
  const [lessonId, setLessonId] = useState<string>("");
  const [athletes, setAthletes] = useState<{id:string;name:string;assessmentComplete:boolean}[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [athleteError, setAthleteError] = useState("");
  const lessons = catalog.lessons;
  const selectedAthlete = athletes.find(a => a.id === athleteId);
  // Derived from the selected, server-verified athlete only. A sibling cannot unlock another.
  const hasAssessment = selectedAthlete?.assessmentComplete === true;
  const selectedId = lessonId && lessons.some((item) => item.id === lessonId) ? lessonId : "";

  useEffect(() => {
    let active = true;
    if (!user) {
      setAthletes([]); setAthleteId(""); setLoadingAthletes(false); setAthleteError("");
      return;
    }
    setLoadingAthletes(true); setAthleteError("");
    getCheckoutContext()
      .then(value => {
        if (!active) return;
        setAthletes(value.athletes);
        setAthleteId(current =>
          value.athletes.some(a => a.id === current) ? current :
          value.athletes.length === 1 ? value.athletes[0].id : ""
        );
      })
      .catch(() => {
        if (!active) return;
        setAthletes([]); setAthleteId("");
        setAthleteError("We could not verify the athlete's assessment status. Reload before booking.");
      })
      .finally(() => { if (active) setLoadingAthletes(false); });
    return () => { active = false; };
  }, [user?.id]);

  const groups = ["Pitching", "Hitting", "Catching", "Fielding"] as const;
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {!canPurchase(catalog.purchaseAvailability, "lesson", "s1") ? <aside role="status" className="mb-6 rounded-xl border border-line p-4"><h2 className="text-xl">Online lesson checkout temporarily unavailable</h2><p>Lessons and development memberships cannot be purchased online until secure checkout is verified. You can review assessment options below. Cage availability remains on Book.</p></aside> : null}
      <section id="lessons" className="scroll-mt-40" aria-label="Lesson booking">
      {user && loadingAthletes ? <p role="status" className="mb-3">Checking your athletes and completed assessments…</p> : null}
      {athleteError ? <p role="alert" className="mb-3 text-maroon">{athleteError}</p> : null}
      {!user ? <p className="mb-5"><Link to="/login" search={{next:"/training"}} className="font-semibold underline">Sign in</Link> to select an athlete and book an assessment.</p> : null}
      {user && !loadingAthletes && athletes.length === 0 ? <p className="mb-5"><Link to="/family" className="font-semibold underline">Add an athlete</Link> to your household before booking.</p> : null}
      {athletes.length > 0 ? <label className="mb-6 grid gap-2">Athlete<select value={athleteId} onChange={e=>setAthleteId(e.target.value)} className="min-h-11 rounded-lg border p-3"><option value="">Select an athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.assessmentComplete ? " · assessment completed" : " · assessment needed"}</option>)}</select></label> : null}
        <nav aria-label="Lesson disciplines" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {groups.filter(group => lessons.some(item => item.discipline === group)).map(group => <Button asChild key={group} variant="outlineDark"><a href={`#lesson-${group.toLowerCase()}`}>{group}</a></Button>)}
        </nav>
        {!hasAssessment ? <aside className="mb-6 rounded-2xl bg-ink p-5 text-fg-inverse">
          <h2 className="text-2xl">Start with an assessment</h2>
          <p className="mt-2 text-base text-fg-soft">Private lessons and session packages stay locked until a coach records the completed New Player Assessment. In-person development memberships are available now: the first included session is the assessment, with a one-time $50 first-month fee.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {lessons.filter(item => ASSESSMENT_PRODUCTS.has(item.id)).map(item =>
              canPurchase(catalog.purchaseAvailability, "lesson", item.id)
                ? <Button asChild key={item.id} className="h-auto min-h-12 whitespace-normal text-center"><Link to="/pay" search={{kind:"lesson",id:item.id}}>Book {item.name}</Link></Button>
                : <Button key={item.id} disabled className="h-auto min-h-12 whitespace-normal text-center">{item.name} · {user && selectedAthlete ? "checkout unavailable" : "select an athlete to book"}</Button>
            )}
          </div>
          <p className="mt-3 text-sm text-fg-soft">Already completed an assessment? Select your athlete above. If the record is missing, your coach or the office can review it.</p>
        </aside> : <p className="mb-6 text-base">Assessment completed. Choose a lesson below to book your next session.</p>}
      <h2 className="text-3xl">Choose your lesson</h2>
      <p className="mt-2 mb-8 text-sm text-muted">
        {hasAssessment ? "Choose your service, then pick a qualified coach and available time during checkout." : "Private lessons remain visible but disabled until the selected athlete completes an assessment. Assessment lessons and monthly in-person development remain available."}
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
                  locked={!hasAssessment && !ASSESSMENT_PRODUCTS.has(item.id)}
                  unavailable={!user || !selectedAthlete || !canPurchase(catalog.purchaseAvailability, "lesson", item.id)}
                  onSelect={() => {
                    if (!user || !selectedAthlete || (!hasAssessment && !ASSESSMENT_PRODUCTS.has(item.id)) || !canPurchase(catalog.purchaseAvailability, "lesson", item.id)) return;
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
        <p className="mt-2">Young athletes start with a New Player Assessment. After completion, select an age-appropriate service to see which coaches and session times are available.</p>
      </section>
      </section>

      {<section id="memberships" className="mt-12 scroll-mt-40">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          How serious families train
        </p>
        <h2 className="mt-2 text-3xl">Monthly development</h2>
        <p className="mt-2 text-sm text-muted">
          In-person plans include four coached sessions each month. If the selected athlete has no completed assessment, the first included session is their assessment and the first month includes a one-time $50 fee. Later months renew at the normal plan price. Remote plans require a completed assessment.
        </p>
        <div className="mt-4 grid gap-3">
          {catalog.memberships.map((plan) => {
            const featured = plan.id === "m2" || plan.tier === "performance";
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
                {!hasAssessment && ["m1","m2","m3"].includes(plan.id) ? (
                  <p className="mt-2 text-sm font-semibold" data-first-month-assessment={plan.id}>
                    First month: {formatDollars(plan.price + 50)} including a one-time $50 assessment fee.
                    Your first included session is the assessment; subsequent months are {formatDollars(plan.price)}.
                  </p>
                ) : null}
                <ul className={`mt-2 list-disc pl-5 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>
                  {plan.includes.filter(line => !/^Four (30|60)-minute sessions$/.test(line)).slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {(hasAssessment || ["m1","m2","m3"].includes(plan.id)) && canPurchase(catalog.purchaseAvailability, "membership", plan.id) ? <Button asChild className="mt-4" variant={featured ? "outline" : "primary"}><Link to="/pay" search={{kind:"membership",id:plan.id}}>Join {plan.name}</Link></Button> : <Button disabled className="mt-4" variant={featured ? "outline" : "primary"}>{plan.id === "m4" ? "Schedule not yet published" : canPurchase(catalog.purchaseAvailability, "membership", plan.id) ? "Complete assessment first" : catalog.purchaseAvailability ? "Checkout unavailable" : "Loading checkout…"}</Button>}
              </article>
            );
          })}
        </div>
        <ul className="mt-6 grid gap-2 text-sm text-muted">
          {MEMBERSHIP_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>}

      {hasAssessment ? <>
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
            {user && selectedAthlete && canPurchase(catalog.purchaseAvailability, "package", pack.id) ? <Button asChild className="mt-4"><Link to="/pay" search={{kind:"package",id:pack.id}}>Purchase {pack.credits} sessions · {formatDollars(pack.price)}</Link></Button> : <Button disabled className="mt-4">{canPurchase(catalog.purchaseAvailability, "package", pack.id) ? "Select an athlete" : "Package checkout temporarily unavailable"}</Button>}
          </article>
        ))}
      </div>

      </> : null}

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
  unavailable,
  onSelect,
}: {
  item: LessonService;
  selected: boolean;
  locked: boolean;
  unavailable: boolean;
  onSelect: () => void;
}) {
  const due = item.price;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked || unavailable}
      aria-pressed={selected}
      className={cn(
        "rounded-xl px-4 py-3 text-left shadow-border disabled:cursor-not-allowed",
        selected && !locked && !unavailable ? "bg-maroon text-fg-inverse" : "bg-paper-2",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xl uppercase">{item.name}</span>
        <span className="pd-num font-display text-2xl">{formatDollars(due)}</span>
      </span>
      <span className="mt-1 block text-sm opacity-80">
        {item.minutes} min · {item.purpose}
      </span>
      {unavailable ? <span className="mt-2 block text-sm font-semibold">{locked ? "Complete assessment first" : "Sign in and select an athlete to book"}</span> : null}
      {locked ? (
        <span className="mt-1 block text-xs font-semibold tracking-widest uppercase">
          Locked until assessment completion
        </span>
      ) : null}
    </button>
  );
}
