import {PlayerBirthdays} from '@/components/commerce/player-birthdays';
import {chicagoDate} from '@/lib/scheduling';
import { AccountSecurity } from "@/components/account-security";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { DevelopmentProvider } from "@/lib/pd/context";
const PdWorkspace = lazy(() =>
  import("@/components/pd/workspace").then((m) => ({ default: m.PdWorkspace })),
);
import { PdErrorBoundary } from "@/components/pd/error-boundary";
import { getProfile, saveProfile, type ClubRole } from "@/lib/club-data";
import { getRegistrationAccess } from "@/lib/registrations-api";
import { ROLE_LABEL } from "@/lib/pd";

export const Route = createFileRoute("/account")({
  head: () =>
    pageHead(
      "/account",
      "Player Development Account",
      "Your assigned development work, coaching notes, and player progress.",
      true,
    ),
  validateSearch: (search: Record<string, unknown>): { desk?: string } => ({
    desk: typeof search.desk === "string" ? search.desk : undefined,
  }),
  component: AccountPage,
});

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
  return (
    <DevelopmentProvider>
      <AccountHome />
    </DevelopmentProvider>
  );
}

function AccountHome() {
  const user = useCurrentUser();
  const { desk } = Route.useSearch();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getProfile>>>();
  const [role, setRole] = useState<ClubRole>("parent");
  const [playerName, setPlayerName] = useState("");
  const [birthDate,setBirthDate]=useState("");
  const [name, setName] = useState(user?.displayName ?? "");
  const [loadError, setLoadError] = useState("");
  const [registrationAccess, setRegistrationAccess] = useState(false);
  useEffect(() => {
    let active = true;
    getRegistrationAccess()
      .then((a) => {
        if (active) setRegistrationAccess(a.allowed);
      })
      .catch(() => {
        if (active) setRegistrationAccess(false);
      });
    return () => {
      active = false;
    };
  }, []);
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
                    birthDate:role==='player'?birthDate:undefined,
                    email: user?.primaryEmail ?? "",
                  },
                });
                const next = await getProfile();
                setProfile(next);
                window.location.reload();
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
              Coaches and the front office are invited by Prospects. Sign in with your staff email
              if you already have one.
            </p>
            <label className="text-sm font-semibold">
              Athlete name
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper px-3"
              />
            </label>
            {role==='player'?<label className="grid gap-1">Your date of birth<input type="date" required max={chicagoDate()} value={birthDate} onChange={e=>setBirthDate(e.target.value)}/><span className="text-xs">Required for age eligibility. Your birthday is private to your parent/guardian and assigned team coaches.</span></label>:null}
            <Button type="submit">Save account</Button>
          </form>
        </div>
      </main>
    );
  }

  if (profile.role === "admin" && !desk)
    return <Navigate to="/office" search={{ section: "dashboard" }} />;
  if (desk === "security")
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-8">
        <a
          className="inline-flex min-h-11 items-center underline"
          href={profile.role === "admin" ? "/office" : "/account"}
        >
          Back to {profile.role === "admin" ? "Front Office" : "Account"}
        </a>
        <h1 className="text-3xl">Account → Security</h1>
        <AccountSecurity />
      </main>
    );
  return (
    <main id="main">
      {(profile.role==='admin'||profile.role==='coach'||profile.canInstruct||profile.canTeamCoach)&&<nav aria-label="My workspaces" className="mx-auto flex max-w-3xl flex-wrap gap-4 px-5 py-3"><a className="min-h-11 underline" href="/my-profile">My Shared Profile</a>{(profile.canInstruct||profile.role==='admin')&&<a className="min-h-11 underline" href="/instructor">Instructor Workspace</a>}{(profile.canTeamCoach||profile.role==='admin')&&<a className="min-h-11 underline" href="/coach">Team Coach Workspace</a>}<a className="min-h-11 underline" href="/family">Family</a></nav>}
      {profile.role === "admin" ? (
        <header className="bg-ink p-5 text-white">
          <div className="mx-auto max-w-3xl">
            <a href="/office" className="inline-flex min-h-11 items-center text-powder underline">
              Back to Front Office
            </a>
            <h1 className="text-3xl">Player Development</h1>
            <p className="text-sm">Signed in as {profile.name} · Admin</p>
          </div>
        </header>
      ) : (
        <PageHero
          compact
          eyebrow={`${ROLE_LABEL[profile.role]} · player development`}
          title={profile.name || "Your club"}
          accent="Plans, cages, and teams."
          copy={
            profile.assessment_complete
              ? "Assessment on file. Private 30s and 60s are open."
              : "No completed assessment is on file yet. Choose an assessment or explore monthly plans. Ordinary lessons and packages unlock after coach-confirmed completion."
          }
          image="/brand/training.jpg"
          actions={
            <>
              {registrationAccess ? (
                <Button asChild>
                  <a href="/registrations">Registrations & inquiries</a>
                </Button>
              ) : null}
              {profile.role === "coach" ? (
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
      )}
      <div className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link
          to="/account"
          search={{ desk: "security" }}
          className="mr-4 inline-flex min-h-11 items-center underline"
        >
          Account security
        </Link>
        <Link to="/invitations" className="inline-flex min-h-11 items-center underline">
          Your invitations
        </Link>
        <PdErrorBoundary section="Train · account">
          <PlayerBirthdays><Suspense fallback={<p role="status">Loading your workspace…</p>}>
            <PdWorkspace profile={profile} />
          </Suspense></PlayerBirthdays>
        </PdErrorBoundary>
      </div>
    </main>
  );
}
