import { useCallback, useEffect, useRef, useState } from "react";
import { getEnrollmentGuide } from "@/lib/enrollment/guide-api";
type Guide = Awaited<ReturnType<typeof getEnrollmentGuide>>;
export function ParentEnrollmentGuide({
  teamId,
  playerId,
}: {
  teamId?: string;
  playerId?: string;
}) {
  const [data, setData] = useState<Guide>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mounted = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true);
    try {
      const next = await getEnrollmentGuide();
      if (mounted.current && request === generation.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (mounted.current && request === generation.current) {
        setData(undefined);
        setError(e instanceof Error ? e.message : "Could not load enrollment progress.");
      }
    } finally {
      if (mounted.current && request === generation.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    generation.current++;
    mounted.current = true;
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    refresh();
    const events = ["focus", "pageshow", "team-budget-updated", "enrollment-progress-updated"];
    for (const event of events) window.addEventListener(event, refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, refresh);
    };
  }, [load]);
  const players = data?.players.filter(
    (p) => (!teamId || p.teamId === teamId) && (!playerId || p.playerId === playerId),
  );
  return (
    <section
      className="my-6 grid min-w-0 gap-4 break-words rounded-2xl border-2 border-navy bg-paper p-4 text-ink"
      aria-labelledby="enrollment-guide-title"
    >
      <h2 id="enrollment-guide-title" className="text-2xl">
        {data?.owner ? "Parent enrollment progress" : "Complete your player’s enrollment"}
      </h2>
      <p className="text-sm">
        Follow each player’s steps below. Signatures, fee acceptance, payment and automatic-payment
        authorization are separate actions. Progress is checked against saved records.
      </p>
      <button
        type="button"
        className="min-h-11 justify-self-start rounded border px-4"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Refreshing…" : "Refresh progress"}
      </button>
      <a className="inline-flex min-h-11 items-center underline" href="/family">
        Open payment history and receipts
      </a>
      <a className="inline-flex min-h-11 items-center font-semibold underline" href="/team-hub">Open Team Hub for announcements, schedules and coach messages</a>
      {error && (
        <p role="alert">
          Progress could not be verified: {error} Use the invited email and verify your account.{" "}
          <a className="underline" href="/invitations">
            Review invitations
          </a>{" "}
          or{" "}
          <a className="underline" href="/contact">
            contact Prospects
          </a>
          .
        </p>
      )}
      {!data && !error && <p role="status">Checking enrollment records…</p>}
      {Boolean(data?.pendingInvitations) && (
        <p className="rounded border p-3">
          Action needed: you have {data!.pendingInvitations} pending household invitation(s).{" "}
          <a
            className="inline-flex min-h-11 items-center font-semibold underline"
            href="/invitations"
          >
            Verify email and accept invitation
          </a>
          . Then refresh this guide.
        </p>
      )}
      {data && !players?.length && (
        <p>
          No player enrollment is linked here yet.{" "}
          <a href="/invitations" className="underline">
            Accept your invitation
          </a>{" "}
          using the exact invited email. If it expired, was revoked, or the player/team is missing,{" "}
          <a href="/contact" className="underline">
            ask Prospects to correct or resend the invitation
          </a>
          . Do not create another player record.
        </p>
      )}
      {players?.map((p) => {
        const next = p.steps.find((s) => !["Complete", "Not applicable"].includes(s.status));
        return (
          <article
            key={p.teamId + ":" + p.playerId + ":" + p.season}
            className="grid min-w-0 gap-3 rounded-xl border p-4"
          >
            <h3 className="text-xl font-bold">
              {p.name} · {p.team}
            </h3>
            <p>
              Season {p.season} ·{" "}
              {p.parentComplete
                ? "Parent steps completed"
                : `${p.steps.slice(0, 6).filter((s) => ["Complete", "Not applicable"].includes(s.status)).length} of 6 parent steps completed`}
            </p>
            <a
              className="inline-flex min-h-11 items-center justify-center rounded bg-navy px-4 py-2 text-white"
              href={next?.href || p.steps[6].href}
            >
              {next ? "Continue enrollment" : "Review enrollment and payments"}
            </a>
            <ol className="grid list-decimal gap-4 pl-5">
              {p.steps.map((s) => (
                <li key={s.title}>
                  <p className="font-semibold">
                    {s.title} — {s.status}
                  </p>
                  <p className="text-sm">{s.detail}</p>
                  <a className="inline-flex min-h-11 items-center underline" href={s.href}>
                    Open {s.title.toLowerCase()}
                  </a>
                </li>
              ))}
            </ol>
            <p className="text-sm">{p.participation}</p>
          </article>
        );
      })}
    </section>
  );
}
