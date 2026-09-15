import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn, SignedIn, SignedOut } from "@/lib/auth/gates";
import { OfficeApp } from "@/components/teams/office-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { getTeamsClub, onboardTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/office")({ component: Page });

function Page() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <OfficePage />
      </SignedIn>
    </>
  );
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
  if (!state) return <p className="p-6">Loading club…</p>;
  if (state.role !== "admin") {
    return <FailScreen message="Front office is for the two owners only." />;
  }
  if (state.missing) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Front office"
          title="Open the club."
          accent="Same login."
          copy="First run. Start empty or load the labelled sample club. Prospects will never silently invent a roster."
          image="/brand/team.jpg"
          compact
        />
        <div className="mx-auto max-w-lg px-5 py-8">
          <div className="grid gap-2">
            <Button
              type="button"
              onClick={async () => {
                const row = await onboardTeamsClub({ data: { mode: "sample" } });
                setClub(row.club);
                setState({ ok: true, missing: false, role: "admin", me: state.me, club: row.club });
              }}
            >
              Load sample club
            </Button>
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
