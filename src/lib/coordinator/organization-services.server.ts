/** Operational drafts never create commercial rows. Availability applies to new purchases only. */
import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { lockFinancialExecution } from "../finance/execution.server";
import { withFinancialContext } from "../finance/context.server";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";
import { serviceNameEditable } from "./organization-catalog-contracts";
import {
  operationalServiceCreateInput,
  operationalServiceSaveInput,
  operationalServiceStatusInput,
  type OrganizationService,
} from "./organization-services-contracts";

type Metadata = Pick<
  OrganizationService,
  "id" | "kind" | "name" | "discipline" | "purpose" | "detail" | "featured" | "sortOrder"
>;
type Overlay = Metadata & {
  adopted: boolean;
  status: OrganizationService["status"];
  revision: number;
};
async function services(tx: Sql) {
  // The published source query is deliberately column-scoped. Inactive private copy is not read.
  const published = await tx<
    Metadata & { sourceRevision: number }
  >`select id,kind,name,discipline,purpose,detail,featured,sort_order as "sortOrder",lesson_version as "sourceRevision" from club_services where active=true order by sort_order,name,id`;
  const overlays =
    await tx<Overlay>`select id,kind,name,discipline,purpose,detail,featured,sort_order as "sortOrder",status,revision,adopted from operational_service_catalog order by sort_order,name,id`;
  const identities = await tx<{
    id: string;
    sourceRevision: number;
  }>`select id,lesson_version as "sourceRevision" from club_services`;
  const result: OrganizationService[] = published.map((p) => {
    const o = overlays.find((o) => o.id === p.id);
    return {
      ...p,
      revision: o?.revision || 0,
      status: o?.status === "archived" ? "archived" : "active",
      financialApprovalRequired: false,
      nameEditable: serviceNameEditable(p.kind),
    };
  });
  for (const o of overlays)
    if (!published.some((p) => p.id === o.id)) {
      const source = identities.find((p) => p.id === o.id);
      result.push({
        ...o,
        sourceRevision: source?.sourceRevision ?? null,
        status: source || o.adopted ? "archived" : o.status,
        financialApprovalRequired: true,
        nameEditable: !o.adopted || serviceNameEditable(o.kind),
      });
    }
  return result.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export async function organizationServices(
  sql: Sql,
  userId: string,
): Promise<OrganizationService[]> {
  return secured(
    sql,
    userId,
    "organization.services.read",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return services(tx);
    },
    lockFinancialExecution,
  );
}
export async function ownerServiceDrafts(sql: Sql, userId: string): Promise<OrganizationService[]> {
  return withFinancialContext(sql, userId, "owner", async (tx) => {
    const drafts = await tx<{
      id: string;
    }>`select id from operational_service_catalog where adopted=false`;
    return (await services(tx)).filter(
      (s) => s.sourceRevision === null && drafts.some((d) => d.id === s.id),
    );
  });
}
async function target(
  tx: Sql,
  input: { id: string; revision: number; sourceRevision: number | null },
) {
  // Global gate is already held. Source then operational row is the common lock order.
  const [source] = await tx<{
    id: string;
    sourceRevision: number;
    active: boolean;
  }>`select id,lesson_version as "sourceRevision",active from club_services where id=${input.id} for update`;
  const [overlay] =
    await tx<Overlay>`select id,kind,name,discipline,purpose,detail,featured,sort_order as "sortOrder",status,revision,adopted from operational_service_catalog where id=${input.id} for update`;
  if ((!source && !overlay) || (source && !source.active && !overlay))
    throw new CoordinatorDenied();
  if (
    (source?.sourceRevision ?? null) !== input.sourceRevision ||
    (overlay?.revision ?? 0) !== input.revision
  )
    throw new Error("This service changed. Reload before saving.");
  const row = (await services(tx)).find((s) => s.id === input.id);
  if (!row) throw new CoordinatorDenied();
  return { row, source, overlay };
}
async function saveOverlay(
  tx: Sql,
  userId: string,
  row: OrganizationService,
  status: OrganizationService["status"],
) {
  const [saved] = await tx<{
    revision: number;
  }>`insert into operational_service_catalog(id,kind,name,discipline,purpose,detail,featured,sort_order,status,revision,adopted,created_by,updated_by) values(${row.id},${row.kind},${row.name},${row.discipline},${row.purpose},${row.detail},${row.featured},${row.sortOrder},${status},${row.revision + 1},${row.sourceRevision !== null},${userId},${userId}) on conflict(id) do update set name=excluded.name,purpose=excluded.purpose,detail=excluded.detail,featured=excluded.featured,sort_order=excluded.sort_order,status=excluded.status,revision=excluded.revision,adopted=operational_service_catalog.adopted or excluded.adopted,updated_by=excluded.updated_by,updated_at=now() returning revision`;
  return saved.revision;
}
export async function createOrganizationServiceDraft(sql: Sql, userId: string, raw: unknown) {
  const input = operationalServiceCreateInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.services.create",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const id = `draft-${randomUUID()}`;
      await saveOverlay(
        tx,
        userId,
        {
          ...input,
          id,
          revision: 0,
          sourceRevision: null,
          status: "draft",
          financialApprovalRequired: true,
          nameEditable: true,
        },
        "draft",
      );
      await audit(tx, userId, "organization.services.create", id, "allowed");
      return { ok: true, id, revision: 1 };
    },
    lockFinancialExecution,
  );
}
export async function saveOrganizationService(sql: Sql, userId: string, raw: unknown) {
  const input = operationalServiceSaveInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.services.save",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const { row, source, overlay } = await target(tx, input);
      if (!source && overlay?.adopted)
        throw new Error(
          "This former commercial service needs owner review. Create a new draft instead.",
        );
      if (!row.nameEditable && input.name !== row.name)
        throw new Error("This service name needs owner review.");
      if (source && !source.active)
        throw new Error("The owner must approve this service before editing its public copy.");
      const next = { ...row, ...input };
      if (source)
        await tx`update club_services set name=${input.name},purpose=${input.purpose},detail=${input.detail},featured=${input.featured},sort_order=${input.sortOrder},updated_at=now() where id=${input.id}`;
      const revision = await saveOverlay(tx, userId, next, row.status);
      await audit(tx, userId, "organization.services.save", input.id, "allowed");
      return { ok: true, id: input.id, revision };
    },
    lockFinancialExecution,
  );
}
export async function setOrganizationServiceStatus(sql: Sql, userId: string, raw: unknown) {
  const input = operationalServiceStatusInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.services.status",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const { row, source, overlay } = await target(tx, input);
      if (
        input.status === "active" &&
        ((!source && overlay?.adopted) || (source && !source.active))
      )
        throw new Error(
          "An owner must approve financial terms before this service can be offered again.",
        );
      const status = input.status === "active" && !source ? "draft" : input.status;
      const revision = await saveOverlay(tx, userId, row, status);
      await audit(tx, userId, "organization.services.status", input.id, "allowed", {
        status,
        reason: input.reason,
      });
      return { ok: true, id: input.id, revision };
    },
    lockFinancialExecution,
  );
}
export async function availableOperationalServices<T extends { id: string }>(
  sql: Sql,
  rows: readonly T[],
): Promise<T[]> {
  if (!rows.length) return [];
  const unavailable = await sql<{
    id: string;
  }>`select id from operational_service_catalog where id=any(${rows.map((r) => r.id)}::text[]) and status<>'active'`;
  const ids = new Set(unavailable.map((r) => r.id));
  return rows.filter((r) => !ids.has(r.id));
}
export async function assertOperationalServiceForNewPurchase(
  tx: Sql,
  serviceId: string,
): Promise<void> {
  const [row] = await tx<{
    status: string;
  }>`select status from operational_service_catalog where id=${serviceId} for share`;
  if (row && row.status !== "active")
    throw new Error("This service is unavailable for new purchases.");
}
/** Called only inside the existing true-owner service save transaction. */
export async function reviewOperationalServiceAdoption(
  tx: Sql,
  id: string,
  revision: number | undefined,
  confirmed: true | undefined,
  kind: string,
  price: number,
) {
  const [draft] = await tx<{
    revision: number;
    kind: string;
    adopted: boolean;
  }>`select revision,kind,adopted from operational_service_catalog where id=${id} for update`;
  const [existing] = await tx`select id from club_services where id=${id}`;
  if (existing) {
    if (revision !== undefined || confirmed !== undefined)
      throw new Error("This draft has already been approved. Reload services.");
    return false;
  }
  if (!draft) {
    if (revision !== undefined || confirmed !== undefined)
      throw new Error("The service draft is unavailable.");
    return false;
  }
  if (draft.adopted)
    throw new Error(
      "This former commercial identity cannot be readmitted. Create a new service draft.",
    );
  if (!confirmed || revision !== draft.revision)
    throw new Error("Review and confirm the current service draft before setting financial terms.");
  if (kind !== draft.kind)
    throw new Error("The reviewed service category changed. Reload the draft.");
  if (price <= 0)
    throw new Error("Enter a customer price greater than zero for the reviewed draft.");
  return true;
}
export async function finishOperationalServiceAdoption(
  tx: Sql,
  userId: string,
  id: string,
  active: boolean,
) {
  await tx`update operational_service_catalog set adopted=true,status=${active ? "active" : "archived"},revision=revision+1,updated_by=${userId},updated_at=now() where id=${id}`;
  await audit(tx, userId, "organization.services.owner-adopt", id, "allowed");
}
