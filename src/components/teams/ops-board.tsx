import { Button } from "@/components/ui/button";
import { DeskCard, NumRows, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { useTeamsCopy } from "@/lib/teams/copy";
import {
  AUTOMATIONS,
  auditRows,
  automationReach,
  clubExports,
  type AlertBucket,
  type AutomationId,
  type RoleAlert,
} from "@/lib/teams/ops";
import { cn } from "@/lib/utils";

const BUCKETS: AlertBucket[] = ["today", "week", "fyi"];

function openAlert(os: ReturnType<typeof useTeams>, item: RoleAlert, onDesk?: (id: string) => void) {
  if (item.desk) {
    os.closeRecord();
    onDesk?.(item.desk);
    return;
  }
  if (item.record === "player" && item.playerId) {
    os.openPlayer(item.teamId, item.playerId, item.tab);
    return;
  }
  if (item.record === "team") {
    os.openTeam(item.teamId, item.tab);
    return;
  }
  os.openTeam(item.teamId, "roster");
}

export function AlertsBoard({ onDesk }: { onDesk?: (id: string) => void }) {
  const os = useTeams();
  const { t } = useTeamsCopy();
  const rows = (os.alerts || []) as RoleAlert[];
  if (rows.length === 0) {
    return (
      <TeamsEmpty
        title={t("alerts.empty", "This desk is quiet.")}
        copy={t("alerts.emptyCopy", "Nothing is late, resting, or missing paper.")}
        action="Open overview"
        onAction={() => {
          const osRole = os.role;
          if (osRole === "admin") onDesk?.("overview");
          else if (osRole === "parent") onDesk?.("home");
          else onDesk?.("today");
        }}
      />
    );
  }
  return (
    <div className="teams-stack" data-teams-alerts="true">
      {BUCKETS.map((bucket) => {
        const list = rows.filter((r) => (r.bucket || "fyi") === bucket);
        if (!list.length) return null;
        return (
          <DeskCard
            key={bucket}
            eyebrow={t(`bucket.${bucket}`, bucket)}
            title={
              bucket === "today"
                ? "Move these before you leave."
                : bucket === "week"
                  ? "This week still has time."
                  : "When the week is clear."
            }
          >
            <ul className="divide-y divide-line">
              {list.map((item) => (
                <li key={item.id || item.text}>
                  <button
                    type="button"
                    data-teams-alert={item.kind}
                    data-teams-alert-band={item.band}
                    data-teams-alert-bucket={item.bucket}
                    aria-label={`${item.kind}. ${item.text}. ${item.action}`}
                    onClick={() => openAlert(os, item, onDesk)}
                    className="teams-row flex min-h-11 w-full items-start justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="block text-xs font-semibold tracking-wide text-maroon uppercase">
                        {item.kind}
                        {item.band === "health" || item.band === "safety" ? " · first" : ""}
                      </span>
                      <span className="mt-1 block text-sm">{item.text}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tracking-wide text-maroon uppercase">
                      {item.action || "Open"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DeskCard>
        );
      })}
    </div>
  );
}

export function AutomationsBoard() {
  const os = useTeams();
  const flags = os.state.settings.automations || {};
  return (
    <div className="teams-stack" data-teams-automations="true">
      <DeskCard
        eyebrow="Automations"
        title="Staff should not chase a deposit by hand."
        copy="Each job shows who it would reach right now. Toggle arms the schedule. Run now fires once."
      >
        <ul className="divide-y divide-line">
          {AUTOMATIONS.map((job) => {
            const on = flags[job.id] !== false;
            const reach = automationReach(os.state, job.id);
            return (
              <li key={job.id} className="py-4" data-teams-auto={job.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{job.label}</p>
                    <p className="mt-1 text-xs text-teams-muted">
                      {job.when}. {job.copy}
                    </p>
                    <p className="mt-2 text-sm" data-teams-auto-reach={job.id}>
                      Reaches {reach} famil{reach === 1 ? "y" : "ies"} right now.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    data-teams-auto-toggle={job.id}
                    onClick={() => os.toggleAutomation(job.id, !on)}
                    className={cn(
                      "teams-control min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold tracking-wide uppercase",
                      on ? "bg-maroon text-fg-inverse" : "bg-paper text-teams-ink shadow-border",
                    )}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outlineDark"
                  size="sm"
                  className="mt-3"
                  data-teams-auto-run={job.id}
                  onClick={() => os.runAutomation(job.id)}
                >
                  Run now
                </Button>
              </li>
            );
          })}
        </ul>
      </DeskCard>
    </div>
  );
}

export function ExportsBoard() {
  const os = useTeams();
  const files = clubExports(os.state);
  return (
    <DeskCard
      eyebrow="Exports"
      title="Never run a business on data you cannot get out."
      copy="Every table as CSV. A full JSON backup of the club."
    >
      <ul className="divide-y divide-line">
        {files.map((file) => (
          <li key={file.id} className="teams-row flex items-center justify-between gap-3">
            <span className="text-sm">{file.label}</span>
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              data-teams-export={file.id}
              onClick={() => downloadText(file.filename, file.body, file.mime)}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
    </DeskCard>
  );
}

export function AuditBoard() {
  const os = useTeams();
  const rows = auditRows(os.state);
  if (!rows.length) {
    return (
      <TeamsEmpty
        title="Audit log is empty."
        copy="Waivers, withdrawals, credits, closures, and pay elections land here."
      />
    );
  }
  return (
    <DeskCard
      eyebrow="Audit"
      title="Who, what, when, and the detail."
      copy="Fee waivers, stat edits, withdrawals, credits, season closures, policy, pay elections, roster type."
    >
      <ul className="divide-y divide-line" data-teams-audit="true">
        {rows.slice(0, 40).map((row) => (
          <li key={row.id} className="teams-row">
            <p className="text-sm font-semibold">
              {row.action} · {row.actor}
            </p>
            <p className="mt-1 text-xs text-teams-muted">
              {row.when} · {row.detail}
            </p>
          </li>
        ))}
      </ul>
    </DeskCard>
  );
}

export function AutomationReachRows({ ids }: { ids?: AutomationId[] }) {
  const os = useTeams();
  const list = ids || AUTOMATIONS.map((a) => a.id);
  return (
    <NumRows
      rows={list.map((id) => ({
        label: AUTOMATIONS.find((a) => a.id === id)?.label || id,
        value: String(automationReach(os.state, id)),
      }))}
    />
  );
}
