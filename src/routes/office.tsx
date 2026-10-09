import { CLUB } from "@/lib/club";
import { StaffBookingChanges } from "@/components/commerce/booking-changes";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SquareOffice } from "@/components/commerce/square-office";
import { DiscountOffice } from "@/components/commerce/discount-office";
import { OfficeRequests } from "@/components/commerce/office-requests";
import { OfficeApp } from "@/components/teams/office-app";
import { OfficeOperations } from "@/components/commerce/operations";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { getTeamsClub, onboardTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/office")({
  head: () =>
    pageHead("/office", "Front Office", `Manage ${CLUB.name} club operations.`, true),
  component: Page,
});

function OfficeLoading() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), 15000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
      {stalled ? (
        <div role="alert" className="grid gap-4">
          <p>
            The front office could not finish loading. Your saved records have not been changed.
          </p>
          <a href="/login?next=%2Foffice" className="underline">
            Open sign-in
          </a>
          <button
            type="button"
            className="min-h-11 text-left underline"
            onClick={() => window.location.reload()}
          >
            Retry front office
          </button>
        </div>
      ) : (
        <p role="status" className="text-sm text-fg-soft">
          Loading front office…
        </p>
      )}
    </main>
  );
}

function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <OfficeLoading />;
  }
  if (!user) return <RedirectToSignIn />;
  return <OfficePage />;
}

function OfficePage() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getTeamsClub>>>();
  const [club, setClub] = useState<ClubRecord>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active)
        setError("The club records request timed out. Your saved records have not been changed.");
    }, 15000);
    getTeamsClub()
      .then((row) => {
        if (!active) return;
        window.clearTimeout(timer);
        setError("");
        setState(row);
        if (row.ok) setClub(row.club);
      })
      .catch((err: Error) => {
        if (!active) return;
        window.clearTimeout(timer);
        const message = err.message || "Could not load the club.";
        setError(message === "Unauthorized" ? "signin" : message);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (error === "signin") return <RedirectToSignIn />;
  if (error) return <FailScreen message={error} />;
  if (!state) {
    return <OfficeLoading />;
  }
  if (state.role !== "admin") {
    return <FailScreen message="Front office is for club owners." />;
  }
  if (state.missing) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Front office"
          title="Open the club."
          accent="Your club records."
          copy="Start an empty team desk. Only add confirmed club records."
          image="/brand/team.jpg"
          compact
        />
        <div className="mx-auto max-w-3xl px-5 py-8">
          <SquareOffice />
          <DiscountOffice />
          <OfficeOperations />
      <StaffBookingChanges />
          <OfficeRequests />
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outlineDark"
              onClick={async () => {
                const row = await onboardTeamsClub({ data: { mode: "empty" } });
                setClub(row.club);
                setState({ ok: true, missing: false, role: "admin", me: state.me, club: row.club });
              }}
            >
              Start empty
            </Button>
          </div>
        </div>
      </main>
    );
  }
  if (!club) return <FailScreen message="Club record missing after load." />;

  return (
    <TeamsShell
      title="Front office"
      path="/office"
      demo={club._demo}
      nav={[
        { to: "/office", label: "Office" },
        { to: "/evaluations", label: "Evaluations" },
        { to: "/coach", label: "Coach" },
        { to: "/family", label: "Family" },
        { to: "/account", label: "Development" },
      ]}
    >
      <nav aria-label="Front office sections" className="mb-6 rounded-2xl border border-line bg-paper-2 p-5">
        <h2 className="text-2xl">Front office tools</h2>
        <p className="mt-1 text-sm text-muted">Jump directly to the area you need. All controls remain owner-only.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["Tryout results", "#office-evaluations"],
            ["Requests", "#office-requests"],
            ["Payments", "#office-payments"],
            ["Promotions", "#office-discounts"],
            ["Operations & reporting", "#office-operations"],
            ["Booking changes", "#office-booking-changes"],
            ["Teams & coach assignments", "#team-coach-assignments"],
          ].map(([label, hash]) => (
            <a key={hash} href={hash}
              className="flex min-h-11 items-center rounded-xl border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-maroon">
              {label}
            </a>
          ))}
        </div>
      </nav>
      <section id="office-evaluations" className="mb-5 scroll-mt-32 rounded-xl border border-line bg-white p-4"><h2 className="text-2xl">Tryout results</h2><p className="mt-2 text-sm text-muted">Review coach scores, notes and next steps across all teams and age groups.</p><Button asChild className="mt-3"><Link to="/evaluations">Review evaluations</Link></Button></section>
      <section id="office-requests" className="scroll-mt-32"><OfficeRequests /></section>
      <section id="office-payments" className="scroll-mt-32"><SquareOffice /></section>
      <section id="office-discounts" className="scroll-mt-32"><DiscountOffice /></section>
      <section id="office-operations" className="scroll-mt-32"><OfficeOperations /></section>
      <section id="office-booking-changes" className="scroll-mt-32"><StaffBookingChanges /></section>
      <section id="office-teams" className="scroll-mt-32" aria-label="Team administration">
      <OfficeApp
        club={club}
        onChange={setClub}
        onSave={async () => {
          try {
            const saved = await saveTeamsClub({ data: { club, baseRev: club._rev } });
            setClub(saved.club);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      />
      </section>
    </TeamsShell>
  );
}
