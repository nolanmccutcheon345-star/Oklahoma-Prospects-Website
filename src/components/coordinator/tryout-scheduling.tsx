import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/api";
import type { Capability, HistoryCursor } from "@/lib/coordinator/contracts";
import type { z } from "zod";
import type { scopedTryoutSaveInput } from "@/lib/coordinator/tryout-scheduling-contracts";
import { Button } from "../ui/button";
type Workspace = Awaited<ReturnType<typeof api.getCoordinatorTryoutSchedule>>;
type Event = Workspace["items"][number];
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
export function TryoutScheduling({
  teamId,
  allowed,
}: {
  teamId: string;
  allowed: (p: Capability) => boolean;
}) {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [before, setBefore] = useState<HistoryCursor>();
  const pending = useRef(false);
  const load = useCallback(
    () => api.getCoordinatorTryoutSchedule({ data: { teamId, before } }),
    [teamId, before],
  );
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    setData(undefined);
    setError("");
    void load()
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Unable to load tryouts");
      });
    return () => {
      active = false;
    };
  }, [load, teamId]);
  async function run(work: () => Promise<unknown>) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setData(await load());
      setNotice("Saved. Review the current event status below.");
      return true;
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (!teamId) return <p>Select an authorized team.</p>;
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl">Tryout scheduling</h2>
      <p>
        New tryouts remain private drafts. Publication, cancellation and changes to published
        tryouts require owner approval. Shared cage and coach availability is checked when a change
        is saved or approved.
      </p>
      <Button variant="outlineDark" disabled={busy} onClick={() => void run(async () => {})}>
        Refresh tryouts
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p>Loading authorized tryouts…</p>}
      {data && (
        <>
          {allowed("tryouts.create") && (
            <TryoutForm
              key={"new-" + teamId}
              teamId={teamId}
              coaches={data.coaches}
              busy={busy}
              allowed={allowed}
              save={run}
            />
          )}
          {data.items.length === 0 && <p>No authorized tryouts on this page.</p>}
          {data.items.map((e) => (
            <article key={e.id} className="grid gap-3 rounded border p-4">
              <h3 className="text-xl">
                {e.season} · {e.ageGroups.join(", ")} · {e.status}
              </h3>
              <p>
                {e.date} · {e.startTime}–{e.endTime} Central · {e.location}
              </p>
              <p>Cages: {e.laneIds.join(", ") || "None"}</p>
              {allowed("tryouts.update") && (
                <details>
                  <summary>Edit or request owner review</summary>
                  <TryoutForm
                    key={e.id + e.revision}
                    event={e}
                    teamId={teamId}
                    coaches={data.coaches}
                    busy={busy}
                    allowed={allowed}
                    save={run}
                  />
                </details>
              )}
            </article>
          ))}
          <div className="flex gap-2">
            {before && (
              <Button variant="outlineDark" onClick={() => setBefore(undefined)}>
                Newest tryouts
              </Button>
            )}
            {data.nextCursor && (
              <Button variant="outlineDark" onClick={() => setBefore(data.nextCursor!)}>
                Older tryouts
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function TryoutForm({
  event,
  teamId,
  coaches,
  busy,
  allowed,
  save,
}: {
  event?: Event;
  teamId: string;
  coaches: Workspace["coaches"];
  busy: boolean;
  allowed: (p: Capability) => boolean;
  save: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const identity = useRef<string>(undefined),
    reviewId = useRef<string>(undefined);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form),
      str = (k: string) => String(f.get(k) || "");
    identity.current ??= crypto.randomUUID();
    const change: z.infer<typeof scopedTryoutSaveInput> = {
      id: event?.id || identity.current,
      revision: event?.revision || 0,
      teamId,
      season: str("season"),
      ageGroups: str("ages")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      date: str("date"),
      startTime: str("start"),
      endTime: str("end"),
      location: str("location"),
      capacity: Number(str("capacity")),
      coachId: str("coach"),
      laneIds: f.getAll("lanes") as z.infer<typeof scopedTryoutSaveInput>["laneIds"],
      reason: str("reason"),
    };
    const status = str("action");
    if (status === "draft") {
      if ((await save(() => api.saveCoordinatorTryout({ data: change }))) && !event) {
        identity.current = undefined;
        form.reset();
      }
      return;
    }
    if (
      !window.confirm(
        `Submit this exact ${status === "cancelled" ? "cancellation" : "publication or schedule change"} for owner approval? Nothing changes until approved.`,
      )
    )
      return;
    reviewId.current ??= crypto.randomUUID();
    const saved = await save(() =>
      api.requestCoordinatorTryoutReview({
        data: {
          id: reviewId.current!,
          change,
          status: status as "published" | "cancelled",
          confirm: true,
        },
      }),
    );
    if (saved) reviewId.current = undefined;
  }
  return (
    <form className="grid gap-3 rounded border p-4" onSubmit={(e) => void submit(e)}>
      <h3 className="text-lg">{event ? "Proposed tryout details" : "Create private tryout"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Season
          <input
            className={field}
            name="season"
            required
            maxLength={120}
            defaultValue={event?.season}
          />
        </label>
        <label>
          Age groups, separated by commas
          <input
            className={field}
            name="ages"
            required
            maxLength={500}
            defaultValue={event?.ageGroups.join(", ")}
          />
        </label>
        <label>
          Date
          <input className={field} type="date" name="date" required defaultValue={event?.date} />
        </label>
        <label>
          Start, Central
          <input
            className={field}
            type="time"
            step={300}
            name="start"
            required
            defaultValue={event?.startTime}
          />
        </label>
        <label>
          End, Central
          <input
            className={field}
            type="time"
            step={300}
            name="end"
            required
            defaultValue={event?.endTime}
          />
        </label>
        <label>
          Capacity
          <input
            className={field}
            type="number"
            min={1}
            max={1000}
            name="capacity"
            required
            defaultValue={event?.capacity || 20}
          />
        </label>
      </div>
      <label>
        Location
        <input
          className={field}
          name="location"
          required
          maxLength={500}
          defaultValue={event?.location}
        />
      </label>
      <label>
        Coach
        <select className={field} name="coach" required defaultValue={event?.coachId || ""}>
          <option value="">Select active coach</option>
          {coaches.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Shared cages</legend>
        <div className="flex flex-wrap gap-4">
          {(["1", "2", "3-4", "5", "6", "7"] as const).map((id) => (
            <label key={id}>
              <input
                name="lanes"
                type="checkbox"
                value={id}
                defaultChecked={event?.laneIds.includes(id)}
              />{" "}
              Cage {id}
            </label>
          ))}
        </div>
        <p className="text-sm">
          Cage reservation, change and release each require their own permission.
        </p>
      </fieldset>
      <label>
        Reason
        <textarea className={field} name="reason" required minLength={10} maxLength={500} />
      </label>
      <label>
        Action
        <select name="action" className={field}>
          {(!event || event.status === "draft") && (
            <option value="draft">Save private draft</option>
          )}
          {event && allowed("events.review.request") && (
            <>
              <option value="published">Request publication or published schedule change</option>
              {allowed("events.cancel.request") && (
                <option value="cancelled">Request cancellation</option>
              )}
            </>
          )}
        </select>
      </label>
      <Button
        type="submit"
        disabled={
          busy || Boolean(event && event.status !== "draft" && !allowed("events.review.request"))
        }
      >
        Save or submit selected action
      </Button>
    </form>
  );
}
