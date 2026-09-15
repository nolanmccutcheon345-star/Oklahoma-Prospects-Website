import type {
  ClubOs,
  OsPlayer,
  OsPurchaseOrder,
  OsPoStatus,
  OsTeam,
  OsUniform,
  OsUniformPhoto,
} from "./model";
import { PHOTO_SLOTS, SIZE_OPTS, UNIFORMS } from "./engine/01-catalog.js";
import { iso, uid } from "./engine/00-helpers.js";
import { logAudit, notify } from "./engine/03-domain.js";

function numbersTaken(team: OsTeam, exceptId?: string | null): Set<string> {
  return new Set(
    team.roster
      .filter((p) => !p.withdrawn && p.id !== exceptId)
      .map((p) => String(p.number)),
  );
}

export { PHOTO_SLOTS, SIZE_OPTS };

export const PO_FLOW: OsPoStatus[] = [
  "draft",
  "submitted",
  "in-production",
  "shipped",
  "delivered",
];

export const PO_STATUS_LABEL: Record<OsPoStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  "in-production": "In production",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const REORDER_REASONS = [
  { id: "lost", label: "Lost kit" },
  { id: "growth", label: "Growth spurt" },
  { id: "late-add", label: "Late add" },
] as const;

export function sizeFieldsOf(pkg: OsUniform | null | undefined): string[] {
  if (!pkg) return [];
  if (pkg.sizes?.length) return pkg.sizes;
  return pkg.sizeFields || [];
}

export function sizeOpts(field: string): string[] {
  const table = SIZE_OPTS as Record<string, string[]>;
  return table[field] || ["YS", "YM", "YL", "S", "M", "L", "XL"];
}

export function approvedPackages(uniforms: OsUniform[], sport: string): OsUniform[] {
  return uniforms.filter((u) => u.sport === sport && u.approved !== false);
}

export function photosFor(photos: OsUniformPhoto[] | undefined, packageId: string): OsUniformPhoto[] {
  return (photos || []).filter((p) => p.packageId === packageId);
}

export function photoFor(
  photos: OsUniformPhoto[] | undefined,
  packageId: string,
  slot: string,
): OsUniformPhoto | null {
  return (photos || []).find((p) => p.packageId === packageId && p.slot === slot) ?? null;
}

export function sizeSheetComplete(player: OsPlayer, pkg: OsUniform | null | undefined): boolean {
  if (!player.order?.submitted) return false;
  const need = sizeFieldsOf(pkg);
  if (!need.length) return true;
  return need.every((field) => Boolean(player.order?.sizes?.[field]));
}

export function incompleteSizeSheets(
  team: OsTeam,
  pkg: OsUniform | null | undefined,
): OsPlayer[] {
  return team.roster.filter((p) => !p.withdrawn && !sizeSheetComplete(p, pkg));
}

export function nextPoNumber(club: ClubOs): string {
  const nums = (club.purchaseOrders || [])
    .map((p) => Number(String(p.number || "").replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = (nums.length ? Math.max(...nums) : 1041) + 1;
  return `PO-${next}`;
}

function ping(
  club: ClubOs,
  teamId: string,
  title: string,
  body: string,
  kind: string,
  audience = "all",
) {
  notify(club, teamId, title, body, kind, audience);
}

export function applyPickPackage(
  club: ClubOs,
  teamId: string,
  packageId: string,
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  const pkg = club.uniforms.find((u) => u.id === packageId);
  if (!team || !pkg) return club;
  if (pkg.approved === false) return club;
  team.uniformPackageId = packageId;
  ping(club, team.id, "Uniform package", `${team.name} is in ${pkg.name}.`, "uniforms", "all");
  logAudit(club, actor, "uniform-package", `${team.name} → ${pkg.name}`);
  return club;
}

export function applySetDeadline(
  club: ClubOs,
  teamId: string,
  deadline: string,
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  team.uniformDeadline = deadline;
  ping(
    club,
    team.id,
    "Size deadline",
    `Sizes for ${team.name} are due ${deadline}.`,
    "uniforms",
    "all",
  );
  logAudit(club, actor, "size-deadline", `${team.name} deadline ${deadline}`);
  return club;
}

export function applyApprovePackage(
  club: ClubOs,
  packageId: string,
  approved: boolean,
  actor: string,
): ClubOs {
  const pkg = club.uniforms.find((u) => u.id === packageId);
  if (!pkg) return club;
  pkg.approved = approved;
  logAudit(club, actor, "uniform-approve", `${pkg.name} ${approved ? "approved" : "unapproved"}`);
  return club;
}

export function applyUploadPhoto(
  club: ClubOs,
  packageId: string,
  slot: string,
  src: string,
  actor: string,
): ClubOs {
  if (!club.uniformPhotos) club.uniformPhotos = [];
  const existing = club.uniformPhotos.find((p) => p.packageId === packageId && p.slot === slot);
  if (existing) existing.src = src;
  else {
    club.uniformPhotos.push({
      id: uid(),
      packageId,
      slot,
      src,
    });
  }
  const pkg = club.uniforms.find((u) => u.id === packageId);
  logAudit(club, actor, "uniform-photo", `${pkg?.name || packageId} · ${slot}`);
  return club;
}

export function applySubmitSizes(
  club: ClubOs,
  teamId: string,
  playerId: string,
  number: number | string,
  sizes: Record<string, string>,
): { ok: boolean; reason?: "missing" | "number" } {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) return { ok: false, reason: "missing" };
  const num = String(number).trim();
  if (!num || num === "0") return { ok: false, reason: "number" };
  if (numbersTaken(team, player.id).has(num)) return { ok: false, reason: "number" };
  player.number = Number(num) || num;
  player.order = {
    number: player.number,
    sizes: { ...sizes },
    submitted: true,
  };
  ping(
    club,
    team.id,
    "Sizes in",
    `${player.name} submitted uniform sizes.`,
    "uniforms",
    "all",
  );
  return { ok: true };
}

function linesFor(team: OsTeam, pkg: OsUniform | null, playerIds?: string[]) {
  const want = playerIds ? new Set(playerIds) : null;
  return team.roster
    .filter((p) => !p.withdrawn && (!want || want.has(p.id)))
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      number: p.order?.number ?? p.number,
      sizes: { ...(p.order?.sizes || {}) },
    }));
}

export function applyCreatePo(
  club: ClubOs,
  input: {
    teamId: string;
    supplier: string;
    expectedDelivery: string;
    kind: "season" | "reorder";
    reorderReason?: OsPurchaseOrder["reorderReason"];
    billTo: "family" | "club";
    playerIds?: string[];
    force?: boolean;
    actor: string;
  },
): { ok: boolean; warn?: boolean; missing?: string[]; po?: OsPurchaseOrder } {
  const team = club.teams.find((t) => t.id === input.teamId);
  if (!team) return { ok: false };
  const pkg = club.uniforms.find((u) => u.id === team.uniformPackageId) ?? null;
  const missingPlayers = incompleteSizeSheets(team, pkg);
  if (input.kind === "season" && missingPlayers.length && !input.force) {
    return {
      ok: false,
      warn: true,
      missing: missingPlayers.map((p) => p.name),
    };
  }
  const po: OsPurchaseOrder = {
    id: uid(),
    number: nextPoNumber(club),
    teamId: team.id,
    packageId: team.uniformPackageId,
    supplier: input.supplier.trim() || "EvoShield Team Store",
    expectedDelivery: input.expectedDelivery,
    status: "draft",
    createdAt: iso(new Date(2026, 8, 15)),
    sizeDeadline: team.uniformDeadline,
    kind: input.kind,
    reorderReason: input.kind === "reorder" ? input.reorderReason ?? null : null,
    billTo: input.billTo,
    lines: linesFor(team, pkg, input.playerIds),
  };
  if (!club.purchaseOrders) club.purchaseOrders = [];
  club.purchaseOrders.unshift(po);
  ping(
    club,
    team.id,
    po.kind === "reorder" ? "Reorder opened" : "Purchase order opened",
    `${po.number} for ${team.name} is a draft. ${po.supplier}.`,
    "uniforms",
    "all",
  );
  logAudit(club, input.actor, "po-create", `${po.number} ${team.name}`);
  return { ok: true, po };
}

export function applyAdvancePo(
  club: ClubOs,
  poId: string,
  actor: string,
): { ok: boolean; status?: OsPoStatus } {
  const po = (club.purchaseOrders || []).find((p) => p.id === poId);
  if (!po) return { ok: false };
  const idx = PO_FLOW.indexOf(po.status);
  if (idx < 0 || idx >= PO_FLOW.length - 1) return { ok: false, status: po.status };
  po.status = PO_FLOW[idx + 1];
  const team = club.teams.find((t) => t.id === po.teamId);
  ping(
    club,
    po.teamId,
    `${po.number} ${PO_STATUS_LABEL[po.status].toLowerCase()}`,
    `${po.number} for ${team?.name || "the team"} is now ${PO_STATUS_LABEL[po.status].toLowerCase()}.`,
    "uniforms",
    "all",
  );
  logAudit(club, actor, "po-status", `${po.number} → ${po.status}`);
  return { ok: true, status: po.status };
}

export function exportPoCsv(club: ClubOs, po: OsPurchaseOrder): string {
  const team = club.teams.find((t) => t.id === po.teamId);
  const pkg = club.uniforms.find((u) => u.id === po.packageId);
  const fields = sizeFieldsOf(pkg);
  const header = ["Player", "Number", ...fields].join(",");
  const rows = po.lines.map((line) =>
    [
      `"${String(line.name).replace(/"/g, '""')}"`,
      line.number,
      ...fields.map((f) => line.sizes?.[f] || ""),
    ].join(","),
  );
  const meta = [
    `PO,${po.number}`,
    `Team,${team?.name || po.teamId}`,
    `Package,${pkg?.name || po.packageId}`,
    `Supplier,${po.supplier}`,
    `Status,${po.status}`,
    `Delivery,${po.expectedDelivery}`,
    `Bill to,${po.billTo}`,
    "",
  ];
  return [...meta, header, ...rows].join("\n");
}

export function slotArt(slot: string, fill: string, ink: string): string {
  const label = slot.split(" ")[0].slice(0, 8).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280" role="img" aria-label="${slot}">
    <rect width="240" height="280" fill="#f7f6f2"/>
    <path d="M48 72 L78 44 L96 78 L144 78 L162 44 L192 72 L180 118 L180 232 L60 232 L60 118 Z" fill="${fill}"/>
    <rect x="88" y="96" width="64" height="10" fill="${ink}" opacity="0.35"/>
    <text x="120" y="168" text-anchor="middle" fill="${ink}" font-family="Arial Narrow, Barlow Condensed, sans-serif" font-size="22" font-weight="800">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function seedPackagePhotos(): OsUniformPhoto[] {
  const navy = "#071b31";
  const cream = "#f2eec1";
  const maroon = "#681c35";
  const columbia = "#6ca6e6";
  const pink = "#f4b6cf";
  const white = "#f7f6f2";
  const gray = "#b9bcc2";
  const slots = PHOTO_SLOTS as string[];
  const packs: { id: string; fills: string[] }[] = [
    { id: "u-core-bb", fills: [navy, white, maroon, white, navy, navy, maroon] },
    { id: "u-her-bb", fills: [cream, gray, maroon, cream, navy, navy, maroon] },
    { id: "u-mod-bb", fills: [navy, columbia, maroon, white, navy, navy, maroon] },
    { id: "u-show-bb", fills: [navy, columbia, cream, white, navy, maroon, maroon] },
    { id: "u-her-sb", fills: [cream, navy, pink, cream, navy, navy, pink] },
    { id: "u-mod-sb", fills: [navy, columbia, cream, white, navy, navy, pink] },
  ];
  const out: OsUniformPhoto[] = [];
  for (const pack of packs) {
    slots.forEach((slot, i) => {
      const fill = pack.fills[i] || navy;
      const ink = fill === cream || fill === white || fill === columbia || fill === gray ? navy : cream;
      out.push({
        id: `photo-${pack.id}-${i}`,
        packageId: pack.id,
        slot,
        src: slotArt(slot, fill, ink),
      });
    });
  }
  return out;
}

export const CATALOG_UNIFORMS = UNIFORMS as OsUniform[];
