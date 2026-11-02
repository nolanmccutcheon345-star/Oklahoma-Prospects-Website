import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  reviewInvitationEmail,
  sendReviewedInvitation,
  checkInvitationDelivery,
} from "@/lib/invitation-delivery-api";

export function InvitationDelivery({
  id,
  onUpdate,
  autoReview = false,
}: {
  id: string;
  onUpdate?: () => Promise<void>;
  autoReview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof reviewInvitationEmail>>>();
  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setNotice("");
    setError("");
    if (autoReview) {
      setBusy(true);
      reviewInvitationEmail({ data: { id } })
        .then((result) => {
          if (active) setPreview(result);
        })
        .catch((e) => {
          if (active)
            setError(e instanceof Error ? e.message : "Could not load invitation review.");
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [id, autoReview]);
  async function run(action: "review" | "send" | "check") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "review") {
        setPreview(await reviewInvitationEmail({ data: { id } }));
      } else if (action === "send" && preview?.review) {
        const result = await sendReviewedInvitation({
          data: { id, digest: preview.review.digest, confirmed: true },
        });
        setNotice(result.message);
        setPreview(undefined);
        await onUpdate?.();
      } else if (action === "check") {
        const result = await checkInvitationDelivery({ data: { id } });
        setNotice(
          `Email: ${result.status}; delivery: ${result.delivery}. Account invitation: ${result.invitation}. Delivery does not prove the recipient read or accepted the invitation.`,
        );
        await onUpdate?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation delivery unavailable.");
      if (action === "send") setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  const review = preview?.review;
  const canSend =
    review && !preview.blockers.length && ["held", "approved"].includes(review.approvalStatus);
  return (
    <div className="mt-2 grid gap-3" aria-label="Invitation email">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void run("review")}>
          {busy ? "Working…" : "Review invitation email"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outlineDark"
          disabled={busy}
          onClick={() => void run("check")}
        >
          Check email delivery
        </Button>
      </div>
      {preview && (
        <div className="grid gap-3 rounded-xl border border-line bg-white p-4">
          <h4 className="font-semibold">Review and send this invitation</h4>
          {preview.blockers.map((message) => (
            <p key={message} role="status">
              {message}
            </p>
          ))}
          {review && (
            <>
              <p className="break-words">
                <strong>To:</strong> {review.recipients.join(", ")}
              </p>
              <p>
                <strong>Subject:</strong> {review.subject}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{review.text}</p>
              {review.approvalStatus === "sent" ? (
                <p role="status">
                  The email provider already accepted this invitation. Use Check email delivery for
                  its current status.
                </p>
              ) : review.approvalStatus === "invalid" ? (
                <p role="status">This delivery needs owner review before it can be retried.</p>
              ) : (
                <p className="text-sm">
                  Send invitation approves and submits only this message to the email provider.
                </p>
              )}
              <Button type="button" disabled={busy || !canSend} onClick={() => void run("send")}>
                Send invitation
              </Button>
            </>
          )}
        </div>
      )}
      <p className="text-sm">
        Recipients create their own password, verify the invited email and accept access. Fee
        instructions remain separate. Retrying this invitation reuses the original message to
        prevent duplicate emails.
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
