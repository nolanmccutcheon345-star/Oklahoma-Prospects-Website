import { useState } from "react";
import {
  emptyFeeExplanation,
  feeExplanationFields,
  feeExplanationIssues,
  type FeeExplanation,
} from "@/lib/teams/fee-explanation";
import { downloadFeeAgreement } from "@/lib/teams/fee-api";
import { Button } from "../ui/button";

export function FeeExplanationView({
  value,
  status,
}: {
  value?: FeeExplanation | null;
  status: string;
}) {
  if (!value) return null;
  return (
    <section
      className="grid min-w-0 gap-3 rounded-xl border border-line p-4"
      aria-label="Fee explanation for parents"
    >
      <h4 className="font-bold">Fee explanation for parents</h4>
      <p className="text-sm">{status}</p>
      {feeExplanationFields.map(
        ([key, label]) =>
          value[key] && (
            <div key={key}>
              <h5 className="font-semibold">{label}</h5>
              <p className="whitespace-pre-wrap text-sm">{value[key].trim()}</p>
            </div>
          ),
      )}
      <p className="text-sm">
        Team-Managed Expenses are arranged and collected separately by the coach/team. This
        explanation does not authorize those expenses against your Prospects payment method.
      </p>
    </section>
  );
}

export function FeeExplanationEditor({
  value,
  onChange,
}: {
  value?: FeeExplanation;
  onChange: (value: FeeExplanation) => void;
}) {
  const current = value || emptyFeeExplanation();
  const issues = feeExplanationIssues(current);
  return (
    <section
      className="grid min-w-0 gap-3 rounded-xl border border-line p-4"
      aria-label="Edit fee explanation for parents"
    >
      <h4 className="font-bold">Fee explanation for parents</h4>
      <p className="font-semibold">Visible to parents · draft until published</p>
      <p className="text-sm">
        Explain this team's coverage in your own words. Use paragraphs or bullet lines. Private
        budgeting notes and costs are never copied here. State “None currently planned” when
        appropriate.
      </p>
      {feeExplanationFields.map(([key, label]) => (
        <label className="grid min-w-0 gap-1 text-sm" key={key}>
          {label}
          <textarea
            aria-label={label}
            className="office-control min-h-24 w-full"
            maxLength={4000}
            value={current[key]}
            onChange={(e) => onChange({ ...current, [key]: e.target.value })}
          />
        </label>
      ))}
      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm" aria-label="Explanation needed before publication">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer font-semibold">
          Preview parent explanation
        </summary>
        <FeeExplanationView value={current} status="Draft preview · not yet published" />
      </details>
    </section>
  );
}

export function FeeAgreementDownload({
  teamId,
  playerId,
  seasonId,
  version,
}: {
  teamId: string;
  playerId: string;
  seasonId?: string;
  version?: number;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const file = await downloadFeeAgreement({
              data: { teamId, playerId, seasonId, version },
            });
            const url = URL.createObjectURL(
              new Blob([file.text], { type: "text/plain;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = file.filename;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not download the agreement.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing agreement…" : "Download accepted agreement"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
