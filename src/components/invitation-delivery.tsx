import { useState } from "react";
import { Button } from "./ui/button";
import { sendInvitationEmail, checkInvitationDelivery } from "@/lib/invitation-delivery-api";
export function InvitationDelivery({ id }: { id: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function run(send: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (send) {
        const r = await sendInvitationEmail({ data: { id } });
        setNotice(
          r.skipped
            ? "Invitation remains queued. Email delivery is paused or not configured; no email was sent by this attempt."
            : r.status === "accepted"
              ? "Email provider accepted the invitation. Check delivery to confirm recipient-server delivery."
              : r.status === "review"
                ? "Delivery needs owner review; automatic retries stopped to avoid a duplicate email."
                : `Invitation email status: ${r.status}. This does not mean the invitation was accepted by the recipient.`,
        );
      } else {
        const r = await checkInvitationDelivery({ data: { id } });
        setNotice(
          `Email: ${r.status}; delivery: ${r.delivery}. Account invitation: ${r.invitation}. Delivery does not prove the recipient read the message or accepted an agreement.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation delivery unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void run(true)}>
          Send invitation email
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outlineDark"
          disabled={busy}
          onClick={() => void run(false)}
        >
          Check email delivery
        </Button>
      </div>
      <p className="text-sm">
        Saving an invitation does not send it. Repeated sends for the same invitation retry the
        original message without intentionally sending another copy.
      </p>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
