import { useState, useEffect } from "react";
import * as api from "@/lib/coordinator/api";
import { privacyCategories } from "@/lib/coordinator/privacy-contracts";
import { Button } from "../ui/button";
const field = "min-h-11 w-full rounded border bg-white p-2 text-ink";
export function CoordinatorPrivacy() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getCoordinatorPrivacy>>>(),
    [archive, setArchive] = useState<Awaited<ReturnType<typeof api.getCoordinatorArchiveStatus>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState<(typeof privacyCategories)[number]>("recruiting");
  async function load() {
    const [p, a] = await Promise.all([
      api.getCoordinatorPrivacy(),
      api.getCoordinatorArchiveStatus(),
    ]);
    setData(p);
    setArchive(a);
  }
  useEffect(() => {
    let live = true;
    Promise.all([api.getCoordinatorPrivacy(), api.getCoordinatorArchiveStatus()])
      .then(([p, a]) => {
        if (live) {
          setData(p);
          setArchive(a);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice("Review recorded. No account access or customer records changed.");
    } catch (e) {
      setData(undefined);
      setArchive(undefined);
      setError(e instanceof Error ? e.message : "Unable to record review.");
    } finally {
      setBusy(false);
    }
  }
  const current = data?.policies.find((p) => p.category === category);
  function review(
    category: (typeof privacyCategories)[number] | "privacy-flows",
    revision: number,
  ) {
    const evidence = window.prompt(
      "Record the review evidence, specific purpose/hold decisions and follow-up reference. Do not include private athlete details.",
    );
    if (
      !evidence ||
      !window.confirm(
        "Record this owner review? This does not claim deletion or legal certification.",
      )
    )
      return;
    void run(async () => {
      await api.saveCoordinatorPrivacyReview({
        data: { id: crypto.randomUUID(), category, revision, evidence, confirm: true },
      });
    });
  }
  return (
    <section className="grid gap-4">
      <h3 className="text-xl">Privacy & Audit Protection</h3>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Button disabled={busy} onClick={() => void run(load)}>
        Refresh Privacy Review
      </Button>
      {!data && !error && <p role="status">Loading privacy controls…</p>}
      {archive && (
        <div className="rounded border p-3">
          <h4>Audit history & provider backups</h4>
          <p>
            Audit and communication history stays append-only to normal application users. Netlify
            manages database backups outside this application; no AWS account is required.
          </p>
          <p>
            {archive.review
              ? `Owner-reviewed backup: ${archive.review.reference}`
              : "No provider backup review has been recorded."}
          </p>
          {archive.review && (
            <p>
              Snapshot: {new Date(archive.review.snapshotAt).toLocaleString()}. Recorded expiry:{" "}
              {new Date(archive.review.expiresAt).toLocaleString()}.
            </p>
          )}
          <p>
            {archive.reviewDue
              ? "Owner backup review is due."
              : "Backup evidence was reviewed within the last seven days."}
          </p>
          <p>
            {archive.review?.recoveryEvidence
              ? `Owner-reported recovery evidence: ${archive.review.recoveryEvidence}`
              : "A successful restore has not been recorded."}
          </p>
          <p>
            These are owner review records, not automated verification. Backups cover data through
            their snapshot time. They are not permanent write-locked storage and Netlify
            administrators retain control. Recording a policy here does not change Netlify backup
            retention.
          </p>
          <details>
            <summary>Record a provider backup review</summary>
            <p>
              Check Netlify → Data & Storage → Database → Backups. Enter only a backup reference,
              dates and a recovery-test reference if one exists. Do not enter credentials or athlete
              data. Do not restore over the live database to perform a test.
            </p>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  !window.confirm(
                    "Record this backup review? This records evidence only; it does not create or restore a backup.",
                  )
                )
                  return;
                void run(async () => {
                  await api.saveCoordinatorBackupReview({
                    data: {
                      id: crypto.randomUUID(),
                      reference: String(f.get("backupReference")),
                      snapshotAt: new Date(String(f.get("snapshot"))).toISOString(),
                      expiresAt: new Date(String(f.get("expires"))).toISOString(),
                      recoveryEvidence: String(f.get("recovery") || ""),
                      confirm: true,
                    },
                  });
                });
              }}
            >
              <label>
                Backup reference
                <input
                  className={field}
                  name="backupReference"
                  minLength={8}
                  maxLength={200}
                  required
                />
              </label>
              <label>
                Snapshot time (your local time)
                <input className={field} name="snapshot" type="datetime-local" required />
              </label>
              <label>
                Backup expires (your local time)
                <input className={field} name="expires" type="datetime-local" required />
              </label>
              <label>
                Recovery-test evidence (optional)
                <textarea className={field} name="recovery" maxLength={1000} />
              </label>
              <Button type="submit" disabled={busy}>
                Record Backup Review
              </Button>
            </form>
          </details>
        </div>
      )}
      {data && (
        <>
          <p>
            Record a purpose and necessary retention period for each category. Expired candidates
            require an owner review of current purpose, guardian requests and holds. This screen
            does not erase athlete, financial or audit history. Provider backup retention is managed
            separately in Netlify.
          </p>
          <label>
            Category
            <select
              className={field}
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {privacyCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <form
            key={`${category}:${current?.revision || 0}`}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                !window.confirm(
                  "Approve this purpose and retention period? This does not change provider backup settings or delete records.",
                )
              )
                return;
              void run(async () => {
                await api.saveCoordinatorPrivacyPolicy({
                  data: {
                    category,
                    revision: current?.revision || 0,
                    purpose: String(f.get("purpose")),
                    retentionDays: Number(f.get("days")),
                    legalBasis: String(f.get("basis")),
                    confirm: true,
                  },
                });
              });
            }}
          >
            <label>
              Specific purpose
              <textarea
                name="purpose"
                className={field}
                defaultValue={current?.purpose || ""}
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <label>
              Retention period in days
              <input
                name="days"
                type="number"
                className={field}
                defaultValue={current?.retentionDays || ""}
                min={1}
                max={3650}
                required
              />
            </label>
            <label>
              Reason for this period and applicable obligations
              <textarea
                name="basis"
                className={field}
                defaultValue={current?.legalBasis || ""}
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              Save Reviewed Retention Policy
            </Button>
          </form>
          {current && (
            <div>
              <p>
                Records older than this period to review:{" "}
                {data.candidates.find((p) => p.category === category)?.count || 0}. Age alone does
                not authorize deletion.
              </p>
              <Button disabled={busy} onClick={() => review(category, current.revision)}>
                Record Retention Review
              </Button>
            </div>
          )}
          <Button disabled={busy} onClick={() => review("privacy-flows", 0)}>
            Record Guardian & Privacy Flow Review
          </Button>
          <details>
            <summary>Recorded reviews</summary>
            {data.reviews.length === 0 && <p>No reviews recorded.</p>}
            {data.reviews.map((r) => (
              <article key={r.id} className="my-2 rounded border p-2">
                <p>
                  {r.category} · {r.outcome} · {new Date(r.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap break-words">{r.evidence}</p>
              </article>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
