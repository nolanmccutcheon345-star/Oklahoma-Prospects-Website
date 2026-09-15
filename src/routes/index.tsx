import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { FaqList } from "@/components/faq-list";
import { GoogleReview } from "@/components/google-review";
import { HoursChip } from "@/components/hours-chip";
import { MembershipPlans } from "@/components/membership-plans";
import { PeopleCards } from "@/components/people";
import { Button } from "@/components/ui/button";
import { CANCEL_POLICY, CLUB, LINKS, PROOF, RENTALS } from "@/lib/club";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main id="main">
      <section className="relative isolate overflow-hidden bg-ink text-fg-inverse">
        <img
          src="/brand/team.jpg"
          alt="Training at Oklahoma Prospects"
          width={1536}
          height={1152}
          className="absolute inset-0 -z-20 size-full object-cover object-[center_36%]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/92 to-ink/50" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-ink/40" />
        <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-12">
          <HoursChip />
          <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Broken Arrow · Indoor baseball & softball
          </p>
          <h1 className="mt-3 max-w-xl font-display text-5xl leading-[0.9] font-extrabold italic sm:text-6xl">
            YOUR HOUR.
            <br />
            <span className="text-powder">YOUR LANE.</span>
          </h1>
          <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-fg-soft">
            Reserved cage time, private instruction, and competitive teams. Not
            a walk-in rec cage — when you book, the space is yours.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/book">Reserve a cage</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/tryouts">Free Spring tryout</Link>
            </Button>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-maroon from-70% to-powder" />
      </section>

      <section className="bg-ink">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-px border-t border-fg-inverse/10">
          {PROOF.map((item) => (
            <div key={item.label} className="px-2 py-4 text-center">
              <p className="text-[0.65rem] font-semibold tracking-widest text-fg-soft uppercase">
                {item.label}
              </p>
              <p className="mt-1 font-display text-sm font-extrabold text-powder uppercase sm:text-base">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          What do you need today?
        </p>
        <h2 className="mt-2 text-3xl">Start here. Stay in Prospects.</h2>
        <div className="mt-5 grid gap-3">
          <PathCard
            to="/book"
            kicker="From $50 / hour"
            title="Book a cage"
            body="One cage or several at the same time. Pick a live slot and pay with card — the lanes are yours."
          />
          <PathCard
            to="/training"
            kicker="From $229 / mo"
            title="Start monthly development"
            body="Four coached sessions a month, a plan, and tracking. First month is $279 without an assessment on file, then $229."
          />
          <MemberPathCard />
          <PathCard
            to="/tryouts"
            kicker="Free · Nov 14–15"
            title="Earn a roster spot"
            body="Spring 2027 evaluations. Other ages: send a team inquiry."
          />
          <PathCard
            to="/more"
            kicker="Arriving today"
            title="Check in & waiver"
            body="Parent tools, directions, and member sign-in — same club, one visit flow."
          />
        </div>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl">Cage rates</h2>
              <p className="mt-1 text-muted">
                Pay only for the hour you reserve. {CANCEL_POLICY.short}.
              </p>
            </div>
            <Button asChild variant="outlineDark" size="sm">
              <Link to="/book">Build a reservation</Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-3">
            {RENTALS.map((rental) => (
              <Link
                key={rental.id}
                to="/book"
                search={{ space: rental.id }}
                className="flex items-center justify-between gap-4 rounded-2xl bg-paper p-4 no-underline shadow-border"
              >
                <span>
                  <span className="block font-display text-2xl uppercase">
                    {rental.name}
                  </span>
                  <span className="text-sm text-muted">{rental.summary}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-3xl font-extrabold">
                    ${rental.price}
                  </span>
                  <span className="text-xs text-muted">per hour</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Softball trains here too — Lane 7 is dual-use. Drop-in is the
            one-off. If you train twice a month, membership is cheaper.
          </p>
        </div>
      </section>

      <section className="bg-navy py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Train more · save more
          </p>
          <h2 className="mt-2 text-3xl">Train every month. Pay less per hour.</h2>
          <p className="mt-3 max-w-xl text-fg-soft">
            Two hours a month already costs less than dropping in. Four hours a
            month is All-Star — about $35 an hour, with first pick of times.
          </p>
          <div className="mt-6">
            <MembershipPlans cta="Compare memberships" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Straight answers</h2>
        <FaqList />
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Questions after you book</h2>
          <p className="mt-2 mb-5 text-muted">
            The desk answers cages and the door. Coach Steve answers after a
            paid lesson — not before you pick a slot.
          </p>
          <PeopleCards />
          <a
            href={LINKS.maps}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex min-h-20 items-center gap-3 rounded-xl bg-paper px-4 py-3 no-underline shadow-border"
          >
            <MapPin className="size-5 text-maroon" />
            <span>
              <span className="block text-[0.7rem] font-semibold tracking-widest text-muted uppercase">
                {CLUB.addressLine1}
              </span>
              <span className="block text-sm font-semibold">
                {CLUB.addressLine2}
              </span>
            </span>
          </a>
          <div className="mt-6">
            <GoogleReview />
          </div>
        </div>
      </section>
    </main>
  );
}

function MemberPathCard() {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) {
    return (
      <PathCard
        to="/login"
        kicker="Parents · players · coaches · admin"
        title="Member sign in"
        body="One account. Cages, lessons, and teams stay on this club."
      />
    );
  }
  return (
    <PathCard
      to="/account"
      kicker="Already signed in"
      title="Open development"
      body="Programs, drills, TCI, and billing for this login. No second site."
    />
  );
}

function PathCard({
  to,
  kicker,
  title,
  body,
}: {
  to: "/book" | "/training" | "/tryouts" | "/more" | "/account" | "/login";
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 rounded-2xl bg-paper-2 p-5 no-underline shadow-border"
    >
      <span>
        <span className="block text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {kicker}
        </span>
        <span className="mt-1 block font-display text-2xl uppercase">{title}</span>
        <span className="mt-1 block text-sm text-muted">{body}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-maroon" />
    </Link>
  );
}
