import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { type LessonService } from "@/lib/catalog";
import { getProfile } from "@/lib/club-data";
import { reservationSlots, chicagoDateISO } from "@/lib/hours";
import { MEMBERSHIP_RULES, OP_LEVELS } from "@/lib/pd";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { PdErrorBoundary } from "@/components/pd/error-boundary";

export const Route = createFileRoute("/training")({ component: TrainingPage });

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
  const [date, setDate] = useState(chicagoDateISO());
  const [error, setError] = useState("");
  const lessons = catalog.lessons;
  const selectedId = lessonId && lessons.some((item) => item.id === lessonId) ? lessonId : lessons[0]?.id;
  const lesson = lessons.find((item) => item.id === selectedId) ?? lessons[0];
  const slots = useMemo(
    () => reservationSlots(date, lesson?.minutes ?? 60),
    [date, lesson?.minutes],
  );
  const canBook = Boolean(lesson);

  useEffect(() => {
    if (!user) return;
    getProfile()
      .then((profile) => setHasAssessment(Boolean(profile?.assessment_complete)))
      .catch(() => setHasAssessment(false));
  }, [user]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!lesson) {
      setError("Pick a session first.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const startTime = String(data.get("time") ?? "");
    const chosenDate = String(data.get("date") ?? "");
    if (!chosenDate || !startTime) {
      setError("Pick a date and a start time that is still open.");
      return;
    }
    const open = reservationSlots(chosenDate, lesson.minutes).some((slot) => slot.value === startTime);
    if (!open) {
      setError("That window isn’t open. Pick another time.");
      return;
    }
    void navigate({
      to: "/pay",
      search: {
        kind: "lesson",
        id: lesson.id,
        date: chosenDate,
        time: startTime,
        assessed: hasAssessment ? "1" : "0",
      },
    });
  }

  const groups = ["Pitching", "Hitting", "Catching", "Fielding"] as const;
  const lessonDue =
    lesson && !hasAssessment && lesson.requiresAssessment ? lesson.price + 50 : lesson?.price ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
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
              !hasAssessment && (plan.id === "m1" || plan.id === "m2" || plan.id === "m3")
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
                  {plan.includes.slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <Button asChild className="mt-4" variant={featured ? "outline" : "primary"}>
                  <Link
                    to="/pay"
                    search={{ kind: "membership", id: plan.id, assessed: hasAssessment ? "1" : "0" }}
                  >
                    Start {plan.name}
                  </Link>
                </Button>
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
        A block of lessons if you are not ready for a monthly plan. Monthly
        development is still the better value if you train every week.
      </p>
      <div className="mt-4 grid gap-3">
        {catalog.packages.map((pack) => (
          <article key={pack.id} className="rounded-2xl bg-paper-2 p-5 shadow-border">
            <h3 className="font-display text-2xl uppercase">{pack.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {pack.credits} credits · {pack.minutes} min · expires in {pack.expiresDays} days
            </p>
            <p className="mt-3 pd-num font-display text-3xl">${pack.price}</p>
            <Button asChild className="mt-4">
              <Link to="/pay" search={{ kind: "package", id: pack.id }}>
                Buy {pack.credits} sessions · ${pack.price}
              </Link>
            </Button>
          </article>
        ))}
      </div>

      <h2 className="mt-12 text-3xl">Single sessions</h2>
      <p className="mt-2 mb-8 text-sm text-muted">
        Private 30s and 60s are open now. Without an assessment on file, the first lesson adds $50 — an hour is $150 instead of $100. Book the assessment to drop that fee and get a plan.
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
                  surcharge={!hasAssessment && item.requiresAssessment ? 50 : 0}
                  onSelect={() => {
                    setLessonId(item.id);
                    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      {lesson ? (
        <form id="book" onSubmit={onSubmit} className="scroll-mt-24 grid gap-4">
          <h2 className="text-3xl">Pick a time and pay</h2>
          <p className="text-sm text-muted">
            {lesson.name} · ${lessonDue} · {lesson.minutes} min
            {!hasAssessment && lesson.requiresAssessment
              ? ` (includes $50 first-lesson fee — $${lesson.price} after an assessment is on file).`
              : "."}{" "}
            Pick a time. Nothing is charged until you approve.
          </p>
          <label className="text-sm font-semibold">
            Date
            <input
              required
              name="date"
              type="date"
              min={chicagoDateISO()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">Start time</legend>
            {slots.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                {date ? "No remaining coach windows this day. Pick another date." : "Pick a date to see coach windows."}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <label
                    key={slot.value}
                    className="flex min-h-11 items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-powder"
                  >
                    <input required type="radio" name="time" value={slot.value} className="sr-only" />
                    {slot.label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          {error ? (
            <p className="text-sm text-maroon" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={!canBook || slots.length === 0}>
            {canBook ? `Review slot · $${lessonDue}` : "Pick a session"}
          </Button>
          <SignedOut>
            <p className="text-center text-sm">
              <Link to="/login" search={{ next: "/training" }}>
                Sign in
              </Link>{" "}
              to keep this on your schedule. Guests can still pay.
            </p>
          </SignedOut>
          <SignedIn>
            <p className="text-center text-sm">
              <Link to="/account">Programs, drills, and tracking</Link>
            </p>
          </SignedIn>
        </form>
      ) : null}

      <h2 className="mt-12 text-3xl">OP-1 through OP-7</h2>
      <p className="mt-2 text-sm text-muted">
        The development ladder every athlete is on. Coaches advance one constraint
        at a time.
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
          <Link to="/book">Reserve a cage</Link>
        </Button>
      </section>
    </div>
  );
}

function ServiceCard({
  item,
  selected,
  surcharge,
  onSelect,
}: {
  item: LessonService;
  selected: boolean;
  surcharge: number;
  onSelect: () => void;
}) {
  const due = item.price + surcharge;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-xl px-4 py-3 text-left shadow-border",
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
      {surcharge ? (
        <span className="mt-1 block text-xs font-semibold tracking-widest uppercase">
          Includes ${surcharge} first-lesson fee without an assessment
        </span>
      ) : null}
    </button>
  );
}

