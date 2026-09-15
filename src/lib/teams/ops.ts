import type { ClubOs, OsAlert, OsPlayer, OsTeam } from "./model";
import { TODAY, addDays, iso } from "./engine/00-helpers.js";
import { payoffDeadline, playerBalance, playerFee, priceTeam } from "./engine/02-pricing.js";
import { logAudit, missingDocs, notify, pitcherStatus } from "./engine/03-domain.js";
import { collectionsOf, hasBackupCard } from "./money.ts";
import { normalizeRsvp, scheduledEvents } from "./schedule.ts";

export type AlertBand = "health" | "safety" | "ops" | "money";
export type AlertBucket = "today" | "week" | "fyi";

export type RoleAlert = OsAlert & {
  id: string;
  band: AlertBand;
  bucket: AlertBucket;
  playerId?: string;
  action: string;
  desk?: string;
  record?: "team" | "player";
  tab?: string;
};

export type AutomationId =
  | "dueReminder"
  | "pastDue"
  | "retryBackup"
  | "docChase"
  | "sizeChase"
  | "rsvpChase"
  | "weeklyDigest";

export const AUTOMATIONS: {
  id: AutomationId;
  label: string;
  when: string;
  copy: string;
}[] = [
  {
    id: "dueReminder",
    label: "Payment reminder",
    when: "Seven days before each scheduled draft",
    copy: "A family who has a draft coming does not wait on a staff reminder.",
  },
  {
    id: "pastDue",
    label: "Past-due chase",
    when: "Every morning once the balance is late",
    copy: "Past-due sits at the top of collections until it clears.",
  },
  {
    id: "retryBackup",
    label: "Failed-draft retry",
    when: "Backup card, next morning",
    copy: "Primary failed. Backup is on file. Staff does not re-key a card.",
  },
  {
    id: "docChase",
    label: "Paperwork chase",
    when: "Weekly until the four documents are in",
    copy: "Waiver, birth certificate, insurance, physical.",
  },
  {
    id: "sizeChase",
    label: "Uniform size chase",
    when: "Weekly until sizes are submitted",
    copy: "Jersey number and sizes. Nobody is chasing a shirt size by text.",
  },
  {
    id: "rsvpChase",
    label: "Availability chase",
    when: "Ten days before each event",
    copy: "Holdouts get one ping. The packet cannot wait on a maybe.",
  },
  {
    id: "weeklyDigest",
    label: "Sunday digest",
    when: "Every family, Sunday",
    copy: "Where to be, what is due, what is still out. One note, not seven.",
  },
];

const BAND_RANK: Record<AlertBand, number> = { health: 0, safety: 1, ops: 2, money: 3 };
const BUCKET_RANK: Record<AlertBucket, number> = { today: 0, week: 1, fyi: 2 };

function familiesOf(players: OsPlayer[]): string[] {
  const seen = new Set<string>();
  for (const p of players) {
    seen.add(p.familyId || p.id);
  }
  return [...seen];
}

function active(team: OsTeam): OsPlayer[] {
  return team.roster.filter((p) => !p.withdrawn);
}

function daysFromToday(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const a = new Date(iso(TODAY) + "T12:00:00").getTime();
  const b = new Date(`${iso(value)}T12:00:00`).getTime();
  if (Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

export function dueSoonPlayers(club: ClubOs): OsPlayer[] {
  const out: OsPlayer[] = [];
  for (const team of club.teams) {
    for (const player of active(team)) {
      const due = Number(playerBalance(club, team, player)) || 0;
      if (due <= 0) continue;
      if (!player.depositPaid) {
        out.push(player);
        continue;
      }
      const rows = player.planLock?.rows || [];
      const hit = rows.some((row) => {
        if (!row.due || row.due === "On invite acceptance") return false;
        const n = daysFromToday(row.due);
        return n != null && n >= 0 && n <= 7;
      });
      if (hit) out.push(player);
    }
  }
  return out;
}

export function pastDuePlayers(club: ClubOs): { team: OsTeam; player: OsPlayer; balance: number }[] {
  return collectionsOf(club).filter((r) => r.pastDue);
}

export function failedDraftPlayers(club: ClubOs): OsPlayer[] {
  return club.teams.flatMap((t) =>
    active(t).filter((p) => Boolean((p as OsPlayer & { failedDraft?: boolean }).failedDraft) && hasBackupCard(p)),
  );
}

export function docsOutPlayers(club: ClubOs): OsPlayer[] {
  return club.teams.flatMap((t) => active(t).filter((p) => (missingDocs(p) as string[]).length > 0));
}

export function sizesOutPlayers(club: ClubOs): OsPlayer[] {
  return club.teams.flatMap((t) => active(t).filter((p) => !p.order?.submitted));
}

export function rsvpHoldoutPlayers(club: ClubOs): OsPlayer[] {
  const horizon = iso(addDays(TODAY, 10));
  const today = iso(TODAY);
  const out: OsPlayer[] = [];
  for (const team of club.teams) {
    const events = scheduledEvents(team, club.catalog).filter(
      (e) => e.start >= today && e.start <= horizon,
    );
    for (const event of events) {
      for (const player of active(team)) {
        const mark = normalizeRsvp(team.rsvps?.[event.id]?.[player.id]);
        if (mark !== "going") out.push(player);
      }
    }
  }
  return out;
}

export function digestFamilies(club: ClubOs): string[] {
  return familiesOf(club.teams.flatMap((t) => active(t)));
}

export function automationReach(club: ClubOs, id: AutomationId): number {
  if (id === "dueReminder") return familiesOf(dueSoonPlayers(club)).length;
  if (id === "pastDue") return familiesOf(pastDuePlayers(club).map((r) => r.player)).length;
  if (id === "retryBackup") return familiesOf(failedDraftPlayers(club)).length;
  if (id === "docChase") return familiesOf(docsOutPlayers(club)).length;
  if (id === "sizeChase") return familiesOf(sizesOutPlayers(club)).length;
  if (id === "rsvpChase") return familiesOf(rsvpHoldoutPlayers(club)).length;
  if (id === "weeklyDigest") return digestFamilies(club).length;
  return 0;
}

export function applyToggleAutomation(club: ClubOs, id: AutomationId, on: boolean, actor: string): ClubOs {
  if (!club.settings.automations) club.settings.automations = {};
  club.settings.automations[id] = on;
  logAudit(club, actor, "automation", `${id} ${on ? "on" : "off"}`);
  return club;
}

export function applyRunAutomation(
  club: ClubOs,
  id: AutomationId,
  actor: string,
): { ok: boolean; reached: number } {
  const reached = automationReach(club, id);
  const def = AUTOMATIONS.find((a) => a.id === id);
  if (!def) return { ok: false, reached: 0 };
  const teamId = club.teams[0]?.id || "";
  const body =
    id === "weeklyDigest"
      ? `Sunday digest is queued for ${reached} famil${reached === 1 ? "y" : "ies"}.`
      : `${def.label} queued for ${reached} famil${reached === 1 ? "y" : "ies"}.`;
  notify(club, teamId, def.label, body, "chase", "family");
  logAudit(club, actor, "automation-run", `${id} ${reached}`);
  return { ok: true, reached };
}

function pushAlert(
  items: RoleAlert[],
  input: Omit<RoleAlert, "id"> & { id?: string },
) {
  items.push({
    id: input.id || `${input.kind}-${input.teamId}-${input.playerId || "team"}-${input.text.slice(0, 24)}`,
    kind: input.kind,
    teamId: input.teamId,
    text: input.text,
    band: input.band,
    bucket: input.bucket,
    playerId: input.playerId,
    action: input.action,
    desk: input.desk,
    record: input.record,
    tab: input.tab,
  });
}

export function buildAlerts(club: ClubOs): RoleAlert[] {
  const items: RoleAlert[] = [];
  const today = iso(TODAY);
  const week = iso(addDays(TODAY, 7));

  for (const team of club.teams) {
    for (const player of active(team)) {
      const pitch = pitcherStatus(team, player.id) as {
        available: boolean;
        last: { pitches: number; date: string } | null;
        need: number;
        readyOn: string | null;
      };
      if (!pitch.available && pitch.last) {
        const ready = pitch.readyOn || today;
        pushAlert(items, {
          kind: "Pitches",
          band: "health",
          bucket: ready <= today ? "today" : ready <= week ? "week" : "fyi",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} is resting after ${pitch.last.pitches} pitches. Back ${ready}.`,
          action: "Open pitch log",
          record: "player",
          tab: "measurables",
        });
      }
      const miss = (missingDocs(player) as string[]) || [];
      if (miss.length) {
        pushAlert(items, {
          kind: "Docs",
          band: "ops",
          bucket: "week",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} on ${team.name} is missing ${miss.length === 1 ? "a document" : "documents"}.`,
          action: "Open documents",
          record: "player",
          tab: "documents",
        });
      }
      if (!player.agreement) {
        pushAlert(items, {
          kind: "Agreement",
          band: "ops",
          bucket: "week",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} on ${team.name} has not signed the team agreement.`,
          action: "Open account",
          record: "player",
          tab: "account",
        });
      }
      if (!player.order?.submitted) {
        const dl = team.uniformDeadline;
        const n = daysFromToday(dl);
        pushAlert(items, {
          kind: "Uniforms",
          band: "ops",
          bucket: n != null && n <= 7 ? "week" : "fyi",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} on ${team.name} still has sizes out.`,
          action: "Open sizes",
          record: "player",
          tab: "uniform",
        });
      }
      const e = player.emergency;
      if (e && (e.allergies || e.conditions) && !(e.pickup || []).length) {
        pushAlert(items, {
          kind: "Emergency",
          band: "safety",
          bucket: "week",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} has a medical note and no pickup list.`,
          action: "Open emergency card",
          record: "player",
          tab: "emergency",
        });
      }
    }

    const dl = (() => {
      try {
        return payoffDeadline(club, team);
      } catch {
        return null;
      }
    })();
    for (const player of active(team)) {
      const bal = Number(playerBalance(club, team, player)) || 0;
      if (!player.depositPaid) {
        pushAlert(items, {
          kind: "Money",
          band: "money",
          bucket: "today",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} on ${team.name} has not paid the deposit.`,
          action: "Open collections",
          desk: "collections",
          record: "player",
          tab: "account",
        });
      } else if (dl && bal > 0 && iso(TODAY) > iso(dl)) {
        pushAlert(items, {
          kind: "Money",
          band: "money",
          bucket: "today",
          teamId: team.id,
          playerId: player.id,
          text: `${player.name} on ${team.name} is past due.`,
          action: "Open collections",
          desk: "collections",
          record: "player",
          tab: "account",
        });
      }
    }

    if ((team.tournamentIds || []).length === 0) {
      pushAlert(items, {
        kind: "Schedule",
        band: "ops",
        bucket: "fyi",
        teamId: team.id,
        text: `${team.name} has no events on the schedule.`,
        action: "Open schedule",
        record: "team",
        tab: "schedule",
      });
    }
    if (active(team).length < 10) {
      pushAlert(items, {
        kind: "Roster",
        band: "ops",
        bucket: "fyi",
        teamId: team.id,
        text: `${team.name} is under the ten-player funding line at ${active(team).length}.`,
        action: "Open roster",
        record: "team",
        tab: "roster",
      });
    }
  }

  for (const call of club.fieldCalls || []) {
    const when = iso(call.at || TODAY);
    pushAlert(items, {
      kind: "Field",
      band: "safety",
      bucket: when <= today ? "today" : when <= week ? "week" : "fyi",
      teamId: call.teamId,
      text: `${call.status} — ${call.note || "Field call posted."}`,
      action: "Open field calls",
      record: "team",
      tab: "field-calls",
    });
  }

  items.sort((a, b) => {
    if (BAND_RANK[a.band] !== BAND_RANK[b.band]) return BAND_RANK[a.band] - BAND_RANK[b.band];
    if (BUCKET_RANK[a.bucket] !== BUCKET_RANK[b.bucket]) return BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
    if (a.kind === "Money" && b.kind === "Money") {
      const ap = a.text.includes("past due") ? 0 : 1;
      const bp = b.text.includes("past due") ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return a.text.localeCompare(b.text);
  });
  return items;
}

export function alertsForRole(
  club: ClubOs,
  role: "admin" | "coach" | "parent" | "player",
  identity: { teamId: string | null; familyId: string | null; playerId: string | null },
): RoleAlert[] {
  const all = buildAlerts(club);
  if (role === "admin") return all;
  if (role === "coach") {
    return all.filter(
      (a) =>
        a.teamId === identity.teamId &&
        a.band !== "money" &&
        a.kind !== "Money" &&
        !/\$/.test(a.text),
    );
  }
  if (role === "parent") {
    const names = new Set(
      club.teams.flatMap((t) =>
        t.roster.filter((p) => p.familyId === identity.familyId).map((p) => p.name),
      ),
    );
    return all.filter(
      (a) =>
        (a.playerId &&
          club.teams.some((t) => t.roster.some((p) => p.id === a.playerId && p.familyId === identity.familyId))) ||
        [...names].some((n) => a.text.includes(n)),
    );
  }
  return all.filter((a) => {
    if (a.band === "money" || a.kind === "Money") return false;
    if (/\$|usd|\bbudget\b|% of budget|entry fee/i.test(a.text)) return false;
    if (identity.playerId && a.playerId && a.playerId !== identity.playerId) return false;
    if (identity.teamId && a.teamId !== identity.teamId) return false;
    return a.band === "health" || a.band === "safety" || a.band === "ops";
  });
}

export type SearchHit = {
  kind: "player" | "team" | "event";
  id: string;
  teamId?: string;
  playerId?: string;
  label: string;
  detail: string;
};

export function searchClub(club: ClubOs, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const team of club.teams) {
    if (team.name.toLowerCase().includes(q) || String(team.age).toLowerCase().includes(q)) {
      hits.push({
        kind: "team",
        id: team.id,
        teamId: team.id,
        label: team.name,
        detail: `${team.age} ${team.level} · ${team.seasonLabel}`,
      });
    }
    for (const player of active(team)) {
      if (player.name.toLowerCase().includes(q) || String(player.number).includes(q)) {
        hits.push({
          kind: "player",
          id: player.id,
          teamId: team.id,
          playerId: player.id,
          label: player.name,
          detail: `${team.name.replace("Prospects ", "")} · #${player.number}`,
        });
      }
    }
  }
  for (const event of club.catalog) {
    if (
      event.name.toLowerCase().includes(q) ||
      event.city.toLowerCase().includes(q) ||
      event.org.toLowerCase().includes(q)
    ) {
      hits.push({
        kind: "event",
        id: event.id,
        label: event.name,
        detail: `${event.city}, ${event.state} · ${event.start}`,
      });
    }
  }
  return hits.slice(0, 12);
}

export type ExportFile = { id: string; label: string; filename: string; body: string; mime: string };

export function clubExports(club: ClubOs): ExportFile[] {
  const players = club.teams.flatMap((t) =>
    active(t).map((p) => ({ team: t, player: p })),
  );
  const files: ExportFile[] = [
    {
      id: "players",
      label: "Players and balances",
      filename: "players-balances.csv",
      mime: "text/csv",
      body: csv(
        ["team", "player", "number", "balance", "fee", "deposit", "unsigned", "docs"],
        players.map(({ team, player }) => [
          team.name,
          player.name,
          player.number,
          playerBalance(club, team, player),
          playerFee(club, team, player),
          player.depositPaid ? "paid" : "due",
          player.agreement ? "signed" : "unsigned",
          ((missingDocs(player) as string[]) || []).join("|"),
        ]),
      ),
    },
    {
      id: "teams",
      label: "Teams and margin",
      filename: "teams-margin.csv",
      mime: "text/csv",
      body: csv(
        ["team", "age", "roster", "forecast", "realized", "closed"],
        club.teams.map((t) => {
          const priced = priceTeam(club, t) as { forecastMargin: number; realizedMargin: number | null };
          return [
            t.name,
            t.age,
            active(t).length,
            priced.forecastMargin,
            priced.realizedMargin ?? "",
            t.closed ? "yes" : "no",
          ];
        }),
      ),
    },
    {
      id: "payments",
      label: "Payments",
      filename: "payments.csv",
      mime: "text/csv",
      body: csv(
        ["team", "player", "date", "amount", "fee", "charged", "method", "receipt"],
        players.flatMap(({ team, player }) =>
          (player.payments || []).map((p) => [
            team.name,
            player.name,
            p.date || "",
            p.amount,
            p.fee ?? 0,
            p.totalCharged ?? p.amount,
            p.method || "",
            p.receipt || "",
          ]),
        ),
      ),
    },
    {
      id: "schedule",
      label: "Schedule",
      filename: "schedule.csv",
      mime: "text/csv",
      body: csv(
        ["team", "event", "org", "city", "start", "end", "fee"],
        club.teams.flatMap((t) =>
          scheduledEvents(t, club.catalog).map((e) => [
            t.name,
            e.name,
            e.org,
            e.city,
            e.start,
            e.end,
            e.fee,
          ]),
        ),
      ),
    },
    {
      id: "stats",
      label: "Stats",
      filename: "stats.csv",
      mime: "text/csv",
      body: csv(
        ["team", "player", "gp", "avg", "ops", "velo", "ip"],
        players.map(({ team, player }) => [
          team.name,
          player.name,
          player.stats?.gp ?? 0,
          player.stats?.avg ?? "",
          player.stats?.ops ?? "",
          player.stats?.velo ?? "",
          player.stats?.ip ?? "",
        ]),
      ),
    },
    {
      id: "payouts",
      label: "Payouts",
      filename: "payouts.csv",
      mime: "text/csv",
      body: csv(
        ["id", "team", "staff", "amount", "date"],
        (club.payouts || []).map((p) => [p.id, p.teamId, p.staffId, p.amount, p.date]),
      ),
    },
    {
      id: "reimbursements",
      label: "Reimbursements",
      filename: "reimbursements.csv",
      mime: "text/csv",
      body: csv(
        ["team", "staff", "amount", "date", "note", "status"],
        (club.reimbursements || []).map((r) => [r.teamId, r.staffEmail, r.amount, r.date, r.note, r.status]),
      ),
    },
    {
      id: "recruiting",
      label: "Recruiting pipeline",
      filename: "recruiting.csv",
      mime: "text/csv",
      body: csv(
        ["name", "age", "position", "status"],
        (club.leads || []).map((l) => [l.name, l.ageGroup, l.position, l.status]),
      ),
    },
    {
      id: "alumni",
      label: "Alumni",
      filename: "alumni.csv",
      mime: "text/csv",
      body: csv(
        ["name", "grad", "kind", "school", "division", "position"],
        (club.alumni || []).map((a) => [a.name, a.gradYear, a.kind, a.school, a.division, a.position]),
      ),
    },
    {
      id: "uniforms",
      label: "Uniform orders",
      filename: "uniforms.csv",
      mime: "text/csv",
      body: csv(
        ["team", "player", "number", "submitted", "sizes"],
        players.map(({ team, player }) => [
          team.name,
          player.name,
          player.order?.number ?? player.number,
          player.order?.submitted ? "yes" : "no",
          Object.entries(player.order?.sizes || {})
            .map(([k, v]) => `${k}:${v}`)
            .join("|"),
        ]),
      ),
    },
    {
      id: "emergency",
      label: "Emergency contacts",
      filename: "emergency.csv",
      mime: "text/csv",
      body: csv(
        ["team", "player", "allergies", "conditions", "insurer", "physician", "pickup", "parent", "phone"],
        players.map(({ team, player }) => [
          team.name,
          player.name,
          player.emergency?.allergies || "",
          player.emergency?.conditions || "",
          player.emergency?.insurer || "",
          player.emergency?.physician || "",
          (player.emergency?.pickup || []).join("|"),
          player.parents?.[0]?.name || "",
          player.parents?.[0]?.phone || "",
        ]),
      ),
    },
    {
      id: "audit",
      label: "Audit log",
      filename: "audit.csv",
      mime: "text/csv",
      body: csv(
        ["when", "actor", "action", "detail"],
        (club.audit || []).map((a) => [
          a.at || (a.ts ? new Date(a.ts).toISOString() : ""),
          a.actor || "",
          a.action || "",
          a.detail || "",
        ]),
      ),
    },
    {
      id: "archive",
      label: "Archived seasons",
      filename: "archive.csv",
      mime: "text/csv",
      body: csv(
        ["team", "season", "closed", "realized", "roster"],
        (club.archive || []).map((row) => [
          row.name,
          row.seasonLabel,
          row.closedAt,
          row.realized,
          (row.roster || []).map((p) => p.name).join("|"),
        ]),
      ),
    },
    {
      id: "json",
      label: "Full JSON backup",
      filename: "prospects-club.json",
      mime: "application/json",
      body: JSON.stringify(club, null, 2),
    },
  ];
  return files;
}

export function auditRows(club: ClubOs) {
  return (club.audit || []).map((a) => ({
    id: a.id || `${a.ts}-${a.action}`,
    when: a.at || (a.ts ? new Date(Number(a.ts)).toLocaleString("en-US") : "—"),
    actor: a.actor || "—",
    action: a.action || "—",
    detail: a.detail || "",
  }));
}
