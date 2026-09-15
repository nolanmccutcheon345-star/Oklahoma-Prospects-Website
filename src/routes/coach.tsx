import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn, SignedIn, SignedOut } from "@/lib/auth/gates";
import { CoachApp } from "@/components/teams/coach-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { getTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/coach")({ component: Page });

function Page() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <CoachPage />
      </SignedIn>
    </>
  );
}

function CoachPage() {
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
  if (state.role !== "coach" && state.role !== "admin") {
    return (
      <FailScreen message="This desk is for coaches. Sign in with a coach account or open Family / Front office." />
    );
  }
  if (state.missing || !club) {
    return <FailScreen message="Front office has not opened the club record yet." />;
  }

  return (
    <TeamsShell
      title="Coach"
      path="/coach"
      demo={club._demo}
      nav={[
        { to: "/coach", label: "Coach" },
        { to: "/family", label: "Family" },
        { to: "/office", label: "Office" },
        { to: "/account", label: "Development" },
      ]}
    >
      <CoachApp
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
