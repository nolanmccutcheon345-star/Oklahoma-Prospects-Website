import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SquareOffice } from "@/components/commerce/square-office";
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
    pageHead("/office", "Front Office", "Manage Oklahoma Prospects club operations.", true),
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
          <OfficeOperations />
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
        { to: "/coach", label: "Coach" },
        { to: "/family", label: "Family" },
        { to: "/account", label: "Development" },
      ]}
    >
      <OfficeRequests />
      <SquareOffice />
      <OfficeOperations />
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
    </TeamsShell>
  );
}
