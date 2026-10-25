import { useEffect, useState } from "react";
import { getTeamInvitations, createTeamInvitation } from "@/lib/teams/invitation-api";
import { sendInvitationEmail } from "@/lib/invitation-delivery-api";
import { InvitationDelivery } from "../invitation-delivery";
import { Button } from "../ui/button";
export function TeamInvitations({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeamInvitations>>>();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await getTeamInvitations({ data: { teamId } }));
  }
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(undefined);
    setError("");
    setNotice("");
    getTeamInvitations({ data: { teamId } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId, open]);
  async function invite(playerId: string, email: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const invitation = await createTeamInvitation({ data: { teamId, playerId, email } });
      const sent = await sendInvitationEmail({ data: { id: invitation.id } });
      setNotice(
        sent.skipped
          ? "Invitation saved and queued. Email delivery is paused or unconfigured; no email was sent by this attempt."
          : sent.status === "accepted"
            ? "Invitation accepted by the email provider. Check delivery below; this does not mean the family accepted its offer."
            : "Invitation saved. Email status: " + sent.status + ". Check delivery below.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation unavailable.");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-xl border border-line bg-white p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">Team invitations</summary>
      <div className="mt-3 grid gap-3">
        <p>
          Invite a listed guardian using their exact email. They sign in, verify the email and
          accept household access, then review the athlete's fee and enrollment requirements. An
          invitation never signs an agreement or records a payment.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!data && !error && <p role="status">Loading team invitations…</p>}
        {data && !data.published && (
          <p role="status">
            Fees are not yet published. Account invitations can be sent now; families cannot accept
            or pay an unpublished fee.
          </p>
        )}
        {data && !data.players.length && (
          <p>Add an athlete and guardian contact to this team's roster first.</p>
        )}
        {data?.players.map((p) => (
          <article key={p.id} className="grid gap-2 rounded-lg border p-3">
            <h4 className="font-semibold">{p.name}</h4>
            {!p.guardians.length && <p>Front Office must add a guardian email.</p>}
            {p.guardians.map((g) => (
              <div key={g.email} className="grid gap-2 border-t py-2">
                <p className="break-all">
                  {g.name || "Guardian"} · {g.email}
                </p>
                <p>
                  {g.linked ? "Verified household access linked" : "Household acceptance pending"}
                </p>
                {g.invitation && (
                  <p>
                    Invitation: {g.invitation.status} · expires{" "}
                    {new Date(g.invitation.expiresAt).toLocaleDateString("en-US", {
                      timeZone: "America/Chicago",
                    })}
                    . Email: {g.invitation.emailStatus}; delivery: {g.invitation.delivery}.
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void invite(p.id, g.email)}
                >
                  {g.invitation?.status === "pending" &&
                  new Date(g.invitation.expiresAt).getTime() > Date.now()
                    ? "Send pending invitation"
                    : "Create & send invitation"}
                </Button>
                {g.invitation && <InvitationDelivery id={g.invitation.id} />}
              </div>
            ))}
          </article>
        ))}
        {data && (
          <Button
            type="button"
            variant="outlineDark"
            disabled={busy}
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            Refresh invitation status
          </Button>
        )}
      </div>
    </details>
  );
}
