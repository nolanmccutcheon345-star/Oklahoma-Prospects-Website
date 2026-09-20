import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { assertSameSiteRequest } from "../auth/isolation.server";
import { getRequest } from "@tanstack/react-start/server";
import { rateLimit } from "./checkout.server";
import {
  applyDiscount,
  discountCode,
  discountInput,
  type Discount,
  type DiscountInput,
} from "./discounts";
import type { Quote } from "./contracts";

async function requireAdmin(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Admin access required to manage discount codes.");
  return me;
}
export async function listDiscountsFor(sql: Sql, userId: string) {
  await requireAdmin(sql, userId);
  return sql<Discount>`select id,code,kind,value,starts_on::text,ends_on::text,active,version,purchase_types from discount_codes order by created_at desc`;
}
export async function saveDiscountFor(sql: Sql, userId: string, raw: DiscountInput) {
  await requireAdmin(sql, userId);
  const input = discountInput.parse(raw);
  try {
    return await sql.transaction(async (tx) => {
      const [previous] = input.id
        ? await tx<Discount>`select * from discount_codes where id=${input.id} for update`
        : [];
      if (input.id && (!previous || previous.version !== input.version))
        throw new Error("This code was changed by another admin. Refresh and try again.");
      const id = input.id || randomUUID();
      const [saved] = previous
        ? await tx<Discount>`update discount_codes set code=${input.code},kind=${input.kind},value=${input.value},starts_on=${input.startsOn},ends_on=${input.endsOn},purchase_types=${input.purchaseTypes}::text[],active=${input.active},version=version+1,updated_by=${userId},updated_at=now() where id=${id} returning id,code,kind,value,starts_on::text,ends_on::text,active,version,purchase_types`
        : await tx<Discount>`insert into discount_codes(id,code,kind,value,starts_on,ends_on,purchase_types,active,created_by,updated_by) values(${id},${input.code},${input.kind},${input.value},${input.startsOn},${input.endsOn},${input.purchaseTypes}::text[],${input.active},${userId},${userId}) returning id,code,kind,value,starts_on::text,ends_on::text,active,version,purchase_types`;
      // Keep the code private to the admin list and order; activity digests need only the ID/status.
      await tx`insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state) values(${userId},${previous ? "UPDATE" : "INSERT"},'discount_codes',${id},${previous ? JSON.stringify({ active: previous.active, version: previous.version, kind: previous.kind, value: previous.value, starts_on: previous.starts_on, ends_on: previous.ends_on, purchase_types: previous.purchase_types }) : null}::jsonb,${JSON.stringify({ active: saved.active, version: saved.version, kind: saved.kind, value: saved.value, starts_on: saved.starts_on, ends_on: saved.ends_on, purchase_types: saved.purchase_types })}::jsonb)`;
      return saved;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new Error("That discount code already exists. Edit the existing code instead.");
    throw error;
  }
}
export async function listDiscounts(userId: string) {
  assertSameSiteRequest();
  return listDiscountsFor(await getSql(), userId);
}
export async function saveDiscount(userId: string, input: DiscountInput) {
  assertSameSiteRequest();
  if (getRequest()?.method !== "POST") throw new Error("Discount changes require POST.");
  await rateLimit("admin-discounts", 60);
  return saveDiscountFor(await getSql(), userId, input);
}
export async function quoteWithDiscount(sql: Sql, quote: Quote, code?: string, now = new Date()) {
  if (!code?.trim()) return quote;
  const normalized = discountCode.parse(code);
  const [discount] =
    await sql<Discount>`select id,code,kind,value,starts_on::text,ends_on::text,active,version,purchase_types from discount_codes where code=${normalized}`;
  if (!discount)
    throw new Error("Discount code not found. Check the code or remove it to continue.");
  return applyDiscount(quote, discount, now);
}
/** Lock and recheck only before a NEW payment attempt. In-flight retries keep their agreed price. */
export async function assertDiscountCurrent(
  sql: Sql,
  quote: Quote & { promotionId?: string },
  now = new Date(),
) {
  if (quote.promotionId)
    throw new Error("This offer has ended. Return to checkout to review the current price.");
  if (!quote.discount) return;
  const d = quote.discount;
  const [current] =
    await sql<Discount>`select id,code,kind,value,starts_on::text,ends_on::text,active,version,purchase_types from discount_codes where id=${d.id} for share`;
  if (!current || current.version !== d.version || current.code !== d.code)
    throw new Error(
      "This discount code changed. Return to checkout and apply it again before payment.",
    );
  const checked = applyDiscount(
    {
      ...quote,
      discount: undefined,
      totalCents: quote.subtotalCents!,
      regularCents: quote.subtotalCents!,
    },
    current,
    now,
  );
  if (checked.totalCents !== quote.totalCents || checked.discount?.cents !== d.cents)
    throw new Error("The discounted total changed. Return to checkout before payment.");
}
