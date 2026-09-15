import {pageHead} from "@/lib/seo";
import { FamilyBilling } from "@/components/commerce/family-billing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FamilyApp } from "@/components/teams/family-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { Button } from "@/components/ui/button";
import { getTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/family")({head:()=>pageHead("/family","Family Account","Manage your household athletes, bookings, receipts, and memberships.",true), component: Page });

function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading family desk…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <FamilyPage />;
}

function FamilyPage() {
  const [lang, setLang] = useState<"en" | "es">("en");
  const [familyId, setFamilyId] = useState("");
  const [state, setState] = useState<Awaited<ReturnType<typeof getTeamsClub>>>();
  const [club, setClub] = useState<ClubRecord>();
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    const row = await getTeamsClub();
    setState(row);
        if (row.ok) {
          setClub(row.club);
          setFamilyId(row.me.familyId);
        }
  }

  useEffect(() => {
    load().catch((err: Error) => {
      const message = err.message || "Could not load the club.";
      setError(message === "Unauthorized" ? "signin" : message);
    });
  }, []);

  if (error === "signin") return <RedirectToSignIn />;
  if (error) return <FailScreen message={error} />;
  if (!state) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading family desk…</p>
      </main>
    );
  }
  if (state.missing || !club) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Family desk
        </p>
        <h1 className="mt-2 text-4xl">Your family account</h1>
        <FamilyBilling />
        <h2 className="mt-8 text-2xl">Team roster</h2>
        <p className="mt-3 text-muted">
          The office opens this desk after they add your player. Meanwhile you can
          still book cages, sign the waiver, and start training.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/book">Reserve a cage</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/training">Monthly coaching</Link>
          </Button>
          <Button asChild variant="outlineDark">
            <Link to="/waiver">Sign the waiver</Link>
          </Button>
        </div>
      </main>
    );
  }

  const familyOptions = Array.from(
    new Map(
      club.teams.flatMap((team) =>
        team.roster.map((player) => [
          player.familyId,
          `${player.name} · ${team.name}`,
        ] as const),
      ),
    ).entries(),
  );

  return (
    <TeamsShell
      title={lang === "es" ? "Familia" : "Family"}
      path="/family"
      demo={club._demo}
      lang={lang}
      onLang={setLang}
      nav={[
        { to: "/family", label: lang === "es" ? "Familia" : "Family" },
        ...(state.role === "coach" || state.role === "admin"
          ? [{ to: "/coach", label: "Coach" }]
          : []),
        ...(state.role === "admin" ? [{ to: "/office", label: "Office" }] : []),
        { to: "/account", label: "Lessons" },
      ]}
    >
      {state.role === "admin" && club ? (
        <label className="mb-3 block text-sm font-semibold">
          View family
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-line px-3 font-normal"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            {familyOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <FamilyBilling />
      <FamilyApp
        club={club}
        familyId={familyId || state.me.familyId}
        isPlayer={state.role === "player"}
        lang={lang}
        onChange={setClub}
        onReload={load}
      />
      <Button
        type="button"
        className="mt-4 w-full"
        onClick={async () => {
          try {
            setSaveError("");
            const savedClub = await saveTeamsClub({ data: { club, baseRev: club._rev } });
            setClub(savedClub.club);
            setSaved("Family record saved.");
          } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      >
        Save family record
      </Button>
      {saved ? (
        <p className="mt-2 text-sm" aria-live="polite">
          {saved}
        </p>
      ) : null}
      {saveError ? (
        <p className="mt-2 text-sm text-maroon" role="alert">
          {saveError}
        </p>
      ) : null}
    </TeamsShell>
  );
}
