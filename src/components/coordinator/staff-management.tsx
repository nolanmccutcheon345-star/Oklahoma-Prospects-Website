import { getCoordinatorTransferRecovery, recoverCoordinatorTransfer } from "@/lib/coordinator/api";
import { CoordinatorAccessReviews } from "./access-reviews";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  capabilities,
  recommendedPreset,
  programOperationsPreset,
  type AssignmentInput,
  type Capability,
  type Sport,
} from "@/lib/coordinator/contracts";
import {
  getStaffRoles,
  resetStaffCoordinatorAccess,
  saveStaffRole,
  getStaffActivity,
  getCoordinatorApprovals,
  decideCoordinatorApproval,
  savePublicLeadership,
  inviteStaffCoordinator,
  getCoordinatorInvitations,
  revokeStaffCoordinatorInvitation,
} from "@/lib/coordinator/api";
const field = "min-h-11 rounded border border-line bg-white p-2 text-ink";
export function StaffRoleManagement() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getStaffRoles>>>();
  const [value, setValue] = useState<AssignmentInput>();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("roles");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSport, setInviteSport] = useState<Sport>("softball");
  const [invitations, setInvitations] =
    useState<Awaited<ReturnType<typeof getCoordinatorInvitations>>>();
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof getStaffActivity>>>();
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof getCoordinatorApprovals>>>();
  const [actorFilter, setActorFilter] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(false),
    [publicTitles, setPublicTitles] = useState<("Baseball Coordinator" | "Softball Coordinator")[]>(
      [],
    ),
    [publicOrder, setPublicOrder] = useState(0);
  async function load() {
    const result = await getStaffRoles();
    setData(result);
    return result;
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  function choose(userId: string, sport: Sport, source = data) {
    const row = source?.assignments.find((a) => a.user_id === userId && a.sport === sport);
    setValue({
      userId,
      sport,
      revision: row?.revision || 0,
      status:
        row?.status === "suspended"
          ? "suspended"
          : row?.status === "removed"
            ? "removed"
            : "active",
      coverage: row?.coverage || "teams",
      teamIds: row?.team_ids || [],
      permissions: row?.permissions || [],
      confirm: true,
      independentRolesReviewed: false,
    });
    const pub = source?.leadership.find((l) => l.user_id === userId);
    setPublicEnabled(pub?.enabled || false);
    setPublicTitles(pub?.titles || []);
    setPublicOrder(pub?.display_order || 0);
  }
  async function run(work: () => Promise<unknown>, success: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await work();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the action.");
    } finally {
      setBusy(false);
    }
  }
  async function save(next = value) {
    if (
      !next ||
      !window.confirm(
        `Save ${next.sport} coordinator access for ${data?.accounts.find((a) => a.id === next.userId)?.name}? ${next.permissions.length} explicit permissions; ${next.coverage === "sport" ? "all teams in this sport" : next.teamIds.length + " selected teams"}. Status: ${next.status}.`,
      )
    )
      return;
    await run(async () => {
      await saveStaffRole({ data: next });
      const updated = await load();
      choose(next.userId, next.sport, updated);
    }, "Permissions saved. Server access has been updated.");
  }
  if (!data)
    return (
      <section aria-label="Roles and permissions">
        <h2>Roles & Permissions</h2>
        <p role={error ? "alert" : "status"}>{error || "Loading authorized staff management…"}</p>
      </section>
    );
  const groups = [...new Set(Object.keys(capabilities).map((k) => k.split(".")[0]))];
  return (
    <section
      className="grid gap-4 rounded-xl border border-line bg-white p-4"
      aria-label="Staff Management"
    >
      <h2 className="text-2xl">Staff Management</h2>
      <p>
        Role identity, operational permissions, team scope, and public titles are configured
        separately.
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          ["roles", "Roles & Permissions"],
          ["invitations", "Coordinator Invitations"],
          ["approvals", "Approval Queue"],
          ["activity", "Staff Activity & Audit Center"],
          ["reviews", "Access Reviews"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "outlineDark"}
            onClick={() => {
              setTab(key);
              if (key === "invitations")
                void run(async () => setInvitations(await getCoordinatorInvitations()), "");
              if (key === "approvals")
                void run(async () => setQueue(await getCoordinatorApprovals()), "");
              if (key === "activity")
                void run(async () => setActivity(await getStaffActivity({ data: {} })), "");
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === "invitations" && (
        <div className="grid gap-4">
          <p>
            Invitations expire after seven days. Acceptance adds only the coordinator role, with
            zero permissions and no team access. Review scope and permissions separately after
            acceptance. Existing staff with independent roles require review in Roles & Permissions.
          </p>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await inviteStaffCoordinator({ data: { email: inviteEmail, sport: inviteSport } });
                setInvitations(await getCoordinatorInvitations());
                setInviteEmail("");
              }, "Invitation saved. Ask the recipient to sign in with the invited verified email and open /invitations. No email has been sent and no operational permissions have been granted.");
            }}
          >
            <label className="grid gap-1">
              Invitation email
              <input
                type="email"
                required
                maxLength={254}
                className={field}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              Invited coordinator role
              <select
                className={field}
                value={inviteSport}
                onChange={(e) => setInviteSport(e.target.value as Sport)}
              >
                <option value="softball">Softball Coordinator</option>
                <option value="baseball">Baseball Coordinator</option>
              </select>
            </label>
            <Button disabled={busy} type="submit">
              Create zero-permission invitation
            </Button>
          </form>
          {!invitations ? (
            <p role="status">Loading invitations…</p>
          ) : !invitations.length ? (
            <p>No pending coordinator invitations.</p>
          ) : (
            invitations.map((invite) => (
              <article key={invite.id} className="rounded border border-line p-3">
                <p>
                  {invite.email} ·{" "}
                  {invite.role === "softball_coordinator"
                    ? "Softball Coordinator"
                    : "Baseball Coordinator"}
                </p>
                <p>Expires {new Date(invite.expires_at).toLocaleDateString()}</p>
                <Button
                  disabled={busy}
                  variant="outlineDark"
                  onClick={() =>
                    void run(async () => {
                      await revokeStaffCoordinatorInvitation({ data: { id: invite.id } });
                      setInvitations(await getCoordinatorInvitations());
                    }, "Invitation revoked.")
                  }
                >
                  Revoke invitation
                </Button>
              </article>
            ))
          )}
        </div>
      )}
      {tab === "roles" && (
        <>
          <label className="grid gap-1">
            Verified staff account
            <select
              aria-label="Verified staff account"
              className={field}
              value={value?.userId || ""}
              onChange={(e) => choose(e.target.value, value?.sport || "softball")}
            >
              <option value="">Choose an account</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.email}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm">
            For a new person, have them create a normal account and verify their email. Do not
            assign coach or administrator access merely to invite a coordinator.
          </p>
          {value && (
            <>
              <details className="rounded border border-line p-3">
                <summary>Withdraw all coordinator access</summary>
                <p>
                  This suspends both sport assignments, clears all coordinator permissions and team
                  scopes, retires any old organization-wide grant, rejects pending approval requests
                  and cancels unsent coordinator notices. Financial restrictions and the base
                  account remain unchanged. Messages already accepted by an email provider cannot be
                  recalled.
                </p>
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const reason = String(new FormData(e.currentTarget).get("resetReason") || "");
                    if (
                      !window.confirm(
                        "Withdraw all coordinator access for this person in both sports?",
                      )
                    )
                      return;
                    void run(async () => {
                      await resetStaffCoordinatorAccess({
                        data: {
                          userId: value.userId,
                          assignments: data.assignments
                            .filter((a) => a.user_id === value.userId)
                            .map((a) => ({ sport: a.sport, revision: a.revision })),
                          legacyRevision:
                            data.retiredAccess?.find((a) => a.user_id === value.userId)?.revision ||
                            0,
                          reason,
                          confirmed: true,
                        },
                      });
                      const updated = await load();
                      choose(value.userId, value.sport, updated);
                    }, "Coordinator access withdrawn. No operational permissions remain; financial restrictions are unchanged.");
                  }}
                >
                  <label className="grid gap-1">
                    Reason for withdrawing access
                    <textarea
                      name="resetReason"
                      required
                      minLength={10}
                      maxLength={500}
                      className={field}
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Withdraw all coordinator access
                  </Button>
                </form>
              </details>
              <label className="grid gap-1">
                Role / sport
                <select
                  className={field}
                  value={value.sport}
                  onChange={(e) => choose(value.userId, e.target.value as Sport)}
                >
                  <option value="softball">Softball Coordinator</option>
                  <option value="baseball">Baseball Coordinator</option>
                </select>
              </label>
              <p className="font-semibold">
                {value.revision ? "Existing assignment" : "New assignment · zero permissions"}
              </p>
              <label htmlFor="coordinator-coverage" className="grid gap-1">
                Coverage
                <select
                  className={field}
                  id="coordinator-coverage"
                  aria-label="Coverage"
                  value={value.coverage}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      coverage: e.target.value as "teams" | "sport",
                      teamIds: [],
                    })
                  }
                >
                  <option value="teams">Only selected teams</option>
                  <option value="sport">All teams in this sport (including future teams)</option>
                </select>
              </label>
              {value.coverage === "teams" && (
                <fieldset className="grid gap-2">
                  <legend>Authorized teams</legend>
                  {data.teams
                    .filter((t) => t.sport === value.sport)
                    .map((t) => (
                      <label key={t.id} className="flex min-h-11 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={value.teamIds.includes(t.id)}
                          onChange={(e) =>
                            setValue({
                              ...value,
                              teamIds: e.target.checked
                                ? [...value.teamIds, t.id]
                                : value.teamIds.filter((id) => id !== t.id),
                            })
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                </fieldset>
              )}
              <details className="rounded border p-3">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Independent account roles — review before saving
                </summary>
                <p>
                  {data.accounts.find((a) => a.id === value.userId)?.role}{" "}
                  {data.accounts.find((a) => a.id === value.userId)?.instructor
                    ? "· Instructor"
                    : ""}
                </p>
                <p>
                  Existing coach, parent, instructor, and owner privileges remain independently
                  controlled. Legacy registration-reader access must be disabled before coordinator
                  activation.
                </p>
                <p>
                  {data.assignments
                    .find((a) => a.user_id === value.userId && a.sport === value.sport)
                    ?.independent_roles.join(", ") ||
                    "No previously reviewed independent staff roles."}
                </p>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.independentRolesReviewed}
                    onChange={(e) =>
                      setValue({ ...value, independentRolesReviewed: e.target.checked })
                    }
                  />
                  I reviewed this account’s separate roles and team assignments.
                </label>
              </details>
              {!value.revision ? (
                <p>Assign the role first. All operational permissions start unchecked.</p>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outlineDark"
                    onClick={() =>
                      setValue({ ...value, permissions: [...programOperationsPreset] })
                    }
                  >
                    Select program operations — review before saving
                  </Button>
                  <p className="text-sm text-muted">
                    Selects available recruiting, historical registrations, parent contacts, team
                    messages, rosters, practices, cages, drafts, and nonfinancial reports for the
                    chosen sport and teams. Transfers, cancellations, and publishing remain subject
                    to owner review. Finances, private medical records, and account administration
                    are excluded. Review the selections below, then save to apply them.
                  </p>
                  <Button
                    type="button"
                    variant="outlineDark"
                    onClick={() => setValue({ ...value, permissions: [...recommendedPreset] })}
                  >
                    Select proposed starter permissions — review before saving
                  </Button>
                  {groups.map((group) => (
                    <details key={group} className="rounded border p-3">
                      <summary className="min-h-11 cursor-pointer font-semibold capitalize">
                        {group} ({value.permissions.filter((p) => p.startsWith(group + ".")).length}
                        )
                      </summary>
                      <fieldset>
                        {Object.entries(capabilities)
                          .filter(([key]) => key.startsWith(group + "."))
                          .map(([key, label]) => (
                            <label key={key} className="flex min-h-11 items-center gap-3 py-2">
                              <input
                                type="checkbox"
                                checked={value.permissions.includes(key as Capability)}
                                onChange={(e) =>
                                  setValue({
                                    ...value,
                                    permissions: e.target.checked
                                      ? [...value.permissions, key as Capability]
                                      : value.permissions.filter((p) => p !== key),
                                  })
                                }
                              />
                              {label}
                            </label>
                          ))}
                      </fieldset>
                    </details>
                  ))}
                  <details className="rounded border p-3">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      View Effective Access (currently saved)
                    </summary>
                    <p>
                      Status:{" "}
                      {
                        data.assignments.find(
                          (a) => a.user_id === value.userId && a.sport === value.sport,
                        )?.status
                      }
                    </p>
                    <ul>
                      {data.assignments
                        .find((a) => a.user_id === value.userId && a.sport === value.sport)
                        ?.permissions.map((p) => (
                          <li key={p}>{capabilities[p]}</li>
                        ))}
                    </ul>
                    <p>Suspended and removed assignments grant no coordinator access.</p>
                  </details>
                </>
              )}
              <p className="rounded bg-paper p-3">
                Financial access, medical documents, permission administration, permanent deletion,
                bulk exports, paid-booking overrides, and direct publication are never grantable
                here.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void save()}>
                  {value.revision ? "Save Permissions" : "Assign Role With Zero Permissions"}
                </Button>
                {!!value.revision && (
                  <>
                    <Button
                      disabled={busy}
                      variant="outlineDark"
                      onClick={() => void save({ ...value, permissions: [] })}
                    >
                      Revoke All Coordinator Permissions
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outlineDark"
                      onClick={() =>
                        void save({
                          ...value,
                          status: value.status === "suspended" ? "active" : "suspended",
                        })
                      }
                    >
                      {value.status === "suspended" ? "Reactivate" : "Suspend"} Coordinator Access
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outlineDark"
                      onClick={() => void save({ ...value, status: "removed", permissions: [] })}
                    >
                      Remove This Role
                    </Button>
                  </>
                )}
              </div>
              <details className="rounded border p-3">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Public coordinator titles (independent of access)
                </summary>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={publicEnabled}
                    onChange={(e) => setPublicEnabled(e.target.checked)}
                  />
                  Show approved leadership profile publicly
                </label>
                {(["Baseball Coordinator", "Softball Coordinator"] as const).map((t) => (
                  <label key={t} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={publicTitles.includes(t)}
                      onChange={(e) =>
                        setPublicTitles(
                          e.target.checked
                            ? [...publicTitles, t]
                            : publicTitles.filter((x) => x !== t),
                        )
                      }
                    />
                    {t}
                  </label>
                ))}
                <label className="grid gap-1">
                  Display order
                  <input
                    className={field}
                    type="number"
                    min="0"
                    max="10000"
                    value={publicOrder}
                    onChange={(e) => setPublicOrder(Number(e.target.value))}
                  />
                </label>
                <p>
                  Name, photograph, biography, and coaching affiliations use the existing shared
                  profile editor below.
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await savePublicLeadership({
                        data: {
                          userId: value.userId,
                          revision:
                            data.leadership.find((l) => l.user_id === value.userId)?.revision || 0,
                          enabled: publicEnabled,
                          titles: publicTitles,
                          order: publicOrder,
                        },
                      });
                      await load();
                    }, "Public leadership settings saved. Operational access was not changed.")
                  }
                >
                  Save Public Titles
                </Button>
              </details>
            </>
          )}
        </>
      )}
      {tab === "reviews" && <CoordinatorAccessReviews />}
      {tab === "activity" && (
        <>
          <label className="grid gap-1">
            Staff member
            <select
              className={field}
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
            >
              <option value="">All staff</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() =>
              void run(
                async () => setActivity(await getStaffActivity({ data: { actor: actorFilter } })),
                "",
              )
            }
          >
            Filter Activity / Permission History
          </Button>
          {activity?.alerts.map((a) => (
            <p role="status" key={a.actor_id}>
              {a.denials} denied actions in {activity.denialWindowHours} hours for {a.actor_id}.
              Review context before treating this as an incident.
            </p>
          ))}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activity?.events.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                    <td>{data.accounts.find((a) => a.id === e.actor_id)?.name || e.actor_id}</td>
                    <td>{e.action}</td>
                    <td>{e.result}</td>
                    <td>
                      <details>
                        <summary className="min-h-11">Review</summary>
                        <pre className="max-w-sm whitespace-pre-wrap">{e.details}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "approvals" && (
        <>
          {queue?.length === 0 && <p>No approval requests.</p>}
          {queue?.map((a) => (
            <article className="grid gap-2 rounded border p-3" key={a.id}>
              <h3 className="text-xl">
                {a.kind} · {a.status}
              </h3>
              <p>
                {a.name} · {a.sport} · {new Date(a.created_at).toLocaleString()}
              </p>
              <p>{a.reason}</p>
              {a.title && (
                <>
                  <strong>{a.title}</strong>
                  <p className="whitespace-pre-wrap">{a.body}</p>
                </>
              )}
              <p>Target: {a.target_id}</p>
              <p className="text-sm">
                {a.kind === "transfer"
                  ? "Approval executes this transfer atomically after rechecking current access, roster revision, eligibility and financial protections. A conflict leaves the request pending and changes no records."
                  : a.kind === "content"
                    ? "Approval does not publish. Use the owner content workflow after checking publication consent."
                    : "Approval cancels the practice and releases its linked unpaid cage reservation atomically."}
              </p>
              {a.kind === "transfer" &&
                a.status === "approved" &&
                (a.proposal.recovered ? (
                  <p>Transfer recovered to its original team.</p>
                ) : (
                  <Button
                    disabled={busy}
                    variant="outlineDark"
                    onClick={() =>
                      void run(async () => {
                        const preview = await getCoordinatorTransferRecovery({ data: a.id });
                        const reason = window.prompt(
                          "Reason for restoring this athlete to the original team (at least 10 characters):",
                        );
                        if (
                          !reason ||
                          !window.confirm(
                            `Restore athlete ${preview.playerId} from ${preview.fromTeamId} to ${preview.toTeamId}? Current eligibility and financial protections will be rechecked.`,
                          )
                        )
                          return;
                        await recoverCoordinatorTransfer({
                          data: {
                            approvalId: a.id,
                            approvalRevision: preview.approvalRevision,
                            rosterRevision: preview.rosterRevision,
                            reason,
                            confirm: true,
                          },
                        });
                        setQueue(await getCoordinatorApprovals());
                      }, "Recovery request processed. Review the transfer status.")
                    }
                  >
                    Recover transfer to original team
                  </Button>
                ))}
              {a.status === "pending" && (
                <div className="flex gap-2">
                  {(["approved", "rejected"] as const).map((decision) => (
                    <Button
                      key={decision}
                      disabled={busy}
                      variant="outlineDark"
                      onClick={() => {
                        const reason = window.prompt("Record the reason for this decision:");
                        if (
                          !reason ||
                          !window.confirm(
                            `${decision === "approved" ? "Approve" : "Reject"} this request?`,
                          )
                        )
                          return;
                        void run(async () => {
                          await decideCoordinatorApproval({
                            data: {
                              id: a.id,
                              revision: a.revision,
                              decision,
                              reason,
                              confirm: true,
                            },
                          });
                          setQueue(await getCoordinatorApprovals());
                        }, "Decision recorded.");
                      }}
                    >
                      {decision === "approved" ? "Approve" : "Reject"}
                    </Button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
