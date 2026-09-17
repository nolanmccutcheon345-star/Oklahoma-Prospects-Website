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

function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading front office…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <OfficePage />;
}

function OfficePage() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getTeamsClub>>>();
  const [club, setClub] = useState<ClubRecord>();
  const [error, setError] = useState("");

  useEffect(() => {
    getTeamsClub()
      .then((row) => {
        setState(row);
        if (row.ok) setClub(row.club);
      })
      .catch((err: Error) => {
        const message = err.message || "Could not load the club.";
        setError(message === "Unauthorized" ? "signin" : message);
      });
  }, []);

  if (error === "signin") return <RedirectToSignIn />;
  if (error) return <FailScreen message={error} />;
  if (!state) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading front office…</p>
      </main>
    );
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
