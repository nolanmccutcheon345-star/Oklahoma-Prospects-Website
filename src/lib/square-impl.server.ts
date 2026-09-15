import { CLUB } from "@/lib/club";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { isOwnerEmail } from "@/lib/owners";
import { buildPublicCatalog, loadPublicCatalog } from "@/lib/ops";
import { linesTotal, quoteCheckout, type PayLine } from "@/lib/pay";
import type { SquareCheckoutInput, SquareCheckoutResult } from "@/lib/square";

type SettingRow = { value: string };

async function ensureSettings() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists club_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `);
  return sql;
}

async function setting(key: string) {
  try {
    const sql = await ensureSettings();
    const rows = await sql<SettingRow>`select value from club_settings where key = ${key}`;
    return rows[0]?.value?.trim() || "";
  } catch {
    return "";
  }
}

async function setSetting(key: string, value: string) {
  const sql = await ensureSettings();
  await sql`
    insert into club_settings (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function readSquareStatus() {
  const token = env("SQUARE_ACCESS_TOKEN") || (await setting("square_access_token"));
  const locationId = env("SQUARE_LOCATION_ID") || (await setting("square_location_id"));
  const environment =
    env("SQUARE_ENVIRONMENT") || (await setting("square_environment")) || "production";
  return {
    connected: Boolean(token && locationId),
    locationId,
    environment,
    tokenSet: Boolean(token),
  };
}

export async function writeSquareSettings(
  input: { locationId?: string; accessToken?: string; environment?: string },
  userId: string,
) {
  const sql = await getSql();
  const users = await sql<{ email: string }>`select email from "user" where id = ${userId}`;
  const email = (users[0]?.email ?? "").toLowerCase();
  const profiles = await sql<{ role: string }>`select role from profiles where user_id = ${userId}`;
  if (!isOwnerEmail(email) && profiles[0]?.role !== "admin") {
    throw new Error("Admin only.");
  }
  if (input.locationId !== undefined) await setSetting("square_location_id", input.locationId.trim());
  if (input.accessToken) await setSetting("square_access_token", input.accessToken.trim());
  if (input.environment) await setSetting("square_environment", input.environment.trim());
  return readSquareStatus();
}

function squareHost(environment: string) {
  return environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

async function createPaymentLink(input: {
  title: string;
  amount: number;
  lines: PayLine[];
  returnUrl?: string;
}): Promise<string | null> {
  const status = await readSquareStatus();
  const token = env("SQUARE_ACCESS_TOKEN") || (await setting("square_access_token"));
  if (!status.connected || !token) return null;

  const lineItems = (input.lines.length ? input.lines : [{ label: input.title, amount: input.amount }]).map(
    (line) => ({
      name: line.label.slice(0, 120),
      quantity: "1",
      base_price_money: { amount: Math.round(line.amount * 100), currency: "USD" },
    }),
  );

  const res = await fetch(`${squareHost(status.environment)}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      "Square-Version": "2026-08-19",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: status.locationId,
        line_items: lineItems,
      },
      checkout_options: {
        redirect_url: input.returnUrl || undefined,
        ask_for_shipping_address: false,
        merchant_support_email: CLUB.email,
      },
      payment_note: `${CLUB.name} · $${input.amount}`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 280) || "Square checkout could not be created.");
  }
  const json = (await res.json()) as { payment_link?: { url?: string } };
  const url = json.payment_link?.url;
  if (!url) throw new Error("Square did not return a checkout URL.");
  return url;
}

export async function startSquareCheckout(input: SquareCheckoutInput): Promise<SquareCheckoutResult> {
  let catalog;
  try {
    catalog = await loadPublicCatalog();
  } catch {
    catalog = buildPublicCatalog([]);
  }
  const hasAssessment = input.hasAssessment === true || input.assessed === "1";
  const item = quoteCheckout(input, catalog, hasAssessment);
  if (!item) {
    return { mode: "club", amount: 0, title: "", lines: [], connected: false, error: "Nothing to pay." };
  }
  if (item.error) {
    return {
      mode: "club",
      amount: item.price,
      title: item.title,
      lines: item.lines,
      connected: false,
      error: item.error,
    };
  }
  const amount = item.price;
  if (linesTotal(item.lines) !== amount) {
    return {
      mode: "club",
      amount,
      title: item.title,
      lines: item.lines,
      connected: false,
      error: "Order total does not match line items.",
    };
  }

  const status = await readSquareStatus();
  if (status.connected) {
    try {
      const url = await createPaymentLink({
        title: item.title,
        amount,
        lines: item.lines,
        returnUrl: input.returnUrl,
      });
      if (url) {
        return {
          mode: "square",
          url,
          amount,
          title: item.title,
          lines: item.lines,
          connected: true,
        };
      }
    } catch (err) {
      return {
        mode: "club",
        amount,
        title: item.title,
        lines: item.lines,
        connected: true,
        error: err instanceof Error ? err.message : "Square checkout failed.",
      };
    }
  }

  return {
    mode: "club",
    amount,
    title: item.title,
    lines: item.lines,
    connected: false,
  };
}
