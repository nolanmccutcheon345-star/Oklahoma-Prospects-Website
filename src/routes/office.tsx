import { OfficeWorkspace } from "@/components/office-workspace";
import { OFFICE_SECTIONS, type OfficeSection } from "@/components/front-office-shell";
import { CLUB } from "@/lib/club";
import { StaffBookingChanges } from "@/components/commerce/booking-changes";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SquareOffice } from "@/components/commerce/square-office";
import { DiscountOffice } from "@/components/commerce/discount-office";
import { OfficeRequests } from "@/components/commerce/office-requests";
import { OfficeOperations } from "@/components/commerce/operations";
import { FailScreen } from "@/components/teams/ui";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { getTeamsClub, onboardTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/office")({
  head: () => pageHead("/office", "Front Office", `Manage ${CLUB.name} club operations.`, true),
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: OfficeSection; filter?: string; person?:string } => ({
    section: (OFFICE_SECTIONS.some(([id]) => id === search.section)
      ? search.section
      : "dashboard") as OfficeSection,
    person: typeof search.person === "string" ? search.person : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
  }),
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
          title="Admin front office"
          accent="Manage your academy."
          copy="Manage baseball and softball teams, coaching staff, payments, requests, and facility operations."
          image="/brand/team.jpg"
          compact
        />
        <div className="mx-auto max-w-3xl px-5 py-8">
          <section
            id="office-teams"
            className="mb-8 rounded-2xl border-2 border-maroon bg-white p-5"
          >
            <h2 className="text-2xl font-bold">Teams & coaches</h2>
            <p className="my-3 text-sm">
              Open your team's admin workspace to create baseball and softball teams, create coach
              profiles, and assign coaches. This is a one-time setup; no sample teams will be added.
            </p>
            <Button
              type="button"
              onClick={async () => {
                try {
                  const row = await onboardTeamsClub({ data: { mode: "empty" } });
                  setClub(row.club);
                  setState({
                    ok: true,
                    missing: false,
                    role: "admin",
                    me: state.me,
                    club: row.club,
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not initialize teams.");
                }
              }}
            >
              Open teams & coaches admin
            </Button>
          </section>
          <SquareOffice />
          <DiscountOffice />
          <OfficeOperations />
          <StaffBookingChanges />
          <OfficeRequests />
        </div>
      </main>
    );
  }
  if (!club) return <FailScreen message="Club record missing after load." />;

  return (
    <OfficeWorkspace
      club={club}
      onChange={setClub}
      name={state.me.name}
      onSave={async (nextClub) => {
        const incoming = nextClub ?? club;
        try {
          const saved = await saveTeamsClub({ data: { club: incoming, baseRev: incoming._rev } });
          setClub(saved.club);
          return true;
        } catch (err) {
          window.alert(err instanceof Error ? err.message : "Save failed");
          return false;
        }
      }}
    />
  );
}
