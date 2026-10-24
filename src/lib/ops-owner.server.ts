import { randomUUID } from "node:crypto";
import { servicePresentationInput } from "./service-presentation";
/** Raw owner mutations stay behind the server-function transport boundary. */
import {
  reviewOperationalServiceAdoption,
  finishOperationalServiceAdoption,
} from "./coordinator/organization-services.server";
import type { Sql } from "./db";
import type { ClubRole } from "./club-data";
import type { ServiceInput, StaffInput } from "./ops";
import { serviceInput, staffInput, lessonTermIdInput } from "./ops-contracts";
import { eligibility } from "./pricing";
import { revokeStaffAccess } from "./staff-access.server";
import {
  withFinancialContext,
  commitFinancialLessonTermsInTransaction,
} from "./finance/context.server";

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function asStaffRole(value: string): ClubRole {
  if (value === "admin" || value === "coach" || value === "parent" || value === "player")
    return value;
  return "coach";
}
function newId(prefix: string, name: string) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "item";
  return `${prefix}-${slug}-${Date.now().toString(36)}`;
}
function extraJson(input: ServiceInput) {
  return JSON.stringify({
    unit: input.unit || "",
    lanes: input.lanes || "",
    period: input.period || "",
    hourly: input.hourly || "",
    bestFor: input.bestFor || "",
    savings: input.savings || "",
    perks: input.perks ?? [],
  });
}

export async function saveServiceFor(sql: Sql, userId: string, raw: ServiceInput) {
  const data = serviceInput.parse(raw);
  return withFinancialContext(sql, userId, "owner", async (tx, financial) => {
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    const kind = data.kind;
    if (data.presentation && kind !== "cage_plan")
      throw new Error("Membership presentation settings apply only to cage memberships.");
    const prefix =
      kind === "cage_plan"
        ? "plan"
        : kind === "cage"
          ? "cage"
          : kind === "membership"
            ? "m"
            : kind === "package"
              ? "p"
              : "s";
    const id = data.id?.trim() || newId(prefix, name);
    const adopting = await reviewOperationalServiceAdoption(
      tx,
      id,
      data.operationalDraftRevision,
      data.operationalDraftConfirmed,
      kind,
      data.price,
    );
    if (kind !== "fee" && data.price <= 0)
      throw new Error("Enter a customer price greater than zero.");
    const [existing] = await tx<{
      kind: string;
      presentation: unknown;
      presentation_revision: number;
    }>`select kind,presentation,presentation_revision from club_services where id=${id} for update`;
    if (
      data.presentation &&
      existing &&
      data.presentationRevision !== existing.presentation_revision
    )
      throw new Error("This service changed. Reload Services & Pricing before saving.");
    if (kind === "cage_plan" && data.presentation) {
      if (data.credits <= 0 || data.hours !== data.credits || data.minutes !== data.credits * 60)
        throw new Error("Included cage hours must match the credits delivered to the household.");
      if (
        data.presentation.calculationBasis === "assumed" &&
        (data.presentation.assumedMonthlyMinutes <= 0 ||
          data.presentation.assumedMonthlyMinutes > data.credits * 60)
      )
        throw new Error("Assumed usage must be positive and no greater than included cage time.");
      if (
        data.presentation.comparisonResourceId !== "" &&
        data.presentation.comparisonResourceId !== "individual"
      )
        throw new Error(
          "Household cage memberships can only be compared with individual cage rentals.",
        );
      if (data.period !== "/ month") throw new Error("Cage memberships use monthly billing.");
    }
    if (existing && existing.kind !== kind)
      throw new Error(
        "An existing service’s category cannot be changed. Create a new service instead.",
      );
    const maxSort = await tx<{ n: number }>`
      select coalesce(max(sort_order), 0)::int as n from club_services
    `;
    const sort = data.sort_order ?? asInt(maxSort[0]?.n) + 10;
    await tx`
      insert into club_services (
        id, kind, name, discipline, price, minutes, purpose, entry, group_session,
        requires_assessment, credits, remote, expires_days, hours, featured, detail,
        includes_json, extra_json, active, sort_order, updated_at
      ) values (
        ${id},
        ${kind},
        ${name},
        ${data.discipline.trim()},
        ${Math.round(Number(data.price) * 100) / 100},
        ${asInt(data.minutes)},
        ${data.purpose.trim()},
        ${Boolean(data.entry)},
        ${Boolean(data.group_session)},
        ${kind === "lesson" || kind === "package" ? eligibility(kind, id, false).locked : false},
        ${asInt(data.credits)},
        ${asInt(data.remote)},
        ${asInt(data.expires_days)},
        ${asInt(data.hours)},
        ${Boolean(data.featured)},
        ${data.detail.trim()},
        ${JSON.stringify(data.includes ?? [])},
        ${extraJson(data)},
        ${data.active !== false},
        ${sort},
        now()
      )
      on conflict (id) do update set
        kind = excluded.kind,
        name = excluded.name,
        discipline = excluded.discipline,
        price = excluded.price,
        minutes = excluded.minutes,
        purpose = excluded.purpose,
        entry = excluded.entry,
        group_session = excluded.group_session,
        requires_assessment = excluded.requires_assessment,
        credits = excluded.credits,
        remote = excluded.remote,
        expires_days = excluded.expires_days,
        hours = excluded.hours,
        featured = excluded.featured,
        detail = excluded.detail,
        includes_json = excluded.includes_json,
        extra_json = excluded.extra_json,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
    if (data.presentation) {
      const presentation = servicePresentationInput.parse(data.presentation);
      await tx`update club_services set presentation=${JSON.stringify(presentation)}::jsonb,presentation_revision=presentation_revision+1 where id=${id}`;
      await tx`insert into website_content_audit(id,actor_id,entity,target_id,before_value,after_value) values(${randomUUID()},${userId},'service-presentation',${id},${JSON.stringify(existing?.presentation ?? null)}::jsonb,${JSON.stringify(presentation)}::jsonb)`;
    }
    await commitFinancialLessonTermsInTransaction(tx, financial, {
      expectedBasisVersion: data.basisVersion,
      command: { type: "service", serviceId: id },
      reason: "Owner updated service terms for future bookings",
    });
    if (adopting) await finishOperationalServiceAdoption(tx, userId, id, data.active);
    return { id };
  });
}

export async function deleteServiceFor(
  sql: Sql,
  userId: string,
  raw: { id: string; basisVersion?: number },
) {
  const data = lessonTermIdInput.parse(raw);
  return withFinancialContext(sql, userId, "owner", async (tx, financial) => {
    await tx`delete from club_staff_services where service_id = ${data.id}`;
    await tx`delete from club_services where id = ${data.id}`;
    await commitFinancialLessonTermsInTransaction(tx, financial, {
      expectedBasisVersion: data.basisVersion,
      command: { type: "service", serviceId: data.id },
      reason: "Owner removed service from future bookings",
    });
    return { ok: true as const };
  });
}

export async function saveStaffFor(sql: Sql, actorId: string, raw: StaffInput) {
  const data = staffInput.parse(raw);
  if (data.createLogin && !data.email) throw new Error("Email is required for an invitation.");
  return withFinancialContext(sql, actorId, "owner", async (tx, financial) => {
    const name = data.name.trim();
    if (!name) throw new Error("Coach name is required.");
    const email = data.email.trim().toLowerCase();
    const id = data.id?.trim() || newId("staff", name);
    let userId = "";
    if (email) {
      const users = await tx<{ id: string }>`
        select id from "user" where lower(email) = ${email}
      `;
      userId = users[0]?.id ?? "";
    }
    if (
      data.role === "admin" &&
      !(await tx`select email from owner_grants where email=${email} and revoked_at is null`).length
    )
      throw new Error("Only approved owners may have admin access.");
    const [saved] = await tx<{ user_id: string; email: string }>`
      insert into club_staff (id, user_id, name, email, phone, role, access_notes, active)
      values (
        ${id},
        ${userId},
        ${name},
        ${email},
        ${data.phone.trim()},
        ${asStaffRole(data.role || "coach")},
        ${data.access_notes.trim()},
        ${data.active !== false}
      )
      on conflict (id) do update set
        user_id = case when excluded.user_id = '' then club_staff.user_id else excluded.user_id end,
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        access_notes = excluded.access_notes,
        active = excluded.active
      returning user_id, email
    `;
    if (data.offerings) {
      const { replaceCoachServices } = await import("./commerce/coach-services.server");
      await replaceCoachServices(tx, id, data.offerings);
      // This explicit admin assignment also enables the shared instructor assignment.
      if (data.offerings.length && saved?.user_id)
        await tx`update person_profiles set instructor=true,revision=revision+1,updated_at=now() where user_id=${saved.user_id}`;
    }
    if (data.active === false && saved) await revokeStaffAccess(tx, saved);
    await commitFinancialLessonTermsInTransaction(tx, financial, {
      expectedBasisVersion: data.basisVersion,
      command: { type: "staff", staffId: id },
      reason: "Owner updated instructor terms for future bookings",
    });
    return { id };
  });
}

export async function deleteStaffFor(
  sql: Sql,
  userId: string,
  raw: { id: string; basisVersion?: number },
) {
  const data = lessonTermIdInput.parse(raw);
  return withFinancialContext(sql, userId, "owner", async (tx, financial) => {
    const [staff] = await tx<{
      user_id: string;
      email: string;
    }>`update club_staff set active=false where id=${data.id} returning user_id,email`;
    if (staff) await revokeStaffAccess(tx, staff);
    await commitFinancialLessonTermsInTransaction(tx, financial, {
      expectedBasisVersion: data.basisVersion,
      command: { type: "staff", staffId: data.id },
      reason: "Owner deactivated instructor for future bookings",
    });
    return { ok: true as const };
  });
}
