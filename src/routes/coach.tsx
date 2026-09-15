import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachApp } from "@/components/teams/coach-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { Button } from "@/components/ui/button";
import { getTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/coach")({head:()=>pageHead("/coach","Coach Desk","Manage assigned athletes, team records, and coaching sessions.",true), component: Page });

function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading coach desk…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <CoachPage />;
}

function CoachPage() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getTeamsClub>>>();
  const [club, setClub] = useState<ClubRecord>();
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

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
        <p className="text-sm text-fg-soft">Loading coach desk…</p>
      </main>
    );
  }
  if (state.role !== "coach" && state.role !== "admin") {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-4xl">Coach desk is for staff.</h1>
        <p className="mt-3 text-muted">
          Open Family for your player, or Lessons for development. Coaches are
          invited by the office.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/family">Family desk</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/account">Lessons</Link>
          </Button>
        </div>
      </main>
    );
  }
  if (state.missing || !club) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-4xl">No teams assigned yet.</h1>
        <p className="mt-3 text-muted">
          Front office opens the club record and assigns your email to a team.
        </p>
        <Button asChild className="mt-6">
          <Link to="/account">Open lessons</Link>
        </Button>
      </main>
    );
  }

  return (
    <TeamsShell
      title="Coach"
      path="/coach"
      demo={club._demo}
      nav={[
        { to: "/coach", label: "Coach" },
        { to: "/family", label: "Family" },
        ...(state.role === "admin" ? [{ to: "/office", label: "Office" }] : []),
        { to: "/account", label: "Lessons" },
      ]}
    >
      <CoachApp
        club={club}
        onChange={setClub}
        onSave={async () => {
          try {
            setSaveError("");
            const saved = await saveTeamsClub({ data: { club, baseRev: club._rev } });
            setClub(saved.club);
          } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      />
      {saveError ? (
        <p className="mt-3 text-sm text-maroon" role="alert">
          {saveError}
        </p>
      ) : null}
    </TeamsShell>
  );
}
