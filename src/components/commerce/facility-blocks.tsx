import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import * as api from "@/lib/commerce/facility-blocks-api";
import type { FacilityBlockInput } from "@/lib/commerce/facility-block-contracts";
const spaces = [
  ["1", "Lane 1"],
  ["2", "Lane 2"],
  ["3-4", "Fielding area (lanes 3–4)"],
  ["5", "Lane 5"],
  ["6", "Lane 6"],
  ["7", "Lane 7"],
];
const when = (at: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(at));
export function FacilityBlocks() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getFacilityBlocks>>>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const request = useRef<FacilityBlockInput | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const refresh = async () => setRows(await api.getFacilityBlocks());
  useEffect(() => {
    let live = true;
    api
      .getFacilityBlocks()
      .then((r) => {
        if (live) setRows(r);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function save(f: FormData) {
    if (busy) return;
    request.current ??= {
      id: crypto.randomUUID(),
      title: String(f.get("title")),
      date: String(f.get("date")),
      time: String(f.get("time")),
      duration: Number(f.get("duration")),
      laneIds: f.getAll("laneIds") as FacilityBlockInput["laneIds"],
    };
    setBusy(true);
    setMessage("");
    try {
      await api.createFacilityBlock({ data: request.current });
      request.current = null;
      form.current?.reset();
      await refresh();
      setMessage("Facility block saved. These spaces are reserved in the shared booking schedule.");
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : "Save could not be verified.") +
          " Reload the list before starting a new request. Retry uses the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-2xl">Facility space blocks</h2>
      <p>
        Owner-only reservations for workouts and facility use. No payment, team fee or family
        message is created. All times are Central. Conflicts reject the entire block.
      </p>
      <p role="status">{message}</p>
      {!rows ? (
        <p>
          {message
            ? "Owner access or loading failed. No block created."
            : "Loading facility blocks…"}
        </p>
      ) : (
        <>
          <form
            ref={form}
            onSubmit={(e) => {
              e.preventDefault();
              void save(new FormData(e.currentTarget));
            }}
          >
            <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
              <label>
                Block title
                <input
                  required
                  name="title"
                  minLength={2}
                  maxLength={140}
                  className="block min-h-11 w-full border p-2"
                />
              </label>
              <label>
                Date
                <input
                  required
                  type="date"
                  name="date"
                  className="block min-h-11 w-full border p-2"
                />
              </label>
              <label>
                Start time (Central)
                <input
                  required
                  type="time"
                  step="1800"
                  name="time"
                  className="block min-h-11 w-full border p-2"
                />
              </label>
              <label>
                Duration
                <select
                  name="duration"
                  defaultValue="120"
                  className="block min-h-11 w-full border p-2"
                >
                  {[30, 60, 90, 120, 150, 180].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Spaces to reserve</legend>
                {spaces.map(([id, label]) => (
                  <label className="flex min-h-11 items-center gap-2" key={id}>
                    <input name="laneIds" type="checkbox" value={id} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <Button type="submit">
                {busy ? "Saving…" : request.current ? "Retry Same Block" : "Reserve Facility Space"}
              </Button>
            </fieldset>
          </form>
          <Button
            disabled={busy}
            variant="outlineDark"
            onClick={() => {
              void refresh()
                .then(() => setMessage("Block list refreshed."))
                .catch((e) => setMessage(e.message));
            }}
          >
            Refresh Blocks
          </Button>
          {request.current && (
            <Button
              disabled={busy}
              variant="outlineDark"
              onClick={() => {
                request.current = null;
                setMessage(
                  "New request enabled. Check the block list first to avoid duplicating a completed reservation.",
                );
              }}
            >
              Start New Request
            </Button>
          )}
          {!rows.length && (
            <p>
              No recent facility blocks. This does not prove space is available; other reservations
              are checked on save.
            </p>
          )}
          {rows.map((r) => (
            <article key={r.id} className="my-3 rounded border p-3">
              <h3>{r.title}</h3>
              <p>
                {when(r.startsAt)} to {when(r.endsAt)} Central
              </p>
              <p>
                {r.laneIds.map((id) => spaces.find((s) => s[0] === id)?.[1] || id).join(", ")} ·{" "}
                {r.status}
              </p>
              {r.status === "confirmed" &&
                (confirm === r.id ? (
                  <>
                    <p>Release these spaces back to customer booking?</p>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void api
                          .cancelFacilityBlock({ data: { id: r.id } })
                          .then(refresh)
                          .then(() => {
                            setConfirm(null);
                            setMessage("Block cancelled. Its spaces are released.");
                          })
                          .catch((e) => setMessage(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Confirm Release
                    </Button>
                    <Button disabled={busy} variant="outlineDark" onClick={() => setConfirm(null)}>
                      Keep Block
                    </Button>
                  </>
                ) : (
                  <Button disabled={busy} variant="outlineDark" onClick={() => setConfirm(r.id)}>
                    Cancel Block
                  </Button>
                ))}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
