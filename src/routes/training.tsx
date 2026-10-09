import { CLUB } from "@/lib/club";
import { canPurchase } from "@/lib/purchase-availability";
import { ASSESSMENT_PRODUCTS, formatDollars } from "@/lib/pricing";
import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { type LessonService } from "@/lib/catalog";
import { getCheckoutContext } from "@/lib/commerce/api";
import { MEMBERSHIP_RULES } from "@/lib/pd";
import { useLiveCatalog } from "@/lib/use-catalog";
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
        title="Train with purpose. Build your game."
        compact

        copy="Personalized baseball and softball coaching to build skills, confidence, and consistency. Start with an assessment or explore a monthly development plan."
        image="/brand/training.jpg"
        actions={
          <>
            <Button asChild>
              <a href="#lessons">Explore Private Lessons</a>
            </Button>
            <Button asChild variant="outline">
              <a href="#memberships">Compare Monthly Plans</a>
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
                <Link to="/account" search={{ desk: "programs" }}>My Training Plan</Link>
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
  const catalog = useLiveCatalog();
  const [discipline, setDiscipline] = useState("Pitching");
  const [athletes, setAthletes] = useState<{id:string;name:string;assessmentComplete:boolean}[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [athleteError, setAthleteError] = useState("");
  const lessons = catalog.lessons;
  const selectedAthlete = athletes.find(a => a.id === athleteId);
  // Derived from the selected, server-verified athlete only. A sibling cannot unlock another.
  const hasAssessment = selectedAthlete?.assessmentComplete === true;

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
  const availableGroups = groups.filter(group => lessons.some(item => item.discipline === group && !item.group));
  const activeGroup = availableGroups.find(group => group === discipline) ?? availableGroups[0];
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {catalog.purchaseAvailability && !canPurchase(catalog.purchaseAvailability, "lesson", "s1") ? <aside role="status" className="mb-6 rounded-xl border border-line p-4"><h2 className="text-xl">Online lesson checkout temporarily unavailable</h2><p>Lessons and development memberships cannot be purchased online until secure checkout is verified. You can review assessment options below. Cage availability remains on Book.</p></aside> : null}
      <section aria-label="Choose your training path" className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl bg-ink p-5 text-fg-inverse">
          <h2 className="text-2xl">New to Prospects?</h2>
          <p className="mt-2 text-fg-soft">Start with an assessment to understand your current skills and plan your next steps.</p>
          <Button asChild className="mt-4"><a href="#assessments">Start with an assessment</a></Button>
        </article>
        <article className="rounded-2xl bg-paper-2 p-5 shadow-border">
          <h2 className="text-2xl">Ready for consistent training?</h2>
          <p className="mt-2 text-muted">Compare monthly plans for coaching, development priorities, and progress tracking.</p>
          <p className="mt-3 text-sm text-muted">Eligible in-person plans include your assessment as the first session. Without a completed assessment, a one-time $50 fee is added to the first month.</p>
          <Button asChild variant="maroon" className="mt-4"><a href="#memberships">Compare Monthly Plans</a></Button>
        </article>
      </section>

      <section aria-label="How training works" className="mt-8 rounded-xl border border-line p-5">
        <h2 className="text-2xl">How training works</h2>
        <ol className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {["Assessment", "Training plan", "Coaching", "Progress review"].map((step, i) => <li key={step}><span className="block text-sm font-semibold text-maroon">{i + 1}</span><span className="font-semibold">{step}</span></li>)}
        </ol>
      </section>

      <section id="assessments" aria-label="Player assessments" className="mt-8 scroll-mt-40 rounded-2xl bg-ink p-5 text-fg-inverse">
        <h2 className="text-2xl">Your first step: a player assessment</h2>
        <p className="mt-2 text-fg-soft">Your coach evaluates your current skills and recommends your next steps. Complete an assessment before booking private lessons, or join an eligible monthly plan with the assessment included as your first session.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {lessons.filter(item => ASSESSMENT_PRODUCTS.has(item.id)).map(item =>
            canPurchase(catalog.purchaseAvailability, "lesson", item.id)
              ? <Button asChild key={item.id} className="h-auto min-h-12 whitespace-normal text-center"><Link to="/pay" search={{kind:"lesson",id:item.id}}>Book {item.name}</Link></Button>
              : <Button key={item.id} disabled className="h-auto min-h-12 whitespace-normal text-center">{item.name} · {catalog.purchaseAvailability ? "checkout unavailable" : "loading checkout…"}</Button>
          )}
        </div>
        <p className="mt-3 text-sm text-fg-soft">Already completed an assessment? Select your athlete in the booking section below. If the record is missing, your coach or the office can review it.</p>
      </section>

      <section id="lessons" className="mt-10 scroll-mt-40" aria-label="Lesson booking">
        <h2 className="text-3xl">Choose your lesson</h2>
        <p className="mt-2 mb-5 text-sm text-muted">Explore a discipline, then choose your next session. Private lessons require a completed player assessment.</p>
        <div role="tablist" aria-label="Lesson disciplines" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availableGroups.map(group => <button key={group} type="button" role="tab" id={`tab-${group.toLowerCase()}`} aria-selected={activeGroup === group} aria-controls={`lesson-${group.toLowerCase()}`} tabIndex={activeGroup === group ? 0 : -1}
            className={`min-h-12 rounded-lg border px-3 py-2 font-semibold ${activeGroup === group ? "border-maroon bg-maroon text-fg-inverse" : "border-line bg-paper-2"}`}
            onClick={() => setDiscipline(group)} onKeyDown={event => {
              const index = availableGroups.indexOf(group);
              const next = event.key === "ArrowRight" ? (index + 1) % availableGroups.length : event.key === "ArrowLeft" ? (index - 1 + availableGroups.length) % availableGroups.length : event.key === "Home" ? 0 : event.key === "End" ? availableGroups.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault(); setDiscipline(availableGroups[next]);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}>{group}</button>)}
        </div>
        {availableGroups.map(group => <section key={group} role="tabpanel" id={`lesson-${group.toLowerCase()}`} aria-labelledby={`tab-${group.toLowerCase()}`} hidden={activeGroup !== group} tabIndex={0} className="scroll-mt-40">
          <h3 className="text-2xl">{group}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lessons.filter(item => item.discipline === group && !item.group).map(item => <ServiceCard key={item.id} item={item}
              locked={!hasAssessment && !ASSESSMENT_PRODUCTS.has(item.id)}
              ready={canPurchase(catalog.purchaseAvailability, "lesson", item.id)}
              athleteSelected={Boolean(user && selectedAthlete)} />)}
          </div>
        </section>)}
        <div id="lesson-booking" className="mt-6 scroll-mt-40 rounded-xl border border-line p-5">
          <h3 className="text-xl">Ready to book? Choose your athlete.</h3>
          {user && loadingAthletes ? <p role="status" className="mt-3">Checking your athletes and completed assessments…</p> : null}
          {athleteError ? <p role="alert" className="mt-3 text-maroon">{athleteError}</p> : null}
          {!user ? <p className="mt-3"><Link to="/login" search={{next:"/training"}} className="font-semibold underline">Sign in</Link> to choose your athlete. You can browse lessons and compare plans before signing in.</p> : null}
          {user && !loadingAthletes && athletes.length === 0 ? <p className="mt-3"><Link to="/family" className="font-semibold underline">Add an athlete</Link> to your household before booking.</p> : null}
          {athletes.length > 0 ? <label className="mt-3 grid gap-2">Athlete<select value={athleteId} onChange={e=>setAthleteId(e.target.value)} className="min-h-12 w-full min-w-0 rounded-lg border p-3"><option value="">Select an athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.assessmentComplete ? " · assessment completed" : " · assessment needed"}</option>)}</select></label> : null}
          {hasAssessment ? <p className="mt-3">Assessment completed. Choose View Available Times on a lesson to pick a coach and session time.</p> : null}
        </div>
        <section id="youth-lessons" className="mt-6 rounded-xl bg-paper-2 p-5">
          <h3 className="text-xl">Youth lessons · ages 10 and under</h3>
          <p className="mt-2 text-sm text-muted">Young athletes start with a New Player Assessment. After completion, select an age-appropriate service to see which coaches and session times are available.</p>
        </section>
      </section>

      <section id="memberships" className="mt-12 scroll-mt-40">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Build consistency. Keep developing.</p>
        <h2 className="mt-2 text-3xl">Monthly training plans</h2>
        <p className="mt-2 text-sm text-muted">Compare coaching formats and choose the right fit. Monthly prices and any applicable first-month assessment fee are shown below.</p>
        {planGroups.map(group => {
          const plans = catalog.memberships.filter(group.matches);
          return plans.length ? <section key={group.id} aria-label={group.name} className="mt-7">
            <h3 className="text-2xl">{group.name}</h3>
            <p className="mt-2 text-sm text-muted">{group.copy}</p>
            <div className={`mt-4 grid gap-4 ${group.id === "in-person" ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
              {plans.map(plan => <TrainingPlanCard key={plan.id} plan={plan} hasAssessment={hasAssessment} availability={catalog.purchaseAvailability} />)}
            </div>
          </section> : null;
        })}
        <details className="mt-6 rounded-xl border border-line p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Membership policies</summary>
          <ul className="mt-3 grid gap-2 text-sm text-muted">{MEMBERSHIP_RULES.map(rule => <li key={rule}>{rule}</li>)}</ul>
        </details>
      </section>

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
        <h2 className="text-2xl">Looking for cage time?</h2>
        <p className="mt-2 text-sm text-fg-soft">
          Reserve indoor cage time for independent training or team practice. Explore hourly rentals and monthly cage passes.
        </p>
        <Button asChild className="mt-4">
          <Link to="/book">Book a cage</Link>
        </Button>
      </section>
    </div>
  );
}

type TrainingPlan = ReturnType<typeof useLiveCatalog>["memberships"][number];
type Availability = ReturnType<typeof useLiveCatalog>["purchaseAvailability"];
const groupPlan = (plan: TrainingPlan) => plan.id === "m4" || plan.tier === "group";
const remotePlan = (plan: TrainingPlan) => plan.id === "m5" || plan.tier === "remote" || (plan.lessons === 0 && plan.remote > 0);
const planGroups = [
  {id:"in-person",name:"In-Person Training",copy:"Four coached sessions each month. Eligible plans include an assessment-first option with a one-time $50 first-month fee when no completed assessment is on file.",matches:(p:TrainingPlan)=>!groupPlan(p)&&!remotePlan(p)},
  {id:"group",name:"Small-Group Training",copy:"Train with comparable pitchers in scheduled groups. Enrollment requires a published group schedule.",matches:groupPlan},
  {id:"remote",name:"Remote Coaching",copy:"Programming and video feedback for training remotely. A completed assessment is required before enrollment.",matches:(p:TrainingPlan)=>!groupPlan(p)&&remotePlan(p)},
];

function TrainingPlanCard({plan,hasAssessment,availability}:{plan:TrainingPlan;hasAssessment:boolean;availability:Availability}) {
  const featured = plan.id === "m2" || plan.tier === "performance";
  const assessmentFirst = ["m1","m2","m3"].includes(plan.id);
  const ready = canPurchase(availability,"membership",plan.id);
  const benefits = plan.includes.filter(line => !/^Four (30|60|75)-minute/.test(line));
  const audience = plan.id === "m1" ? "For athletes building consistent training habits." : plan.id === "m2" ? "For athletes seeking longer sessions and deeper skill development." : plan.id === "m3" ? "For athletes combining in-person coaching and remote feedback." : plan.detail;
  return <article className={`flex min-w-0 flex-col rounded-2xl p-5 ${featured ? "bg-maroon text-fg-inverse" : "bg-paper-2 shadow-border"}`}>
    {featured && <p className="text-xs font-semibold tracking-widest text-powder uppercase">Core monthly plan</p>}
    <h4 className="mt-1 font-display text-2xl uppercase">{plan.name}</h4>
    <p className={`mt-2 text-sm ${featured ? "text-fg-soft" : "text-muted"}`}>{audience}</p>
    <p className="mt-3 pd-num font-display text-3xl">{formatDollars(plan.price)}<span className="ml-1 font-sans text-base font-medium opacity-80">/mo</span></p>
    <p className="mt-2 text-sm font-semibold">{plan.lessons > 0 ? `${plan.lessons} ${groupPlan(plan) ? "group " : "coached "}sessions/month · ${plan.minutes} minutes each` : `${plan.remote} video reviews/month · remote programming`}</p>
    {!hasAssessment && assessmentFirst && <p className="mt-3 text-sm" data-first-month-assessment={plan.id}>Without a completed assessment, first month: <strong>{formatDollars(plan.price + 50)}</strong>, including a one-time $50 assessment fee. Your first included session is the assessment; later months are {formatDollars(plan.price)}.</p>}
    <ul className={`mt-3 grid gap-2 pl-4 text-sm list-disc ${featured ? "text-fg-soft" : "text-muted"}`}>{benefits.slice(0,3).map(line=><li key={line}>{line}</li>)}</ul>
    <details className="mt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold underline">Plan Details</summary>
      <p className="mt-2">{plan.detail}</p>
      {benefits.length > 3 && <ul className="mt-2 list-disc space-y-2 pl-4">{benefits.slice(3).map(line=><li key={line}>{line}</li>)}</ul>}
    </details>
    <div className="mt-auto pt-4">
      {(hasAssessment || assessmentFirst) && ready ? <Button asChild className="h-auto min-h-12 w-full whitespace-normal text-center" variant={featured ? "outline" : "primary"}><Link to="/pay" search={{kind:"membership",id:plan.id}}>Join {plan.name}</Link></Button>
        : ready && !hasAssessment ? <><p className="mb-2 text-sm">Assessment required before enrollment.</p><Button asChild className="h-auto min-h-12 w-full whitespace-normal" variant={featured ? "outline" : "primary"}><a href="#assessments">Book an Assessment</a></Button></>
        : <Button disabled className="h-auto min-h-12 w-full whitespace-normal" variant={featured ? "outline" : "primary"}>{groupPlan(plan) ? "Schedule not yet published" : availability ? "Checkout unavailable" : "Loading checkout…"}</Button>}
    </div>
  </article>;
}

function ServiceCard({item,locked,ready,athleteSelected}:{item:LessonService;locked:boolean;ready:boolean;athleteSelected:boolean}) {
  const assessment = ASSESSMENT_PRODUCTS.has(item.id);
  return <article className="flex min-w-0 flex-col rounded-xl bg-paper-2 p-4 shadow-border">
    <div className="flex items-start justify-between gap-3"><h4 className="font-display text-xl uppercase">{item.name}</h4><span className="shrink-0 pd-num font-display text-2xl">{formatDollars(item.price)}</span></div>
    <p className="mt-2 text-sm text-muted">{item.minutes} min · {item.purpose}</p>
    {locked && <p className="mt-3 text-sm font-semibold">Assessment required before booking.</p>}
    <div className="mt-auto pt-4">
      {locked ? <Button asChild variant="outlineDark" className="w-full"><a href="#assessments">Book an Assessment</a></Button>
        : !ready ? <Button disabled className="w-full">Checkout unavailable</Button>
        : assessment || athleteSelected ? <Button asChild variant="maroon" className="h-auto min-h-12 w-full whitespace-normal"><Link to="/pay" search={{kind:"lesson",id:item.id}} aria-label={`View available times for ${item.name}`}>View Available Times</Link></Button>
        : <Button asChild variant="outlineDark" className="w-full"><a href="#lesson-booking">Select an athlete to book</a></Button>}
    </div>
  </article>;
}
