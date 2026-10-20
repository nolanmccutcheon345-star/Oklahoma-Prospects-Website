import { useEffect, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/api";
import { Button } from "../ui/button";
import type { HistoryCursor } from "@/lib/coordinator/contracts";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
const text = (f: FormData, k: string) => String(f.get(k) || "");
export function RosterEligibilityReview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getRosterEligibilityReview>>>(),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setData(await api.getRosterEligibilityReview({ data: { search } }));
  useEffect(() => {
    let active = true;
    api
      .getRosterEligibilityReview({ data: { search: "" } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(work: () => Promise<unknown>, message = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Could not complete eligibility review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-4">
      <h3 className="text-xl">Roster Eligibility Review</h3>
      <p>
        Review identity, guardian relationship and team eligibility before clearing an existing
        athlete. A clearance permits a separately authorized coordinator to add that athlete to the
        selected team. It does not publish a profile, grant account permissions or change billing.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {});
        }}
      >
        <label>
          Find athlete
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or athlete ID"
          />
        </label>
        <Button type="submit" disabled={busy}>
          Search / Refresh
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading eligibility records…</p>}
      {data && (
        <>
          <p>Up to 100 matching records. Refine the search for older records.</p>
          {!data.candidates.length && (
            <p>No unlinked athletes with a current verified guardian match this search.</p>
          )}
          {data.candidates.map((a) => (
            <details className="rounded border p-3" key={a.id + ":" + a.guardianId}>
              <summary className="min-h-11">
                {a.name} · Guardian: {a.guardianName}
              </summary>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    !window.confirm(
                      `Clear ${a.name} for the selected team after reviewing eligibility and guardian authority?`,
                    )
                  )
                    return;
                  void run(
                    () =>
                      api.approveRosterEligibility({
                        data: {
                          id: crypto.randomUUID(),
                          athleteId: a.id,
                          guardianId: a.guardianId,
                          identityDigest: a.identityDigest,
                          clubRevision: data.clubRevision,
                          teamId: text(f, "team"),
                          expiresAt: new Date(text(f, "expires")).toISOString(),
                          reason: text(f, "reason"),
                          confirmEligibility: true,
                        },
                      }),
                    "Eligibility recorded. No athlete or account access was activated.",
                  );
                }}
              >
                <label>
                  Authorized team
                  <select className={field} name="team" required>
                    <option value="">Choose team</option>
                    {data.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.sport}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Eligibility expires
                  <input className={field} type="datetime-local" name="expires" required />
                </label>
                <label>
                  Eligibility review reason
                  <textarea
                    className={field}
                    name="reason"
                    minLength={10}
                    maxLength={1000}
                    required
                  />
                </label>
                <label>
                  <input type="checkbox" required /> I reviewed this athlete’s eligibility and the
                  verified guardian relationship for this team.
                </label>
                <Button type="submit" disabled={busy}>
                  Record Eligibility Clearance
                </Button>
              </form>
            </details>
          ))}
          <h4 className="text-lg">Recent matching decisions</h4>
          {data.clearances.map((c) => (
            <div className="rounded border p-3" key={c.id}>
              <p>
                {c.name} · {data.teams.find((t) => t.id === c.teamId)?.name || c.teamId} ·{" "}
                {c.status} · Expires {new Date(c.expiresAt).toLocaleString()}
              </p>
              {c.status === "approved" && (
                <Button
                  disabled={busy}
                  variant="outlineDark"
                  onClick={() => {
                    const reason = window.prompt(
                      "Reason for withdrawing eligibility (at least 10 characters):",
                    );
                    if (reason)
                      void run(
                        () =>
                          api.revokeRosterEligibility({
                            data: { id: c.id, revision: c.revision, reason },
                          }),
                        "Eligibility withdrawn. Existing roster and account records were preserved.",
                      );
                  }}
                >
                  Withdraw Eligibility
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function EligibleRosterAthletes({
  teamId,
  onAdded,
}: {
  teamId: string;
  onAdded: () => Promise<void>;
}) {
  const [data, setData] =
      useState<Awaited<ReturnType<typeof api.getEligibleCoordinatorAthletes>>>(),
    [before, setBefore] = useState<HistoryCursor>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () =>
    setData(await api.getEligibleCoordinatorAthletes({ data: { teamId, before } }));
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    api
      .getEligibleCoordinatorAthletes({ data: { teamId, before } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId, before]);
  async function add(item: NonNullable<typeof data>["items"][number]) {
    if (
      !data ||
      busy ||
      !window.confirm(
        `Add ${item.name} to this team using the owner-reviewed eligibility clearance?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.addEligibleCoordinatorAthlete({
        data: {
          id: item.id,
          teamId,
          revision: item.revision,
          clubRevision: data.clubRevision,
          confirm: true,
        },
      });
      await load();
      await onAdded();
      setNotice("Athlete added. Public profile remains private.");
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Could not add this athlete.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded border p-3">
      <h3 className="text-xl">Eligible Athletes</h3>
      <p>
        Only current owner-reviewed eligibility clearances appear. Missing or changed guardian
        relationships require a fresh owner review.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading eligible athletes…</p>}
      <Button
        disabled={busy}
        variant="outlineDark"
        onClick={() => {
          setError("");
          void load().catch((e) => {
            setData(undefined);
            setError(e.message);
          });
        }}
      >
        Refresh Eligible Athletes
      </Button>
      {data && !data.items.length && <p>No eligible athletes on this page.</p>}
      {data?.items.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3">
          <span>{a.name}</span>
          <Button disabled={busy} onClick={() => void add(a)}>
            Add to Roster
          </Button>
        </div>
      ))}
      <div className="flex gap-3">
        {before && (
          <Button variant="outlineDark" onClick={() => setBefore(undefined)}>
            Newest Clearances
          </Button>
        )}
        {data?.nextCursor && (
          <Button variant="outlineDark" onClick={() => setBefore(data.nextCursor!)}>
            Older Clearances
          </Button>
        )}
      </div>
    </section>
  );
}
export function RoutinePlayerInformation({
  teamId,
  player,
  onSaved,
}: {
  teamId: string;
  player: Awaited<ReturnType<typeof api.getCoordinatorRoster>>[number];
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api.saveCoordinatorPlayerInformation({
        data: {
          teamId,
          playerId: player.id,
          revision: player.revision,
          bats: text(f, "bats") as "" | "R" | "L" | "S",
          throws: text(f, "throws") as "" | "R" | "L",
          gradYear: text(f, "gradYear"),
          school: text(f, "school"),
        },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save player information.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="min-h-11">Edit Routine Player Information</summary>
      <form className="grid gap-3" onSubmit={save}>
        {error && <p role="alert">{error}</p>}
        {(["bats", "throws"] as const).map((k) => (
          <label key={k}>
            {k === "bats" ? "Bats" : "Throws"}
            <select className={field} name={k} defaultValue={player[k]}>
              <option value="">Unspecified</option>
              <option value="R">Right</option>
              <option value="L">Left</option>
              {k === "bats" && <option value="S">Switch</option>}
            </select>
          </label>
        ))}
        <label>
          Graduation year
          <input
            className={field}
            name="gradYear"
            defaultValue={player.gradYear}
            pattern="[0-9]{4}"
            maxLength={4}
          />
        </label>
        <label>
          School
          <input className={field} name="school" defaultValue={player.school} maxLength={160} />
        </label>
        <Button type="submit" disabled={busy}>
          Save Routine Information
        </Button>
      </form>
    </details>
  );
}
