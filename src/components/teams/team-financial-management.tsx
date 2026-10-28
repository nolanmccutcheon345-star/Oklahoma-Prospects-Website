import { useState } from "react";
import type { ClubRecord } from "@/lib/teams/types";
import type { TeamFinancialView } from "@/lib/teams/financial-view";
import { previewTeamFinancialAdmission, admitTeamFinancialEntities } from "@/lib/teams/store";
import { Button } from "@/components/ui/button";
import { FinancialEventCommitments } from "./financial-event-commitments";
import { money } from "./ui";

export function TeamFinancialManagement({
  club,
  financial,
  onReload,
}: {
  club: ClubRecord;
  financial: TeamFinancialView;
  onReload: () => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(club.teams[0]?.id || ""),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<Awaited<ReturnType<typeof previewTeamFinancialAdmission>>>(),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [eventTeam, setEventTeam] = useState(financial.coachTeams[0]?.teamId || "");
  const team = club.teams.find((t) => t.id === teamId),
    knownTeams = new Set(financial.coachTeams.map((t) => t.teamId)),
    knownPlayers = new Set(financial.obligations.map((p) => p.playerId));
  const candidates = team?.roster.filter((p) => !knownPlayers.has(p.id)) || [];
  async function review() {
    if (!team || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(undefined);
    setConfirmed(false);
    try {
      setPreview(
        await previewTeamFinancialAdmission({
          data: { teamId: team.id, playerIds: selected, sourceClubRevision: club._rev },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review financial setup.");
    } finally {
      setBusy(false);
    }
  }
  async function admit() {
    if (!preview || !confirmed || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await admitTeamFinancialEntities({
        data: {
          teamId: preview.team.id,
          playerIds: preview.players.map((p) => p.id),
          sourceClubRevision: preview.sourceClubRevision,
          expectedBasisVersion: preview.basisVersion,
          reviewDigest: preview.reviewDigest,
          confirmed: true,
          reason,
        },
      });
      setPreview(undefined);
      setSelected([]);
      setReason("");
      setConfirmed(false);
      await onReload();
      setNotice(
        "Financial setup saved. Review and publish the team fee plan before requesting family acceptance.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save financial setup.");
    } finally {
      setBusy(false);
    }
  }
  const control = "office-control w-full";
  return (
    <section
      className="mt-5 grid gap-4 rounded-xl border-2 border-maroon p-4"
      aria-label="Owner financial setup"
    >
      <h3 className="text-xl">Owner financial setup</h3>
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={async () => {
          setPreview(undefined);
          setConfirmed(false);
          setSelected([]);
          setError("");
          setBusy(true);
          try {
            await onReload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not refresh financial setup.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Refresh financial setup
      </Button>
      <p className="text-sm">
        Operational team and roster additions do not create financial agreements. Review the team,
        selected players and billing accounts before adding them to finances.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label>
        Operational team
        <select
          className={control}
          value={teamId}
          disabled={busy}
          onChange={(e) => {
            setTeamId(e.target.value);
            setSelected([]);
            setPreview(undefined);
            setConfirmed(false);
            setNotice("");
          }}
        >
          <option value="">Choose team</option>
          {club.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {knownTeams.has(t.id) ? " · financial setup exists" : " · financial setup needed"}
            </option>
          ))}
        </select>
      </label>
      {team && (
        <>
          <fieldset className="grid gap-2">
            <legend className="font-semibold">New players to include</legend>
            {candidates.length ? (
              candidates.map((p) => (
                <label className="flex items-center gap-2" key={p.id}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selected.includes(p.id)}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      );
                      setPreview(undefined);
                      setConfirmed(false);
                    }}
                  />
                  {p.name} ·{" "}
                  {p.parents
                    .map((g) => g.email)
                    .filter(Boolean)
                    .join(", ") || "No guardian email"}
                </label>
              ))
            ) : (
              <p className="text-sm">No new players awaiting financial setup.</p>
            )}
          </fieldset>
          <Button
            disabled={busy || (knownTeams.has(team.id) && !selected.length)}
            type="button"
            onClick={() => void review()}
          >
            {busy ? "Working…" : "Review financial setup"}
          </Button>
        </>
      )}
      {preview && (
        <form
          className="grid gap-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void admit();
          }}
        >
          <h4 className="font-semibold">
            Review {preview.team.name} · {preview.team.seasonLabel}
          </h4>
          {knownTeams.has(preview.team.id) ? (
            <p className="text-sm">
              This review adds only the selected player financial records. Existing financial team
              terms stay as recorded.
            </p>
          ) : (
            <div className="grid gap-1 text-sm">
              <p>
                {preview.team.financialTerms.sport} · {preview.team.financialTerms.age} ·{" "}
                {preview.team.financialTerms.months} months
              </p>
              <p>
                Season: {preview.team.financialTerms.seasonStart || "Not set"} to{" "}
                {preview.team.financialTerms.seasonEnd || "Not set"}
              </p>
              <p>
                Organization fee {money(preview.team.financialTerms.orgFee)} · monthly coaching{" "}
                {money(preview.team.financialTerms.coachMonthly)} · event budget{" "}
                {money(preview.team.financialTerms.eventBudget)}
              </p>
              <p>
                Other costs:{" "}
                {Object.entries(preview.team.financialTerms.otherCosts)
                  .map(([name, amount]) => `${name} ${money(amount)}`)
                  .join(" · ")}
              </p>
              <p>
                Uniform package: {preview.team.financialTerms.uniformPackageId || "None"} · team
                cage hours {preview.team.financialTerms.teamCageHoursPerWeek} · player cage hours{" "}
                {preview.team.financialTerms.playerCageHoursPerWeek}
              </p>
              <p>
                Seasons:{" "}
                {preview.team.financialTerms.seasons?.join(" · ") || preview.team.seasonLabel} ·
                uniform deadline {preview.team.financialTerms.uniformDeadline || "Not set"}
              </p>
              <p>Events and practices need separate financial setup after this team is admitted.</p>
              <p>Financial team status: {preview.team.financialTerms.closed ? "Closed" : "Open"}</p>
            </div>
          )}
          {!knownTeams.has(preview.team.id) && (
            <>
              <p className="text-sm">
                Head coach: {preview.team.headCoach || "Unassigned"} {preview.team.coachEmail}
              </p>
              <p className="text-sm">Compensation access accounts:</p>
              {preview.team.compensationAccounts.length ? (
                <ul className="text-sm">
                  {preview.team.compensationAccounts.map((a) => (
                    <li key={a.userId}>
                      {a.name} · {a.email}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No existing compensation account is linked.</p>
              )}
              {preview.team.staff.map((s) => (
                <p className="text-sm" key={s.id}>
                  {s.name} · {s.role} · {s.email} · {money(s.monthly)}/month ·{" "}
                  {money(s.applyAmount)} applied to fees
                </p>
              ))}
            </>
          )}
          {preview.players.map((p) => (
            <div key={p.id} className="rounded border p-3">
              <p className="font-semibold">{p.name}</p>
              <p className="text-sm">
                {p.roleType === "po" ? "Pitcher only" : "Full player"} · joined{" "}
                {p.joinedOn || "Not set"} · {p.withdrawn ? "Withdrawn" : "Active"} · uniform{" "}
                {p.uniformWaived ? "waived" : "not waived"}
              </p>
              <p className="text-sm">
                Coach child: {p.coachChild ? "Yes" : "No"} · cage overage {p.cageOverage} · payment
                plan {p.planType || "Not set"} · deposit {p.depositPaid ? "Paid" : "Not paid"}
              </p>
              <p className="text-sm">Guardian contacts: {p.parentEmails.join(", ") || "None"}</p>
              <p className="text-sm">Billing access accounts:</p>
              {p.guardians.length ? (
                <ul className="text-sm">
                  {p.guardians.map((g) => (
                    <li key={g.userId}>
                      {g.name} · {g.email}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">
                  No existing billing account is linked. Future billing access requires an owner
                  review.
                </p>
              )}
            </div>
          ))}
          <label>
            Reason
            <textarea
              required
              maxLength={1000}
              className={control}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I approve these financial team/player records and the listed billing accounts.
          </label>
          <div className="flex gap-2">
            <Button disabled={busy || !confirmed || !reason.trim()} type="submit">
              {busy ? "Saving…" : "Confirm financial setup"}
            </Button>
            <Button
              disabled={busy}
              variant="outlineDark"
              type="button"
              onClick={() => {
                setPreview(undefined);
                setConfirmed(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {financial.coachTeams.length > 0 && (
        <>
          <label>
            Financial team events
            <select
              className={control}
              value={eventTeam}
              onChange={(e) => setEventTeam(e.target.value)}
            >
              <option value="">Choose financial team</option>
              {financial.coachTeams.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </label>
          {eventTeam && (
            <FinancialEventCommitments key={eventTeam} teamId={eventTeam} onSaved={onReload} />
          )}
        </>
      )}
    </section>
  );
}
