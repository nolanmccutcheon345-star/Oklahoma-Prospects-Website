import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn, SignedIn, SignedOut } from "@/lib/auth/gates";
import { FamilyApp } from "@/components/teams/family-app";
import { FailScreen } from "@/components/teams/ui";
import { TeamsShell } from "@/components/teams/shell";
import { getTeamsClub, saveTeamsClub } from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export const Route = createFileRoute("/family")({ component: Page });

function Page() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <FamilyPage />
      </SignedIn>
    </>
  );
}

function FamilyPage() {
  const [lang, setLang] = useState<"en" | "es">("en");
  const [familyId, setFamilyId] = useState("");
  const [state, setState] = useState<Awaited<ReturnType<typeof getTeamsClub>>>();
  const [club, setClub] = useState<ClubRecord>();
  const [error, setError] = useState("");

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
  if (!state) return <p className="p-6">Loading club…</p>;
  if (state.missing || !club) {
    return <FailScreen message="Front office has not opened the club record yet." />;
  }

  return (
    <TeamsShell
      title={lang === "es" ? "Familia" : "Family"}
      path="/family"
      demo={club._demo}
      lang={lang}
      onLang={setLang}
      nav={[
        { to: "/family", label: lang === "es" ? "Familia" : "Family" },
        { to: "/coach", label: "Coach" },
        { to: "/account", label: "Development" },
      ]}
    >
      {state.role === "admin" && club ? (
        <label className="mb-3 block text-sm">
          View family
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-line px-3"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            {Array.from(new Set(club.teams.flatMap((t) => t.roster.map((p) => p.familyId)))).map(
              (id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ),
            )}
          </select>
        </label>
      ) : null}
      <FamilyApp
        club={club}
        familyId={familyId || state.me.familyId}
        isPlayer={state.role === "player"}
        lang={lang}
        onChange={setClub}
        onReload={load}
      />
      <button
        type="button"
        className="mt-4 min-h-11 text-sm font-semibold"
        onClick={async () => {
          try {
            const saved = await saveTeamsClub({ data: { club, baseRev: club._rev } });
            setClub(saved.club);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      >
        Save family record
      </button>
    </TeamsShell>
  );
}
