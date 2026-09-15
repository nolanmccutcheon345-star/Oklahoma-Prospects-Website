import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { PdWorkspace } from "@/components/pd/workspace";
import { PdErrorBoundary } from "@/components/pd/error-boundary";
import { getProfile, saveProfile, type ClubRole } from "@/lib/club-data";
import { ROLE_LABEL } from "@/lib/pd";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading account…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <AccountHome />;
}

function AccountHome() {
  const user = useCurrentUser();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getProfile>>>();
  const [role, setRole] = useState<ClubRole>("parent");
  const [playerName, setPlayerName] = useState("");
  const [name, setName] = useState(user?.displayName ?? "");
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load(attempt = 0) {
      try {
        const row = await getProfile();
        if (cancelled) return;
        setProfile(row);
        if (row) {
          setRole(row.role);
          setPlayerName(row.player_name);
          setName(row.name);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load account.";
        if (attempt < 2 && /unauthor/i.test(message)) {
          window.setTimeout(() => load(attempt + 1), 250);
          return;
        }
        if (cancelled) return;
        setLoadError(message);
        setProfile(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (profile === undefined) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading development…</p>
      </main>
    );
  }

  if (loadError && /unauthor/i.test(loadError)) {
    return <RedirectToSignIn />;
  }

  if (!profile) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Player development"
          title="Set up your account"
          accent="We’ll open the right desk."
          copy="Player or parent. Club owners open as admin automatically. Coaches are invited by the office."
          image="/brand/training.jpg"
        />
        <div className="mx-auto max-w-3xl px-5 py-8">
          {loadError ? <p className="mb-3 text-sm text-maroon">{loadError}</p> : null}
          <form
            className="grid gap-3 rounded-2xl bg-paper-2 p-5 shadow-border"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await saveProfile({
                  data: {
                    name: name || user?.displayName || "Prospects member",
                    role,
                    playerName,
                    email: user?.primaryEmail ?? "",
                  },
                });
                const next = await getProfile();
                setProfile(next);
              } catch (err) {
                setLoadError(err instanceof Error ? err.message : "Could not save account.");
              }
            }}
          >
            <label className="text-sm font-semibold">
              Your name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
              />
            </label>
            <label className="text-sm font-semibold">
              I am
              <select
                value={role === "coach" || role === "admin" ? "parent" : role}
                onChange={(e) => setRole(e.target.value as ClubRole)}
                className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
              >
                <option value="parent">Parent / guardian</option>
                <option value="player">Player</option>
              </select>
            </label>
            <p className="text-xs text-muted">
              Coaches and the front office are invited by Prospects. Sign in with
              your staff email if you already have one.
            </p>
            <label className="text-sm font-semibold">
              Athlete name
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
              />
            </label>
            <Button type="submit">Save account</Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main id="main">
      <PageHero
        compact
        eyebrow={`${ROLE_LABEL[profile.role]} · player development`}
        title={profile.name || "Your club"}
        accent="Plans, cages, and teams."
        copy={
          profile.assessment_complete
            ? "Assessment on file. Private 30s and 60s are open."
            : "No assessment on file yet. You can still view every plan and book an assessment, remote review, group session, package, or membership."
        }
        image="/brand/training.jpg"
        actions={
          <>
            {profile.role === "admin" ? (
              <Button asChild>
                <Link to="/office">Front office</Link>
              </Button>
            ) : null}
            {profile.role === "coach" || profile.role === "admin" ? (
              <Button asChild variant="outline">
                <Link to="/coach">Coach app</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/family">Family app</Link>
            </Button>
            <div className="flex min-h-11 items-center rounded-md bg-navy px-3 text-fg-inverse">
              <UserButton />
            </div>
          </>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <PdErrorBoundary section="Train · account">
          <PdWorkspace profile={profile} />
        </PdErrorBoundary>
      </div>
    </main>
  );
}
