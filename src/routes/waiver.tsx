import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getFamilyBilling } from "@/lib/commerce/portal-api";
import { getMyWaivers, saveAnnualWaiver } from "@/lib/portal-api";
import { ROSTER_CONSENT_TEXT } from "@/lib/roster-consent";
import { WAIVER_PARAGRAPHS } from "@/lib/waiver-content";
import { CLUB } from "@/lib/club";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { AddAthlete } from "@/components/commerce/athletes";
export const Route = createFileRoute("/waiver")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { athleteId?: string; teamId?: string; playerId?: string } => ({
    athleteId: typeof search.athleteId === "string" ? search.athleteId.slice(0, 200) : "",
    teamId: typeof search.teamId === "string" ? search.teamId.slice(0, 200) : "",
    playerId: typeof search.playerId === "string" ? search.playerId.slice(0, 200) : "",
  }),
  head: () =>
    pageHead(
      "/waiver",
      "Annual Facility Waiver",
      "Read and sign the annual facility waiver for athletes in your household.",
      true,
    ),
  component: Waiver,
});
function Waiver() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const inFlight = useRef(false);
  const [selected, setSelected] = useState(search.athleteId || "");
  const [loaded, setLoaded] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const returnUrl =
    search.teamId && search.playerId
      ? `/enrollment?${new URLSearchParams({ teamId: search.teamId, playerId: search.playerId })}`
      : "/enrollment";
  const nextUrl =
    "/waiver?" +
    new URLSearchParams({
      athleteId: search.athleteId || "",
      teamId: search.teamId || "",
      playerId: search.playerId || "",
    });
  const [athletes, setAthletes] = useState<
    Awaited<ReturnType<typeof getFamilyBilling>>["athletes"]
  >([]);
  const [waivers, setWaivers] = useState<Awaited<ReturnType<typeof getMyWaivers>>>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Awaited<ReturnType<typeof saveAnnualWaiver>> | null>(null);
  async function load() {
    const [billing, records] = await Promise.all([getFamilyBilling(), getMyWaivers()]);
    setAthletes(billing.athletes);
    setWaivers(records);
    setLoaded(true);
    setRefreshError("");
  }
  const userId = user?.id;
  useEffect(() => {
    let current = true;
    setLoaded(false);
    setAthletes([]);
    setWaivers([]);
    setReceipt(null);
    setError("");
    setRefreshError("");
    if (userId)
      void Promise.all([getFamilyBilling(), getMyWaivers()])
        .then(([billing, records]) => {
          if (!current) return;
          setAthletes(billing.athletes);
          setWaivers(records);
          setLoaded(true);
        })
        .catch((e) => {
          if (current) setError(e instanceof Error ? e.message : "Could not load waiver status.");
        });
    return () => {
      current = false;
    };
  }, [userId]);
  return (
    <main id="main">
      <PageHero
        eyebrow="Required before you train"
        title="One waiver."
        accent="One year."
        copy={`Parent or guardian signs for athletes under 18. This is the ${CLUB.venueName} waiver.`}
        compact
      />
      <section className="mx-auto grid max-w-3xl gap-5 px-5 py-8">
        <article className="rounded-xl bg-ink p-5 text-fg-inverse">
          <h2 className="text-2xl">Facility Waiver & Release</h2>
          {WAIVER_PARAGRAPHS.map((p) => (
            <p className="mt-3" key={p}>
              {p}
            </p>
          ))}
        </article>
        {!user ? (
          <p>
            <Link to="/login" search={{ next: nextUrl }} className="underline">
              Sign in or create an account
            </Link>{" "}
            to attach a signed waiver to your athlete.
          </p>
        ) : (
          <>
            <a href={returnUrl} className="inline-flex min-h-11 items-center underline">
              Return to player enrollment
            </a>
            {!loaded && !error && (
              <p role="status">Loading your household athletes and saved waivers…</p>
            )}
            {waivers.map((w) => (
              <p role="status" key={w.id}>
                {w.athlete_name} · signed by {w.signer_name} · valid through{" "}
                {new Date(w.expires_at).toLocaleDateString("en-US", {
                  timeZone: "America/Chicago",
                })}
              </p>
            ))}
            {loaded && (
              <details>
                <summary className="min-h-11 cursor-pointer">My athlete is not listed</summary>
                <p>
                  Use an existing athlete below whenever possible. If your roster athlete is
                  missing, contact Prospects before adding a duplicate.
                </p>
                <AddAthlete onSaved={load} />
              </details>
            )}
            <label>
              Athlete
              <select
                name="athlete"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setReceipt(null);
                  setError("");
                }}
                disabled={!loaded || busy}
              >
                <option value="">Choose an athlete</option>
                {athletes.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {loaded && search.athleteId && !athletes.some((a) => a.id === search.athleteId) && (
              <p role="alert">
                This athlete is not available in your household. Return to enrollment or contact
                Prospects to verify the link.
              </p>
            )}
            {waivers.some((w) => w.athlete_id === selected) ? (
              <p role="status">
                A current waiver is already on file for this athlete. You do not need to sign again.
                For corrections to signed details, contact Prospects; your original signature will
                be preserved.
              </p>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  const f = new FormData(e.currentTarget);
                  if (inFlight.current) return;
                  inFlight.current = true;
                  setBusy(true);
                  setError("");
                  setReceipt(null);
                  setRefreshError("");
                  try {
                    if (f.get("rosterConsent") !== "on")
                      throw new Error("Please agree to the public roster consent before signing.");
                    if (f.get("consent") !== "on")
                      throw new Error("Please agree to the waiver before signing.");
                    const result = await saveAnnualWaiver({
                      data: {
                        athleteId: selected,
                        adultName: String(f.get("adultName")),
                        adultPhone: String(f.get("adultPhone")),
                        participantType: f.get("participantType") as "adult" | "minor",
                        emergencyName: String(f.get("emergencyName")),
                        emergencyPhone: String(f.get("emergencyPhone")),
                        signerName: String(f.get("signerName")),
                        relationship: f.get("relationship") as "self" | "parent" | "legal-guardian",
                        medicalNotes: String(f.get("medicalNotes") || ""),
                        consent: true,
                        rosterConsent: true,
                      },
                    });
                    setReceipt(result);
                    try {
                      await load();
                    } catch {
                      setRefreshError(
                        "Your signature is confirmed, but the status list could not refresh. Refresh status to check it; do not sign again.",
                      );
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Waiver did not save.");
                  } finally {
                    inFlight.current = false;
                    setBusy(false);
                  }
                }}
              >
                {(
                  [
                    ["adultName", "Responsible adult name"],
                    ["adultPhone", "Adult mobile"],
                    ["emergencyName", "Emergency contact"],
                    ["emergencyPhone", "Emergency phone"],
                    ["signerName", "Electronic signature (full legal name)"],
                  ] as const
                ).map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      required
                      maxLength={120}
                      type={name.includes("Phone") ? "tel" : "text"}
                    />
                  </label>
                ))}
                <label>
                  Participant
                  <select name="participantType" required defaultValue="">
                    <option value="">Choose participant type</option>
                    <option value="minor">Minor (under 18)</option>
                    <option value="adult">Adult (18 or older)</option>
                  </select>
                </label>
                <label>
                  Relationship to participant
                  <select name="relationship" required defaultValue="">
                    <option value="">Choose relationship</option>
                    <option value="parent">Parent</option>
                    <option value="legal-guardian">Legal guardian</option>
                    <option value="self">Adult participant signing for myself</option>
                  </select>
                </label>
                <label>
                  Medical information staff should know (optional)
                  <textarea name="medicalNotes" maxLength={2000} />
                </label>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="consent" required />I have read the Facility Waiver &
                  Release above, understand sports training involves risk of injury, and I am
                  legally authorized to sign.
                </label>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="rosterConsent" required />
                  {ROSTER_CONSENT_TEXT} I am the adult participant or the participant’s parent or
                  legal guardian and agree to this public roster consent.
                </label>
                <Button
                  type="submit"
                  disabled={busy || !loaded || !athletes.some((a) => a.id === selected)}
                >
                  {busy ? "Saving…" : "Sign the annual waiver"}
                </Button>
                <p>Saved to your household account for check-in across devices.</p>
              </form>
            )}
          </>
        )}
        {error ? (
          <p role="alert" className="text-maroon">
            {error}
          </p>
        ) : null}
        {receipt ? (
          <p role="status">
            {receipt.outcome === "saved"
              ? "Your signed waiver is saved."
              : receipt.outcome === "already-on-file"
                ? "This signed waiver is already on file."
                : "Your original waiver is on file. The changed details were not saved. Contact Prospects to request a correction; do not sign again."}{" "}
            Signed{" "}
            {new Date(receipt.receipt.signedAt).toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
            })}
            . Receipt: {receipt.receipt.id}
          </p>
        ) : null}
        {(refreshError || error) && (
          <div>
            <p role="alert">{refreshError}</p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                void load().catch(() =>
                  setRefreshError(
                    "Could not refresh status. Your saved signature has not been changed.",
                  ),
                );
              }}
            >
              Refresh waiver status
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
