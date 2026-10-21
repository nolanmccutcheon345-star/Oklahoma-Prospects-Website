import { useState } from "react";
import { assignExistingStaffCoordinator, type getStaffRoles } from "@/lib/coordinator/api";
import type { Sport } from "@/lib/coordinator/contracts";
import { Button } from "../ui/button";

export function ExistingCoordinatorAccount({
  data,
  onAssigned,
}: {
  data: Awaited<ReturnType<typeof getStaffRoles>>;
  onAssigned: (userId: string, sport: Sport) => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [sport, setSport] = useState<Sport>("softball");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accounts = data.accounts.filter((a) => a.role !== "player");
  const account = accounts.find((a) => a.id === userId);
  const exists = data.assignments.some((a) => a.user_id === userId && a.sport === sport);
  const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
  return (
    <form
      className="grid gap-3 rounded border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          busy ||
          !account ||
          exists ||
          !window.confirm(
            `Assign ${sport} coordinator to ${account.name} (${account.email}) with zero permissions and no team access?`,
          )
        )
          return;
        setBusy(true);
        setError("");
        try {
          await assignExistingStaffCoordinator({
            data: { userId, sport, independentRolesReviewed: reviewed, confirm: true },
          });
          await onAssigned(userId, sport);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not assign coordinator role.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-xl">Assign an existing account</h3>
      <p>
        Select a registered, verified adult account. This adds only the coordinator role: zero
        permissions and no team access. Configure access separately after assignment.
      </p>
      <label className="grid gap-1">
        Registered account
        <select
          className={field}
          required
          disabled={busy}
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setReviewed(false);
            setError("");
          }}
        >
          <option value="">Select an existing account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.email}
            </option>
          ))}
        </select>
      </label>
      {!accounts.length && (
        <p role="status">
          No eligible verified accounts found. The person must register and verify their email
          first.
        </p>
      )}
      <label className="grid gap-1">
        Coordinator role
        <select
          className={field}
          disabled={busy}
          value={sport}
          onChange={(e) => {
            setSport(e.target.value as Sport);
            setError("");
          }}
        >
          <option value="softball">Softball Coordinator</option>
          <option value="baseball">Baseball Coordinator</option>
        </select>
      </label>
      <p>
        Existing parent, coach, instructor or administrator access is separate and is not removed by
        this assignment. Accounts with broad legacy registration access must have that access
        withdrawn first.
      </p>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          disabled={busy}
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        I reviewed any separate roles this account already holds. Required if the account has other
        staff roles.
      </label>
      {exists && (
        <p role="status">
          This account already has this coordinator role. Use Roles &amp; Permissions to review its
          access.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !account || exists}>
        {busy ? "Assigning…" : "Assign coordinator with zero permissions"}
      </Button>
    </form>
  );
}
