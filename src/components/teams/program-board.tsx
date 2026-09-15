import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, Fold, NumRows, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import {
  FILL_TARGET,
  GRADE_KEYS,
  LEAD_STAGES,
  POLICY_LAWYER_NOTE,
  agreementsOf,
  alumniPublic,
  analyticsOf,
  archiveExport,
  archivesOf,
  funnelOf,
  scorecardsOf,
  stageOf,
  tryoutLink,
  type GradeKey,
} from "@/lib/teams/program";
import { cn } from "@/lib/utils";

function pct(n: number | null) {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

export function TryoutBoard() {
  const os = useTeams();
  const leads = os.state.leads || [];
  const funnel = funnelOf(os.state);
  const alumni = alumniPublic(os.state.alumni);
  const [teamId, setTeamId] = useState(os.visibleTeams[0]?.id || "");
  const link = tryoutLink();

  return (
    <div className="teams-stack" data-teams-office="tryouts">
      <DeskCard
        eyebrow="Tryouts"
        title="Lead to roster, in public."
        copy="Lead, registered, evaluated, offer, then accepted or waitlist. An offer writes the invite that starts signing."
      >
        <NumRows
          rows={LEAD_STAGES.map((s) => ({
            label: s,
            value: String(funnel.counts[s]),
          }))}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outlineDark"
            data-teams-tryout-link
            onClick={() => {
              void navigator.clipboard?.writeText(link);
            }}
          >
            Copy registration link
          </Button>
          <p className="self-center text-xs text-teams-muted">{link}</p>
        </div>
        <label className="mt-4 grid gap-1">
          <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">
            Offer onto
          </span>
          <select
            className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {os.visibleTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </DeskCard>

      {leads.length === 0 ? (
        <TeamsEmpty
          title="No prospects this week."
          copy="Share the registration link."
          action="Copy link"
          onAction={() => {
            const link = tryoutLink();
            if (link) navigator.clipboard?.writeText(link);
          }}
        />
      ) : (
        leads.map((lead) => (
          <LeadCard key={lead.id} leadId={lead.id} teamId={teamId} />
        ))
      )}

      <Fold title="Alumni" open>
        {alumni.length === 0 ? (
          <p className="text-sm text-teams-muted">
            Counts stay off the public site until they are above zero.
          </p>
        ) : (
          <NumRows
            rows={alumni.map((a) => ({
              label: a.label,
              value: String(a.count),
            }))}
          />
        )}
        <ul className="mt-3 divide-y divide-line">
          {(os.state.alumni || []).map((a) => (
            <li key={a.id} className="py-2">
              <p className="text-sm font-semibold">{a.name}</p>
              <p className="text-xs text-teams-muted">
                {a.kind === "draft"
                  ? `Draft · round ${a.draftRound} · ${a.draftYear} · ${a.school}`
                  : `${a.kind} · ${a.school} · ${a.division}`}
              </p>
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  );
}

function LeadCard({ leadId, teamId }: { leadId: string; teamId: string }) {
  const os = useTeams();
  const lead = os.state.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  const stage = stageOf(lead);
  return (
    <DeskCard
      eyebrow={stage}
      title={lead.name}
      copy={`${lead.ageGroup} ${lead.position} · ${lead.source}${lead.note ? ` · ${lead.note}` : ""}`}
    >
      <div className="grid grid-cols-3 gap-2" data-teams-tryout={lead.id}>
        {GRADE_KEYS.map((key) => (
          <label key={key} className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">{key}</span>
            <input
              className="teams-control min-h-11 rounded-lg bg-paper px-2 text-sm shadow-border"
              inputMode="numeric"
              defaultValue={lead.scores?.[key] ? String(lead.scores[key]) : ""}
              placeholder="20–80"
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (!n) return;
                os.setLeadScores(lead.id, { [key]: n } as Partial<Record<GradeKey, number>>);
              }}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stage === "lead" ? (
          <Button type="button" size="sm" variant="outlineDark" onClick={() => os.setLeadStage(lead.id, "registered")}>
            Mark registered
          </Button>
        ) : null}
        {stage === "registered" ? (
          <Button type="button" size="sm" variant="outlineDark" onClick={() => os.setLeadStage(lead.id, "evaluated")}>
            Mark evaluated
          </Button>
        ) : null}
        {stage === "evaluated" || stage === "registered" ? (
          <Button
            type="button"
            size="sm"
            variant="maroon"
            data-teams-offer={lead.id}
            onClick={() => os.makeOffer(lead.id, teamId)}
          >
            Make offer
          </Button>
        ) : null}
        {stage === "offer" ? (
          <Button type="button" size="sm" variant="maroon" onClick={() => os.acceptLead(lead.id)}>
            Mark accepted
          </Button>
        ) : null}
        {stage !== "accepted" && stage !== "waitlist" ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => os.waitlistLead(lead.id)}>
            Waitlist
          </Button>
        ) : null}
      </div>
    </DeskCard>
  );
}

export function AnalyticsBoard() {
  const os = useTeams();
  const a = analyticsOf(os.state);
  const cards = scorecardsOf(os.state);
  return (
    <div className="teams-stack" data-teams-office="analytics">
      <DeskCard
        eyebrow="Club"
        title="Fill the roster. Collect what it owes."
        copy={`Fourteen-player target. Wins are the least useful column. Cost per acquired player uses this season's recruiting spend.`}
      >
        <NumRows
          rows={[
            { label: "Fill vs 14", value: pct(a.fill) },
            { label: "Collection", value: pct(a.collection), alert: a.collection < 0.7 },
            { label: "Retention", value: pct(a.retention) },
            { label: "Funnel conversion", value: pct(a.funnel.conversion) },
            {
              label: "Cost per acquired",
              value: a.cpa == null ? "—" : formatTeamMoney(a.cpa),
            },
            { label: "Players", value: String(a.players) },
          ]}
        />
        <div
          className="mt-4 grid gap-2"
          role="img"
          aria-label={`Roster fill is ${pct(a.fill)}. Collection is ${pct(a.collection)}. Retention is ${pct(a.retention)}. Funnel conversion is ${pct(a.funnel.conversion)}.`}
        >
          {[
            { label: "Fill", value: a.fill },
            { label: "Collection", value: a.collection },
            { label: "Retention", value: a.retention ?? 0 },
          ].map((bar) => (
            <div key={bar.label} className="grid gap-1">
              <span className="text-xs text-teams-muted">{bar.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-maroon"
                  style={{ width: `${Math.min(100, Math.round((bar.value || 0) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </DeskCard>
      {a.margins.map((m) => (
        <DeskCard
          key={m.team.id}
          eyebrow={m.team.name}
          title={m.forecast ? "Forecast margin" : "Realized margin"}
        >
          <NumRows
            rows={[
              { label: "Team", value: formatTeamMoney(m.margin) },
              { label: "Per player", value: formatTeamMoney(m.perPlayer) },
              {
                label: "Fill",
                value: `${m.team.roster.filter((p) => !p.withdrawn).length} / ${FILL_TARGET}`,
              },
            ]}
          />
        </DeskCard>
      ))}
      {cards.map((c) => (
        <DeskCard
          key={c.team.id}
          eyebrow="Coach scorecard"
          title={c.name}
          copy="Roster fill, collections, attendance, retention, withdrawals, events. Record last."
        >
          <div data-teams-scorecard={c.team.id}>
            <NumRows
              rows={[
                { label: "Fill", value: `${c.fill} / ${FILL_TARGET}` },
                {
                  label: "Collection",
                  value: pct(c.collection),
                  alert: c.flagCollections,
                },
                { label: "Attendance", value: pct(c.attendance) },
                { label: "Retention", value: pct(c.retention) },
                {
                  label: "Mid-season withdrawals",
                  value: String(c.withdrawals),
                  alert: c.flagWithdrawals,
                },
                { label: "Events run", value: String(c.events) },
                {
                  label: "Record (least useful)",
                  value: `${c.record.w}-${c.record.l}-${c.record.t}`,
                },
              ]}
            />
            {c.flagWithdrawals || c.flagCollections ? (
              <p className="mt-3 text-sm text-ok-maroon" data-teams-flag={c.team.id}>
                {c.flagWithdrawals ? "More than one mid-season withdrawal. " : ""}
                {c.flagCollections ? "Collections under 70%." : ""}
              </p>
            ) : null}
          </div>
        </DeskCard>
      ))}
    </div>
  );
}

export function ArchiveBoard() {
  const os = useTeams();
  const rows = archivesOf(os.state);
  return (
    <div className="teams-stack" data-teams-office="archive">
      <DeskCard
        eyebrow="Archive"
        title="Closed seasons stay on the shelf."
        copy="Rosters, records, stat lines. Export when a family or a coach asks."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-teams-muted">
            Nothing archived yet. Close a season from the Season Close desk.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={`${row.teamId}-${row.closedAt}`} className="py-3">
                <p className="text-sm font-semibold">
                  {row.name} · {row.seasonLabel}
                </p>
                <p className="text-xs text-teams-muted">
                  Closed {row.closedAt}
                  {row.record ? ` · ${row.record.w}-${row.record.l}-${row.record.t}` : ""}
                  {` · ${formatTeamMoney(row.realized)} realized`}
                </p>
                <p className="mt-1 text-xs text-teams-muted">
                  {(row.roster || [])
                    .slice(0, 8)
                    .map((p) => `${p.name} #${p.number}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outlineDark"
          className="mt-4"
          onClick={() => downloadText("prospects-archive.csv", archiveExport(os.state), "text/csv")}
        >
          Export archive
        </Button>
      </DeskCard>
    </div>
  );
}

export function AgreementsBoard() {
  const os = useTeams();
  const pack = agreementsOf(os.state);
  const [text, setText] = useState(pack.policy?.text || "");
  return (
    <div className="teams-stack" data-teams-office="agreements">
      <DeskCard
        eyebrow="Agreements"
        title={`${pack.unsigned.length} still unsigned.`}
        copy={`Current policy is version ${pack.current}. A signature records that version. Publishing a new one never rewrites what a family already signed.`}
      >
        <NumRows
          rows={[
            { label: "Signed", value: String(pack.signed.length) },
            { label: "Unsigned", value: String(pack.unsigned.length), alert: pack.unsigned.length > 0 },
            { label: "Policy version", value: `v${pack.current}` },
          ]}
        />
        <Button
          type="button"
          variant="maroon"
          className="mt-4"
          data-teams-chase-all
          onClick={() => os.chaseAgreements()}
        >
          Chase all unsigned
        </Button>
        <ul className="mt-4 divide-y divide-line">
          {pack.unsigned.map((row) => (
            <li key={row.player.id} className="teams-row">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => os.openPlayer(row.team.id, row.player.id, "account")}
              >
                <span className="block text-sm font-semibold">{row.player.name}</span>
                <span className="text-xs text-teams-muted">{row.team.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <Fold title="Signed, by version">
          <ul className="divide-y divide-line">
            {pack.signed.slice(0, 24).map((row) => (
              <li key={row.player.id} className="teams-row flex items-center justify-between gap-3">
                <span className="text-sm">{row.player.name}</span>
                <span className="text-xs text-teams-muted">v{row.version}</span>
              </li>
            ))}
          </ul>
        </Fold>
      </DeskCard>
      <DeskCard
        eyebrow="Policy"
        title={`Version ${pack.current}`}
        copy={POLICY_LAWYER_NOTE}
      >
        <textarea
          className="min-h-48 w-full rounded-lg bg-paper p-3 text-sm shadow-border"
          value={text}
          data-teams-policy-text
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          type="button"
          variant="outlineDark"
          className="mt-3"
          data-teams-policy-version
          onClick={() => os.publishPolicy(text)}
        >
          Publish new version
        </Button>
        <p className="mt-3 text-xs text-teams-muted">{POLICY_LAWYER_NOTE}</p>
      </DeskCard>
    </div>
  );
}

export { alumniPublic };
