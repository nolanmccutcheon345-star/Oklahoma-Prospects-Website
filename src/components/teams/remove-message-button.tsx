import { useState } from "react";
import { removeChatMessage } from "@/lib/teams/message-removal-api";
export function RemoveMessageButton({
  owner,
  teamId,
  channel = "team",
  message,
  onRemoved,
}: {
  owner: boolean;
  teamId: string;
  channel?: "team" | "family";
  message: { id: string; author: string; body: string };
  onRemoved: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!owner) return null;
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 underline"
        onClick={async () => {
          const reason = window.prompt("Reason for removing this message (10–1000 characters):");
          if (reason === null) return;
          if (reason.trim().length < 10 || reason.trim().length > 1000) {
            setError("Enter a reason between 10 and 1000 characters.");
            return;
          }
          if (
            !window.confirm(
              `Remove the message by ${message.author}: “${message.body.slice(0, 120)}”? It will disappear from the conversation in Team Hub and Coach Desk. Its original record and removal audit will be preserved.`,
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await removeChatMessage({
              data: {
                channel,
                teamId,
                id: message.id,
                author: message.author,
                body: message.body,
                reason: reason.trim(),
                confirm: true,
              },
            });
            await onRemoved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Message could not be removed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Removing…" : "Remove message"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
