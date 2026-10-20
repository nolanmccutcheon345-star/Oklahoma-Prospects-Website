import { useRef, useState } from "react";
import {
  getOrganizationAccessPreview,
  grantOrganizationAccess,
} from "@/lib/coordinator/organization-access-api";
import type { OrganizationAccessPreview } from "@/lib/coordinator/organization-access-contracts";
export function OrganizationAccess({
  accounts,
}: {
  accounts: { id: string; name: string; email: string }[];
}) {
  const [userId, setUserId] = useState("");
  const [review, setReview] = useState<OrganizationAccessPreview>();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function run(apply: boolean) {
    if (pending.current || !userId) return;
    if (
      apply &&
      (!review?.ready || !review.basisVersion || !confirmed || reason.trim().length < 10)
    )
      return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (apply && review && review.basisVersion) {
        await grantOrganizationAccess({
          data: {
            userId: review.userId,
            reviewDigest: review.reviewDigest,
            expectedRelease: review.release,
            expectedBasisVersion: review.basisVersion,
            expectedRevision: review.revision,
            confirmed: true,
            reason: reason.trim(),
          },
        });
        setReview(undefined);
        setConfirmed(false);
        setReason("");
        setMessage("Organization operational access saved. Review again before another change.");
      } else {
        setReview(await getOrganizationAccessPreview({ data: { userId } }));
        setConfirmed(false);
      }
    } catch (error) {
      setReview(undefined);
      setConfirmed(false);
      setMessage(error instanceof Error ? error.message : "Access review failed.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Organization operational access"
      className="grid gap-4 rounded border border-line p-4"
    >
      <h3>Organization operational access</h3>
      <p>
        Review the existing account and exact release before granting organization-wide nonfinancial
        access.
      </p>
      <fieldset disabled={busy} className="grid gap-3">
        <label>
          Existing account
          <select
            aria-label="Existing account"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setReview(undefined);
              setConfirmed(false);
              setReason("");
              setMessage("");
            }}
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.email})
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!userId} onClick={() => void run(false)}>
          Review operational access
        </button>
        {review && (
          <div className="grid gap-3">
            <p>
              {review.name} ({review.email}) · Current status: {review.currentStatus}
            </p>
            <p>
              Release: {review.release || "Unavailable"}; financial basis:{" "}
              {review.basisVersion ?? "Not active"}
            </p>
            <h4>Operational scope</h4>
            <ul>
              {review.scope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4>Excluded access</h4>
            <ul>
              {review.exclusions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {review.blockers.map((item) => (
              <p role="alert" key={item}>
                {item}
              </p>
            ))}
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={10}
                maxLength={1000}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed this existing account, scope, exclusions and release.
            </label>
            <button
              type="button"
              disabled={!review.ready || !confirmed || reason.trim().length < 10}
              onClick={() => void run(true)}
            >
              Grant reviewed operational access
            </button>
          </div>
        )}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
