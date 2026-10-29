import { MyFinance } from "@/components/finance/my-finance";
import { money } from "@/components/teams/ui";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachApp } from "@/components/teams/coach-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { Button } from "@/components/ui/button";
import { getTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/coach")({
  head: () =>
    pageHead(
      "/coach",
      "Coach Desk",
      "Manage assigned athletes, team records, and coaching sessions.",
      true,
    ),
  component: Page,
});

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
  const [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [dirty, setDirty] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || inFlight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
  if (
    state.role !== "coach" &&
    state.role !== "admin" &&
    state.ok &&
    (state.financial?.coachTeams.length || state.financial?.staff.length)
  ) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-4xl">Your coaching finances</h1>
        <MyFinance />
        {state.financial.staff.map((s) => (
          <p key={s.teamId + s.id}>
            {s.name} · {s.teamName} · monthly {money(s.monthly)} · applied to fees{" "}
            {money(s.applyAmount)}
          </p>
        ))}
        <p className="mt-4">
          No operational coaching assignment is currently linked to this account.
        </p>
      </main>
    );
  }
  if (state.role !== "coach" && state.role !== "admin") {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-4xl">Coach desk is for staff.</h1>
        <p className="mt-3 text-muted">
          Open Family for your player, or Lessons for development. Coaches are invited by the
          office.
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
        <Button asChild variant="outlineDark" className="mt-6 ml-3">
          <Link to="/registrations">Tryouts & Evaluations</Link>
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
        { to: "/registrations", label: "Tryouts & Evaluations" },
        { to: "/family", label: "Family" },
        ...(state.role === "admin" ? [{ to: "/office", label: "Office" }] : []),
        { to: "/account", label: "Lessons" },
      ]}
    >
      <section className="mb-5 rounded-xl border border-line bg-white p-4">
        <h2 className="text-2xl">Tryouts & Evaluations</h2>
        <p className="mt-2 text-sm text-muted">
          View all registrations, contact families, schedule evaluations, and save player results.
        </p>
        <Button asChild className="mt-3">
          <Link to="/registrations">Open Tryouts & Evaluations</Link>
        </Button>
      </section>
      <section className="mb-5 rounded-xl border p-4">
        <h2 className="text-2xl">Your shared profile</h2>
        <p className="my-2">Use the same photo and bio for team coaching and lessons.</p>
        <a href="/my-profile" className="inline-flex min-h-11 items-center underline">
          Edit My Profile
        </a>
        <a href="/instructor" className="ml-5 inline-flex min-h-11 items-center underline">
          Instructor Workspace
        </a>
      </section>
      <div className="sticky top-0 z-10 rounded border bg-white p-3" aria-live="polite">
        {saving ? (
          "Saving coach changes…"
        ) : saveError ? (
          <p role="alert">
            {saveError} Your edits are still here. Retry Save; if the record changed, preserve your
            edits before reloading.
          </p>
        ) : dirty ? (
          "You have unsaved coach changes."
        ) : saved ? (
          "Coach changes saved."
        ) : (
          "Coach changes are saved only when you select Save."
        )}
      </div>
      <fieldset disabled={saving} className="min-w-0">
        <CoachApp
          club={club}
          financial={state.financial}
          onReload={async () => {
            const row = await getTeamsClub();
            setState(row);
            if (row.ok) setClub(row.club);
          }}
          onChange={(next) => {
            setClub(next);
            setDirty(true);
            setSaved(false);
            setSaveError("");
          }}
          onSave={async (nextClub) => {
            if (inFlight.current) return false;
            inFlight.current = true;
            setSaving(true);
            setSaved(false);
            const incoming = nextClub ?? club;
            try {
              setSaveError("");
              const saved = await saveTeamsClub({
                data: { club: incoming, baseRev: incoming._rev },
              });
              setClub(saved.club);
              setState({ ...state, financial: saved.financial });
              setDirty(false);
              setSaved(true);
              return true;
            } catch (err) {
              setSaveError(err instanceof Error ? err.message : "Save failed");
              return false;
            } finally {
              inFlight.current = false;
              setSaving(false);
            }
          }}
        />
      </fieldset>
      <a
        href="/player-profiles"
        className="my-3 inline-flex min-h-11 items-center rounded bg-maroon px-4 text-white"
      >
        Recruiting profiles & metric verification
      </a>
    </TeamsShell>
  );
}
