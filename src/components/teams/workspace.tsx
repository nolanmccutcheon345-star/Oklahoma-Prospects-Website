import { FamilyDocuments, FamilyFees, FamilyHome, FamilyPlayer } from "@/components/teams/family-board";
import { OfficeBudget, OfficeCash, OfficeClose, OfficeCollections, OfficeOverview } from "@/components/teams/office-board";
import { AgreementsBoard, AnalyticsBoard, ArchiveBoard, TryoutBoard } from "@/components/teams/program-board";
import { StaffDesk } from "@/components/teams/staff-board";
import { DeskCard, DeskSkeleton, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { TeamsErrorBoundary } from "@/components/teams/error-boundary";
import { AlertsBoard, AuditBoard, AutomationsBoard, ExportsBoard } from "@/components/teams/ops-board";
import { ScheduleBoard } from "@/components/teams/schedule-board";
import { UniformBoard } from "@/components/teams/uniform-board";
import { EmergencyBoard } from "@/components/teams/emergency-board";
import { PacketBoard } from "@/components/teams/packet-board";
import { PitchBoard } from "@/components/teams/pitch-board";
import { FieldOpsBoard } from "@/components/teams/field-ops-board";
import { CageBoard } from "@/components/teams/cage-board";
import { ScoreBoard } from "@/components/teams/score-board";
import { TeamList, TeamRecord } from "@/components/teams/team-record";
import { PlayerRecord } from "@/components/teams/player-record";
import { useTeams } from "@/lib/teams/context";
import { TeamsLangProvider, useTeamsCopy, type TeamsLang } from "@/lib/teams/copy";
import { searchClub } from "@/lib/teams/ops";
import type { ClubRole } from "@/lib/club-data";
import {
  TEAM_DESKS,
  TEAM_ROLE_LABEL,
  TEAM_ROLES,
  TEAMS_OS,
  densityForTeamRole,
  formatTeamMoney,
} from "@/lib/teams/os";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

function BreakProbe({ section }: { section: string }) {
  const [boom, setBoom] = useState(false);
  if (!import.meta.env.DEV) return null;
  if (boom) throw new Error(`Deliberate Teams crash: ${section}`);
  return (
    <button
      type="button"
      data-teams-break="true"
      className={cn(
        "text-left text-xs font-semibold tracking-wide uppercase",
        TEAMS_OS.showRoleSwitcher ? "text-ok-maroon" : "sr-only",
      )}
      onClick={() => setBoom(true)}
    >
      Break this section
    </button>
  );
}

function AdminDesk({ desk, onDesk }: { desk: string; onDesk: (id: string) => void }) {
  const os = useTeams();

  if (desk === "overview") return <OfficeOverview />;
  if (desk === "alerts") return <AlertsBoard onDesk={onDesk} />;
  if (desk === "collections") return <OfficeCollections />;
  if (desk === "cash") return <OfficeCash />;
  if (desk === "budget") return <OfficeBudget />;
  if (desk === "close") return <OfficeClose />;
  if (desk === "automations") return <AutomationsBoard />;
  if (desk === "exports") return <ExportsBoard />;
  if (desk === "audit") return <AuditBoard />;

  if (desk === "teams") {
    return (
      <DeskCard
        eyebrow="Club"
        title="Every roster, one list."
        copy="Open a team record. We don't invent a team that isn't real."
      >
        <TeamList teams={os.visibleTeams} onOpen={(id) => os.openTeam(id)} />
      </DeskCard>
    );
  }
  if (desk === "staff") return <StaffDesk pane="pay" />;
  if (desk === "contractor payouts") return <StaffDesk pane="contractor payouts" />;
  if (desk === "tryouts" || desk === "recruiting") return <TryoutBoard />;
  if (desk === "analytics") return <AnalyticsBoard />;
  if (desk === "archive") return <ArchiveBoard />;
  if (desk === "agreements") return <AgreementsBoard />;
  if (desk === "settings") {
    const s = os.state.settings;
    return (
      <DeskCard
        eyebrow="Settings"
        title={s.orgName || TEAMS_OS.orgName}
        copy="Business config lives in one object. Change it once."
      >
        <NumRows
          rows={[
            { label: "Phone", value: TEAMS_OS.phone },
            { label: "Address", value: TEAMS_OS.addressLine },
            { label: "Membership / mo", value: formatTeamMoney(s.membershipMonthly) },
            { label: "Round fees to", value: formatTeamMoney(s.roundStep) },
            { label: "Role switcher", value: TEAMS_OS.showRoleSwitcher ? "On" : "Off" },
          ]}
        />
        <p className="mt-3 text-sm">
          <a href={TEAMS_OS.devAppUrl} className="font-semibold text-maroon">
            {TEAMS_OS.devAppUrl}
          </a>
        </p>
      </DeskCard>
    );
  }
  return <OfficeOverview />;
}

function CoachDesk({ desk, onDesk }: { desk: string; onDesk: (id: string) => void }) {
  const os = useTeams();
  const team = os.homeTeam;
  if (!team) {
    return (
      <TeamsEmpty
        title="No team is assigned to this coach."
        copy="Front office has to put you on a staff list first."
      />
    );
  }
  const next = (team.practices || [])[0];
  const unsigned = team.roster.filter((p) => !p.withdrawn && !p.agreement).length;

  if (desk === "alerts") return <AlertsBoard onDesk={onDesk} />;
  if (desk === "emergency") return <EmergencyBoard team={team} />;
  if (desk === "packet") return <PacketBoard team={team} />;
  if (desk === "pitches") return <PitchBoard team={team} />;
  if (desk === "game-day") return <ScoreBoard team={team} />;
  if (desk === "field") return <FieldOpsBoard team={team} pane="all" />;
  if (desk === "cages") return <CageBoard team={team} />;
  if (desk === "roster") {
    return (
      <DeskCard
        eyebrow="Roster"
        title="Who is eligible tonight."
        copy="Cleared, Account, Unsigned, Sizes, Docs. Never a dollar amount."
      >
        <ul className="divide-y divide-line">
          {team.roster
            .filter((p) => !p.withdrawn)
            .map((p) => {
              const clear = os.clearanceFor(p);
              const pitch = os.pitchFor(team, p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    data-teams-open-player={p.id}
                    data-teams-clearance={clear.status}
                    onClick={() => os.openPlayer(team.id, p.id)}
                    className="teams-row flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="text-sm">
                      #{p.number} {p.name}
                      {!pitch.available ? (
                        <span className="mt-1 block text-xs font-semibold text-ok-maroon">Resting</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "teams-num text-xs font-semibold tracking-wide uppercase",
                        clear.ok ? "text-teams-muted" : "text-ok-maroon",
                      )}
                    >
                      {clear.reason}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </DeskCard>
    );
  }
  if (desk === "schedule") {
    return <ScheduleBoard team={team} />;
  }
  if (desk === "uniforms") {
    return <UniformBoard team={team} />;
  }
  return (
    <DeskCard
      eyebrow="Today"
      title={next ? `${next.note || "Practice"} · ${next.time}` : "No session posted."}
      copy={next ? `${next.place || "Prospects cages"}. Arrive early.` : "Check the group thread."}
    >
      <NumRows
        rows={[
          { label: "Where", value: next?.place || "—" },
          { label: "Time", value: next?.time || "—" },
          {
            label: "Unsigned",
            value: String(unsigned),
            alert: unsigned > 0,
          },
        ]}
      />
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          className="text-sm font-semibold text-maroon"
          onClick={() => os.openTeam(team.id, "emergency")}
        >
          Open emergency cards
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-maroon"
          onClick={() => os.openTeam(team.id, "packet")}
        >
          Open tournament packet
        </button>
      </div>
    </DeskCard>
  );
}

function ParentDesk({
  desk,
  onDesk,
}: {
  desk: string;
  onDesk: (id: string) => void;
}) {
  const os = useTeams();
  const { t } = useTeamsCopy();
  const team = os.homeTeam;
  const player = os.homePlayer;
  if (!team || !player) {
    return (
      <TeamsEmpty
        title={t("parent.noPlayer")}
        copy={t("parent.noPlayerCopy")}
      />
    );
  }

  if (desk === "fees") return <FamilyFees team={team} player={player} />;
  if (desk === "alerts") return <AlertsBoard onDesk={onDesk} />;
  if (desk === "team") {
    const note = team.messages?.[0]?.text || team.announcements?.[0]?.body;
    return (
      <DeskCard eyebrow="Team" title={team.name} copy="Announcements, roster, and where to be.">
        {note ? (
          <p className="rounded-xl bg-cream/80 px-4 py-3 text-sm text-teams-ink">{note}</p>
        ) : (
          <p className="text-sm text-teams-muted">No announcement this week.</p>
        )}
        <button
          type="button"
          data-teams-open-team={team.id}
          className="mt-4 text-sm font-semibold text-maroon"
          onClick={() => os.openTeam(team.id)}
        >
          Open team record
        </button>
      </DeskCard>
    );
  }
  if (desk === "schedule") return <ScheduleBoard team={team} />;
  if (desk === "documents") return <FamilyDocuments team={team} player={player} />;
  if (desk === "my-player") return <FamilyPlayer team={team} player={player} />;
  if (desk === "cages") return <CageBoard team={team} />;
  return <FamilyHome team={team} player={player} onDesk={onDesk} />;
}

function PlayerSizes() {
  const os = useTeams();
  const team = os.homeTeam;
  const player = os.homePlayer;
  if (!team || !player) return null;
  const sizes = Object.entries(player.order?.sizes || {});
  return (
    <DeskCard
      eyebrow="Sizes"
      title={player.order?.submitted ? "Sizes are in." : "Sizes are still out."}
      copy="Jersey number and kit sizes. Nothing about what the kit costs."
    >
      <NumRows
        rows={[
          { label: "Jersey #", value: `#${player.order?.number ?? player.number}` },
          ...sizes.map(([k, v]) => ({ label: k, value: String(v) })),
        ]}
      />
      <button
        type="button"
        className="mt-4 text-sm font-semibold text-maroon"
        onClick={() => os.openPlayer(team.id, player.id, "uniform")}
      >
        {player.order?.submitted ? "Review sizes" : "Pick jersey number and sizes"}
      </button>
    </DeskCard>
  );
}

function PlayerDocs() {
  const os = useTeams();
  const player = os.homePlayer;
  if (!player) return null;
  return (
    <DeskCard
      eyebrow="Documents"
      title="Paper that keeps you on the field."
      copy="Waiver, birth certificate, insurance, physical. Status only — family uploads."
    >
      <NumRows
        rows={Object.keys(os.docLabels).map((k) => ({
          label: os.docLabels[k],
          value: player.docs?.[k] ? "On file" : "Missing",
          alert: !player.docs?.[k],
        }))}
      />
    </DeskCard>
  );
}

function PlayerDesk({ desk, onDesk }: { desk: string; onDesk: (id: string) => void }) {
  const os = useTeams();
  const { t } = useTeamsCopy();
  const team = os.homeTeam;
  const player = os.homePlayer;
  if (!team || !player) {
    return (
      <TeamsEmpty
        title={t("player.noRoster")}
        copy={t("player.noRosterCopy")}
      />
    );
  }
  const next = (team.practices || [])[0];
  if (desk === "alerts") return <AlertsBoard onDesk={onDesk} />;
  if (desk === "schedule") return <ScheduleBoard team={team} />;
  if (desk === "chat") return <FieldOpsBoard team={team} pane="chat" />;
  if (desk === "documents") return <PlayerDocs />;
  if (desk === "sizes") return <PlayerSizes />;
  if (desk === "team") {
    return (
      <DeskCard eyebrow="Team" title={team.name} copy="Your guys. Numbers stay lined up.">
        <NumRows
          rows={team.roster
            .filter((p) => !p.withdrawn)
            .slice(0, 8)
            .map((p) => ({
              label: p.name,
              value: `#${p.number}`,
            }))}
        />
      </DeskCard>
    );
  }
  if (desk === "stats") {
    const s = player.stats || {};
    if (!Number(s.gp)) {
      return (
        <TeamsEmpty
          title={t("player.noStats")}
          copy={t("player.noStatsCopy")}
          action={t("player.openRecord")}
          onAction={() => os.openPlayer(team.id, player.id, "stats")}
        />
      );
    }
    return (
      <DeskCard eyebrow="Stats" title="The work shows up here." copy="Tabular numerals so .312 and .298 don't dance.">
        <NumRows
          rows={[
            { label: "AVG", value: Number(s.avg) ? Number(s.avg).toFixed(3).replace(/^0/, "") : "—" },
            { label: "OPS", value: Number(s.ops) ? Number(s.ops).toFixed(3).replace(/^0/, "") : "—" },
            ...(s.velo ? [{ label: "Velo", value: `${s.velo}` }] : []),
            ...(s.ip ? [{ label: "IP", value: String(s.ip) }] : []),
          ]}
        />
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-maroon"
          onClick={() => os.openPlayer(team.id, player.id, "stats")}
        >
          {t("player.openRecord")}
        </button>
      </DeskCard>
    );
  }
  if (desk === "cages") return <CageBoard team={team} />;
  return (
    <DeskCard
      eyebrow="Today"
      title={next ? `${next.place || "Cages"} at ${next.time}.` : "No session posted."}
      copy="Be in the building early. That's the whole message."
    >
      <NumRows
        rows={[
          { label: "Where", value: next?.place || "Prospects cages" },
          { label: "Time", value: next?.time || "—" },
        ]}
      />
      <button
        type="button"
        data-teams-open-player={player.id}
        className="mt-4 text-sm font-semibold text-maroon"
        onClick={() => os.openPlayer(team.id, player.id)}
      >
        Open my record
      </button>
    </DeskCard>
  );
}

function TeamNotices() {
  const os = useTeams();
  const note = os.notes[0];
  if (!note) return null;
  return (
    <p
      className="rounded-xl bg-cream px-4 py-3 text-sm text-teams-ink"
      data-teams-note="true"
      data-teams-note-kind={note.kind}
      data-teams-note-audience={note.audience || "admin"}
    >
      <span className="font-semibold">{note.title}.</span> {note.body}
    </p>
  );
}

function DeskBody({
  role,
  desk,
  onDesk,
}: {
  role: ClubRole;
  desk: string;
  onDesk: (id: string) => void;
}) {
  if (role === "admin") return <AdminDesk desk={desk} onDesk={onDesk} />;
  if (role === "coach") return <CoachDesk desk={desk} onDesk={onDesk} />;
  if (role === "parent") return <ParentDesk desk={desk} onDesk={onDesk} />;
  return <PlayerDesk desk={desk} onDesk={onDesk} />;
}

function NextLevel({ deskId }: { deskId: string }) {
  const os = useTeams();
  const chips: { label: string; run: () => void }[] = [];
  if (deskId === "teams" || deskId === "overview" || deskId === "my-team") {
    os.visibleTeams.slice(0, 3).forEach((t) =>
      chips.push({ label: t.name.replace("Prospects ", ""), run: () => os.openTeam(t.id) }),
    );
  }
  if (deskId === "roster" && os.homeTeam) {
    os.homeTeam.roster
      .filter((p) => !p.withdrawn)
      .slice(0, 3)
      .forEach((p) =>
        chips.push({
          label: p.name.split(" ")[0],
          run: () => os.openPlayer(os.homeTeam!.id, p.id),
        }),
      );
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.run}
          className="teams-control rounded-full bg-ink px-3 text-xs font-semibold tracking-wide text-fg-inverse uppercase"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function TeamsWorkspace() {
  const [lang, setLang] = useState<TeamsLang>("en");
  return (
    <TeamsLangProvider lang={lang} setLang={setLang}>
      <TeamsWorkspaceInner />
    </TeamsLangProvider>
  );
}

function TeamsWorkspaceInner() {
  const os = useTeams();
  const { t, lang, setLang } = useTeamsCopy();
  const role = os.role;
  const desks = TEAM_DESKS[role];
  const [desk, setDesk] = useState<string>(desks[0]?.id ?? "overview");
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState(false);
  const density = densityForTeamRole(role);
  const recordOpen = os.view.kind !== "desk";
  const hits = searchClub(os.state, query).filter((hit) => {
    if (hit.kind !== "player" || !hit.teamId || !hit.playerId) return true;
    if (role === "admin" || role === "coach") return true;
    if (role === "parent") {
      return os.myPlayers.some((p) => p.id === hit.playerId);
    }
    return os.homePlayer?.id === hit.playerId;
  });
  const familyLang = role === "parent" || role === "player";

  useEffect(() => {
    setDesk(TEAM_DESKS[role][0]?.id ?? "overview");
    setSwitching(true);
    const id = window.setTimeout(() => setSwitching(false), 180);
    return () => window.clearTimeout(id);
  }, [role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") os.closeRecord();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [os]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-teams-tab="${desk}"]`);
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [desk]);

  const section = `${TEAM_ROLE_LABEL[role]} · ${desk}`;

  return (
    <div
      className="teams-os"
      data-density={density}
      data-teams-role={role}
      data-teams-lang={lang}
      data-teams-player-surface={role === "player" ? "true" : undefined}
    >
      {os.coachScopeReport && TEAMS_OS.showRoleSwitcher ? (
        <pre className="sr-only" data-teams-coach-scope={JSON.stringify(os.coachScopeReport)} />
      ) : null}
      {TEAMS_OS.showRoleSwitcher ? (
        <section className="mb-5 overflow-hidden rounded-2xl bg-paper-2 shadow-border">
          <div className="h-1 bg-maroon" />
          <div className="teams-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Preview team desks
            </p>
            <h2 className="mt-2 text-3xl">
              {TEAM_ROLE_LABEL[role]} view
            </h2>
            <p className="mt-2 text-sm text-teams-muted">
              Admin and coach are compact. Parent and player are comfortable.
              Open a team or a player — the record is the deepest screen.
            </p>
            <div
              role="tablist"
              aria-label="Preview role"
              className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-ink p-1"
            >
              {TEAM_ROLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  data-teams-view-as={item}
                  aria-selected={role === item}
                  onClick={() => os.setRole(item)}
                  className={cn(
                    "teams-control rounded-lg px-2 text-xs font-semibold tracking-wide uppercase",
                    role === item ? "bg-maroon text-fg-inverse" : "text-fg-soft",
                  )}
                >
                  {TEAM_ROLE_LABEL[item]}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <label className="mb-4 grid gap-1" data-teams-search="true">
        <span className="text-xs font-semibold tracking-wide text-maroon uppercase">
          {t("search.placeholder")}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm text-teams-ink shadow-border"
        />
      </label>
      {query.trim().length >= 2 ? (
        <ul className="mb-4 divide-y divide-line rounded-2xl bg-paper-2 shadow-border">
          {hits.length === 0 ? (
            <li className="teams-row text-sm text-teams-muted">{t("search.empty")}</li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  aria-label={`${hit.kind} ${hit.label}`}
                  className="teams-row flex min-h-11 w-full items-center justify-between gap-3 text-left"
                  onClick={() => {
                    setQuery("");
                    if (hit.kind === "player" && hit.teamId && hit.playerId) {
                      os.openPlayer(hit.teamId, hit.playerId);
                    } else if (hit.kind === "team" && hit.teamId) {
                      os.openTeam(hit.teamId);
                    } else if (hit.teamId) {
                      os.openTeam(hit.teamId, "schedule");
                    }
                  }}
                >
                  <span>
                    <span className="block text-xs font-semibold tracking-wide text-maroon uppercase">
                      {hit.kind}
                    </span>
                    <span className="mt-1 block text-sm">{hit.label}</span>
                  </span>
                  <span className="text-xs text-teams-muted">{hit.detail}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {familyLang ? (
        <div className="mb-4 flex gap-1" role="group" aria-label="Language">
          {(["en", "es"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              data-teams-set-lang={code}
              onClick={() => setLang(code)}
              className={cn(
                "teams-control min-h-11 rounded-lg px-4 text-xs font-semibold uppercase",
                lang === code ? "bg-maroon text-fg-inverse" : "bg-paper text-teams-ink shadow-border",
              )}
            >
              {t(`lang.${code}`)}
            </button>
          ))}
        </div>
      ) : null}

      <TeamsErrorBoundary section="Team management">
        {recordOpen ? null : (
          <div
            role="tablist"
            aria-label={`${TEAM_ROLE_LABEL[role]} desks`}
            className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-ink p-1 text-fg-inverse"
          >
            {desks.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-teams-tab={item.id}
                aria-selected={desk === item.id}
                aria-current={desk === item.id ? "page" : undefined}
                onClick={() => {
                  os.closeRecord();
                  setDesk(item.id);
                  setSwitching(true);
                  window.setTimeout(() => setSwitching(false), 180);
                }}
                className={cn(
                  "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
                  desk === item.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
                )}
              >
                {t(`desk.${item.id}`, item.label)}
              </button>
            ))}
          </div>
        )}

        <div className="teams-stack mt-5">
          {switching ? (
            <DeskSkeleton />
          ) : os.view.kind === "team" ? (
            <TeamRecord teamId={os.view.teamId} tab={os.view.tab} />
          ) : os.view.kind === "player" ? (
            <PlayerRecord
              teamId={os.view.teamId}
              playerId={os.view.playerId}
              tab={os.view.tab}
            />
          ) : (
            <TeamsErrorBoundary section={section}>
              <BreakProbe section={section} />
              <TeamNotices />
              <DeskBody role={role} desk={desk} onDesk={setDesk} />
              <NextLevel deskId={desk} />
            </TeamsErrorBoundary>
          )}
        </div>
      </TeamsErrorBoundary>

      {os.undoLabel ? (
        <div
          role="status"
          aria-live="polite"
          data-teams-undo="true"
          className="fixed right-4 bottom-4 z-20 flex min-h-11 items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse shadow-border"
        >
          <span>{os.undoLabel}</span>
          <button
            type="button"
            className="text-xs font-semibold tracking-wide text-powder uppercase"
            onClick={() => os.undoLast()}
          >
            {t("undo")}
          </button>
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-xs text-teams-muted">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
        Density is {density}. {TEAMS_OS.orgName} · {TEAMS_OS.phone}
      </p>
    </div>
  );
}

