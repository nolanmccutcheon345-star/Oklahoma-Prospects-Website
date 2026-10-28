/** Owner-only admission adapters. The original UI reviews all candidates, then selects an explicit subset. */
import { z } from "zod";
import type { Sql } from "../db";
import { newCoachId } from "../coach-id.server";
import { personId } from "./sources.server";
import { financialBasisDigest } from "./basis.server";
import { financialPrincipalInTransaction } from "./principal.server";
import {
  withFinancialContext,
  loadFinancialLessonsInTransaction,
  previewFinancialSelfAdmissionInTransaction,
  admitFinancialSelfIdentityInTransaction,
  type FinancialContext,
} from "./context.server";
const selectionSchema = z
  .object({
    kind: z.enum(["instructor", "payroll"]),
    userId: z.string().min(1).max(150),
    coachId: z.string().min(1).max(150).optional(),
    payrollFromMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();
const commandSchema = selectionSchema
  .extend({
    expectedBasisVersion: z.number().int().positive(),
    reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
    bookingIds: z.array(z.string().min(1)).max(1000),
    orderIds: z.array(z.string().min(1)).max(1000),
    confirmed: z.literal(true),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
type Selection = z.infer<typeof selectionSchema>;
export type FinancialIdentityAdmissionPreview = {
  basisVersion: number;
  reviewDigest: string;
  kind: "instructor" | "payroll";
  user: { id: string; name: string; email: string };
  payee: { id: string; name: string; email: string };
  coach?: { id: string; name: string; email: string };
  payrollFromMonth?: string;
  bookings: { id: string; startsAt: string; endsAt: string }[];
  orders: { id: string; startsAt: string; endsAt: string }[];
};
function approvedInstructors(context: FinancialContext) {
  const result: { coachId: string; name: string; email: string; staffId: string | null }[] = [];
  for (const d of context.compensation!.development)
    if (Array.isArray(d.coaches))
      for (const c of d.coaches) {
        if (c && typeof c === "object" && !Array.isArray(c) && c.active !== false) {
          const email = String(c.email || "")
            .trim()
            .toLowerCase();
          if (email && !result.some((r) => r.coachId === c.id))
            result.push({
              coachId: String(c.id),
              name: String(c.name || email),
              email,
              staffId:
                String(
                  context.compensation!.staff.find(
                    (s) =>
                      String(s.email || "")
                        .trim()
                        .toLowerCase() === email,
                  )?.id || "",
                ) || null,
            });
        }
      }
  for (const staff of context.compensation!.staff) {
    const email = String(staff.email || "")
      .trim()
      .toLowerCase();
    if (staff.active === true && email && !result.some((c) => c.email === email))
      result.push({
        coachId: newCoachId(email),
        name: String(staff.name || email),
        email,
        staffId: String(staff.id),
      });
  }
  return result;
}
async function review(tx: Sql, context: FinancialContext, selection: Selection) {
  if (!context.basis)
    throw Error("Explicit financial identity admission is available after financial cutover.");
  const current = await financialPrincipalInTransaction(tx, selection.userId);
  const configured = context.compensation!.payeesAndRules.find(
    (r) =>
      r.kind === "payee" &&
      String((r.payload as Record<string, unknown>).email || "")
        .trim()
        .toLowerCase() === current.currentEmail,
  );
  const payeeId = String(configured?.id || personId(current.currentEmail));
  const bookingIds: string[] = [],
    orderIds: string[] = [];
  const bookingCandidates: Record<string, unknown>[] = [],
    orderCandidates: Record<string, unknown>[] = [];
  if (selection.kind === "instructor") {
    const candidates = await tx<{
      id: string;
    }>`select id from booking_records order by starts_at,id`;
    const contexts = await loadFinancialLessonsInTransaction(
      tx,
      candidates.map((c) => c.id),
      context,
    );
    for (const row of candidates) {
      const c = contexts.get(row.id)!;
      if (
        c.mode === "basis" &&
        c.booking &&
        String(
          c.compensation.earnings.find((e) => e.booking_id === row.id)?.coach_id ||
            c.booking.coach_id ||
            "",
        ) === selection.coachId
      ) {
        bookingIds.push(row.id);
        bookingCandidates.push({
          id: row.id,
          version: c.version,
          booking: c.booking,
          earning: c.compensation.earnings.find((e) => e.booking_id === row.id) || null,
        });
      }
    }
    const pending = await tx<{
      id: string;
      status: string;
      snapshot: Record<string, unknown>;
    }>`select o.id,o.status,o.snapshot from commerce_orders o where o.status in ('pending','payment_review','paid') and o.snapshot->'financialLessonAdmission'->>'coachId'=${selection.coachId || ""} and not exists(select 1 from booking_records b where b.order_id=o.id) order by o.id`;
    orderIds.push(...pending.map((o) => o.id));
    orderCandidates.push(...pending);
  }
  const normalized = {
    kind: selection.kind,
    userId: selection.userId,
    coachId: selection.coachId || "",
    payeeId,
    ...(selection.payrollFromMonth ? { fromMonth: selection.payrollFromMonth } : {}),
    bookingIds,
    orderIds,
  };
  const original = await previewFinancialSelfAdmissionInTransaction(tx, context, {
    ...normalized,
    bookingIds: [],
    orderIds: [],
  });
  const display: FinancialIdentityAdmissionPreview = {
    basisVersion: original.basisVersion,
    reviewDigest: financialBasisDigest({ original, bookingCandidates, orderCandidates }),
    kind: selection.kind,
    user: {
      id: original.account.id,
      name: original.account.profileName || original.account.name,
      email: original.account.email,
    },
    payee: {
      id: payeeId,
      name: String(original.payee.name || original.account.name),
      email: String(original.payee.email),
    },
    ...(original.coach ? { coach: original.coach } : {}),
    ...(selection.payrollFromMonth ? { payrollFromMonth: selection.payrollFromMonth } : {}),
    bookings: bookingCandidates.map((row) => {
      const b = row.booking as Record<string, unknown>;
      return { id: String(row.id), startsAt: String(b.starts_at), endsAt: String(b.ends_at) };
    }),
    orders: orderCandidates.map((o) => {
      const pin = (o.snapshot as Record<string, unknown>).financialLessonAdmission as Record<
        string,
        unknown
      >;
      return { id: String(o.id), startsAt: String(pin.startsAt), endsAt: String(pin.endsAt) };
    }),
  };
  return { normalized, display };
}
export async function previewFinancialIdentityAdmission(
  sql: Sql,
  userId: string,
  raw: unknown,
): Promise<FinancialIdentityAdmissionPreview> {
  return withFinancialContext(sql, userId, "owner", async (tx, context) => {
    // Internal regression/repository callers may select exact payee and records directly.
    if (raw && typeof raw === "object" && "payeeId" in raw) {
      const p = await previewFinancialSelfAdmissionInTransaction(tx, context, raw);
      return {
        ...p,
        kind: p.selection.kind,
        user: { id: p.account.id, name: p.account.name, email: p.account.email },
        payee: {
          id: p.selection.payeeId,
          name: String(p.payee.name),
          email: String(p.payee.email),
        },
        bookings: p.bookings.map((b) => ({
          id: String(b.id),
          startsAt: String((b.booking as Record<string, unknown>).starts_at),
          endsAt: String((b.booking as Record<string, unknown>).ends_at),
        })),
        orders: p.orders.map((o) => ({ id: String(o.id), startsAt: "", endsAt: "" })),
        coach: p.coach || undefined,
      };
    }
    return (await review(tx, context, selectionSchema.parse(raw))).display;
  });
}
export async function admitFinancialIdentity(sql: Sql, userId: string, raw: unknown) {
  return withFinancialContext(sql, userId, "owner", async (tx, context) => {
    if (raw && typeof raw === "object" && "selection" in raw)
      return admitFinancialSelfIdentityInTransaction(tx, context, raw);
    const command = commandSchema.parse(raw),
      selection = selectionSchema.parse({
        kind: command.kind,
        userId: command.userId,
        ...(command.coachId ? { coachId: command.coachId } : {}),
        ...(command.payrollFromMonth ? { payrollFromMonth: command.payrollFromMonth } : {}),
      });
    if (context.version !== command.expectedBasisVersion)
      throw Error("Financial basis changed. Refresh before saving.");
    const { normalized, display } = await review(tx, context, selection);
    if (display.reviewDigest !== command.reviewDigest)
      throw Error(
        "Financial identity review changed. Review current account and original records again.",
      );
    if (
      command.bookingIds.some((id) => !normalized.bookingIds.includes(id)) ||
      command.orderIds.some((id) => !normalized.orderIds.includes(id))
    )
      throw Error("Choose only the original records in this reviewed identity scope.");
    const chosen = { ...normalized, bookingIds: command.bookingIds, orderIds: command.orderIds },
      p = await previewFinancialSelfAdmissionInTransaction(tx, context, chosen);
    return admitFinancialSelfIdentityInTransaction(tx, context, {
      selection: chosen,
      expectedBasisVersion: command.expectedBasisVersion,
      reviewDigest: p.reviewDigest,
      confirmed: true,
      reason: command.reason,
    });
  });
}
export async function financialIdentityAdmissionOptions(sql: Sql, userId: string) {
  return withFinancialContext(sql, userId, "owner", async (tx, context) => {
    if (!context.basis)
      return {
        mode: "legacy" as const,
        basisVersion: null,
        accounts: [] as { id: string; name: string; email: string }[],
        instructors: [] as {
          coachId: string;
          name: string;
          email: string;
          staffId: string | null;
        }[],
      };
    const accounts = await tx<{
      id: string;
      name: string;
      email: string;
    }>`select u.id,u.name,lower(trim(u.email)) as email from "user" u where u."emailVerified"=true and u."disabledAt" is null and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted=true) order by u.name,u.id`;
    return {
      mode: "basis" as const,
      basisVersion: context.version,
      accounts,
      instructors: approvedInstructors(context),
    };
  });
}
