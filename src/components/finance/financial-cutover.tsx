import { useRef, useState } from "react";
import * as api from "@/lib/finance/cutover-api";
import { financialCaptureInput, financialRefreshInput } from "@/lib/finance/cutover-contracts";
import { financialBasisActivationInput } from "@/lib/finance/activation-contracts";
type Kind = "capture" | "refresh" | "activation";
type Review = { kind: Kind; data: Record<string, unknown> };
export function FinancialCutover() {
  const [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function preview(kind: Kind) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setReview(undefined);
    setConfirmed(false);
    setReason("");
    setMessage("");
    try {
      const result =
        kind === "capture"
          ? await api.getFinancialCapturePreview()
          : kind === "refresh"
            ? await api.getFinancialRefreshPreview()
            : await api.getFinancialActivationPreview();
      setReview({ kind, data: result });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const ready =
    review &&
    (review.kind === "capture" ||
      (review.kind === "refresh" && review.data.refreshAllowed === true) ||
      (review.kind === "activation" && review.data.readyForActivation === true));
  async function apply() {
    if (pending.current || !review || !ready || !confirmed || reason.trim().length < 10) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const schema =
        review.kind === "capture"
          ? financialCaptureInput
          : review.kind === "refresh"
            ? financialRefreshInput
            : financialBasisActivationInput;
      const raw = { ...review.data, confirmed: true, reason: reason.trim() };
      const selected = Object.fromEntries(
        Object.keys(schema.shape).map((key) => [key, raw[key as keyof typeof raw]]),
      );
      if (review.kind === "capture")
        await api.captureFinancialBasis({ data: financialCaptureInput.parse(selected) });
      else if (review.kind === "refresh")
        await api.refreshFinancialBasis({ data: financialRefreshInput.parse(selected) });
      else
        await api.activateFinancialBasis({ data: financialBasisActivationInput.parse(selected) });
      setMessage(`Reviewed ${review.kind} saved. Review each next step separately.`);
      setReview(undefined);
      setConfirmed(false);
      setReason("");
    } catch (e) {
      setReview(undefined);
      setConfirmed(false);
      setMessage(e instanceof Error ? e.message : "Could not apply reviewed change.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Financial preservation cutover" className="grid gap-4 rounded border p-4">
      <h3>Operational Cutover</h3>
      <p>
        Owner-only review of existing financial commitments. Each action requires a fresh exact
        review. Capturing or refreshing does not activate access or grant an account.
      </p>
      <fieldset disabled={busy} className="grid gap-3">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void preview("capture")}>
            Review initial capture
          </button>
          <button type="button" onClick={() => void preview("refresh")}>
            Review captured source refresh
          </button>
          <button type="button" onClick={() => void preview("activation")}>
            Review activation
          </button>
        </div>
        {review && (
          <>
            <h4>Review {review.kind}</h4>
            <pre
              className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words"
              aria-label="Complete owner review evidence"
            >
              {JSON.stringify(review.data, null, 2)}
            </pre>
            {!ready && <p role="alert">Resolve all review blockers before applying this change.</p>}
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
              I reviewed the complete evidence and exact financial-preservation action.
            </label>
            <button
              type="button"
              disabled={!ready || !confirmed || reason.trim().length < 10}
              onClick={() => void apply()}
            >
              Apply reviewed {review.kind}
            </button>
          </>
        )}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
