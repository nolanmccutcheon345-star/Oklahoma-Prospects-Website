import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/coordinator/api";
import { Button } from "../ui/button";
import type { Capability } from "@/lib/coordinator/contracts";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
export function TeamOperations({
  teamId,
  allowed,
}: {
  teamId: string;
  allowed: (p: Capability) => boolean;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getCoordinatorTeamOperations>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void api
      .getCoordinatorTeamOperations({ data: teamId })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId]);
  async function run(work: () => Promise<unknown>, message = "") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setData(await api.getCoordinatorTeamOperations({ data: teamId }));
      setNotice(message);
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Could not load team information.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded border p-4" aria-label="Team operations">
      <h2 className="text-2xl">Team Openings &amp; Recruiting Needs</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading authorized team information…</p>}
      <Button disabled={busy} variant="outlineDark" onClick={() => void run(async () => {})}>
        Reload Team Information
      </Button>
      {data && (
        <>
          {allowed("rosters.read") && (
            <section aria-label="Published team player fees" className="grid gap-2">
              <h3 className="text-xl">Published player fees</h3>
              {data.publishedFees ? (
                <>
                  <p>
                    Full player:{" "}
                    {(data.publishedFees.full / 100).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </p>
                  {data.publishedFees.fullAccess !== undefined && (
                    <p>
                      With optional individual access:{" "}
                      {(data.publishedFees.fullAccess / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </p>
                  )}
                  {data.publishedFees.po !== undefined && (
                    <p>
                      Pitcher only:{" "}
                      {(data.publishedFees.po / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </p>
                  )}
                  <p>
                    Final payment due {data.publishedFees.finalDue} · Published version{" "}
                    {data.publishedFees.revision}
                  </p>
                </>
              ) : (
                <p>Awaiting admin publication for this team.</p>
              )}
            </section>
          )}
          {allowed("teams.openings") && data.openings !== undefined && (
            <form
              key={"openings:" + data.revision}
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    api.saveCoordinatorTeamOperations({
                      data: {
                        teamId,
                        revision: data.revision,
                        field: "openings",
                        value: Number(f.get("openings")),
                      },
                    }),
                  "Roster openings saved.",
                );
              }}
            >
              <label>
                Roster openings
                <input
                  className={field}
                  name="openings"
                  type="number"
                  min="0"
                  max="100"
                  required
                  defaultValue={data.openings}
                />
              </label>
              <Button type="submit" disabled={busy}>
                Save Roster Openings
              </Button>
            </form>
          )}
          {allowed("teams.needs") && data.needs !== undefined && (
            <form
              key={"needs:" + data.revision}
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    api.saveCoordinatorTeamOperations({
                      data: {
                        teamId,
                        revision: data.revision,
                        field: "needs",
                        value: String(f.get("needs") || ""),
                      },
                    }),
                  "Recruiting needs saved.",
                );
              }}
            >
              <label>
                Recruiting needs
                <textarea
                  className={field}
                  name="needs"
                  maxLength={1000}
                  defaultValue={data.needs}
                />
              </label>
              <p>
                Record positions and program needs. Keep medical, financial and private family
                information out of these notes.
              </p>
              <Button type="submit" disabled={busy}>
                Save Recruiting Needs
              </Button>
            </form>
          )}
          {allowed("teams.statistics") && data.record && (
            <p>
              Final recorded games: {data.record.wins} wins · {data.record.losses} losses ·{" "}
              {data.record.ties} ties
            </p>
          )}
        </>
      )}
    </section>
  );
}
