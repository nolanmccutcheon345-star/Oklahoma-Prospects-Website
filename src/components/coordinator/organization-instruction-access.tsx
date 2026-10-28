import { useState } from "react";
import { Button } from "../ui/button";
import type { OperationalInstructionInput } from "@/lib/operational-instruction-contracts";
export type InstructionState = {
  revision: number;
  active: boolean;
  canManage: boolean;
  canSuspend: boolean;
  blockers: string[];
};
export function OrganizationInstructionAccess({
  userId,
  instruction,
  busy,
  onSave,
}: {
  userId: string;
  instruction: InstructionState;
  busy: boolean;
  onSave: (value: OperationalInstructionInput) => Promise<void>;
}) {
  const [active, setActive] = useState(instruction.active);
  const [reason, setReason] = useState("");
  const canSave = instruction.canManage || (!active && instruction.canSuspend);
  return (
    <form
      aria-label="Operational instructor access"
      className="grid gap-3 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && canSave)
          void onSave({ userId, revision: instruction.revision, active, reason });
      }}
    >
      <h3 className="font-semibold">Operational instructor access</h3>
      <p className="text-sm">
        Assign an existing verified adult account to its own lesson schedule, guided drafts, and
        attendance observations. Paid offerings, financial access, account roles, assessment
        eligibility, and recruiting approvals stay with their existing controls.
      </p>
      {instruction.blockers.map((blocker) => (
        <p key={blocker} className="text-sm">
          {blocker}
        </p>
      ))}
      <fieldset
        disabled={busy || (!instruction.canManage && !instruction.canSuspend)}
        className="grid gap-3"
      >
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="instructionActive"
            checked={active}
            disabled={!instruction.canManage && !active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Enable operational instructor access
        </label>
        <label className="grid gap-1">
          Reason for instructor access change
          <textarea
            className="min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink"
            name="instructionReason"
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button type="submit" className="justify-self-start" disabled={busy || !canSave}>
          {busy ? "Saving…" : "Save instructor access"}
        </Button>
      </fieldset>
    </form>
  );
}
