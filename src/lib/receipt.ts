import { CLUB, smsHref } from "@/lib/club";
import type { PayItem, PaySearch } from "@/lib/pay";

export type ClubReceipt = {
  id: string;
  kind: string;
  itemId: string;
  title: string;
  price: number;
  detail: string;
  date: string;
  time: string;
  minutes: number;
  createdAt: number;
  status: "paid";
};

const KEY = "prospects-club-receipts";

export function newReceiptId(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OP-${y}${m}${d}-${rand}`;
}

export function receiptFromItem(
  item: PayItem,
  search: PaySearch,
  id = newReceiptId(),
): ClubReceipt {
  return {
    id,
    kind: item.kind,
    itemId: item.id,
    title: item.title,
    price: item.price,
    detail: item.detail,
    date: search.date || new Date().toISOString().slice(0, 10),
    time: search.time || "",
    minutes: item.minutes,
    createdAt: Date.now(),
    status: "paid",
  };
}

export function loadReceipts(): ClubReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClubReceipt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: ClubReceipt) {
  if (typeof window === "undefined") return receipt;
  const next = [receipt, ...loadReceipts().filter((row) => row.id !== receipt.id)].slice(
    0,
    24,
  );
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return receipt;
}

export function getReceipt(id: string | undefined) {
  if (!id) return undefined;
  return loadReceipts().find((row) => row.id === id);
}

export function formatReceiptText(receipt: ClubReceipt) {
  const when = [receipt.date, receipt.time].filter(Boolean).join(" · ") || "Date on file";
  return [
    "OKLAHOMA PROSPECTS",
    "Receipt",
    "",
    `Receipt ${receipt.id}`,
    receipt.title,
    receipt.detail,
    when,
    `${receipt.minutes} min`,
    `$${receipt.price}`,
    "Paid by debit or credit",
    "",
    CLUB.addressLine1,
    CLUB.addressLine2,
    CLUB.phoneDisplay,
    CLUB.email,
    "",
    "Door: Suite A. Text the desk if the gate is locked.",
    "Waiver: prospectsbaseball.club/waiver",
    "Questions after this is booked — desk for cages, Coach Steve after a paid lesson.",
  ].join("\n");
}

export function receiptMailto(receipt: ClubReceipt) {
  const subject = `Oklahoma Prospects receipt ${receipt.id}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(formatReceiptText(receipt))}`;
}

export function receiptSms(receipt: ClubReceipt) {
  return `sms:?body=${encodeURIComponent(formatReceiptText(receipt))}`;
}

export function gateSms(receipt: ClubReceipt) {
  const when = [receipt.date, receipt.time].filter(Boolean).join(" ");
  return smsHref(
    CLUB.phoneTel,
    `Hi, I'm at the gate at ${CLUB.addressLine1}. Receipt ${receipt.id}${when ? ` · ${when}` : ""} — ${receipt.title}. Can you open up?`,
  );
}

export function deskSms(receipt: ClubReceipt) {
  return smsHref(
    CLUB.phoneTel,
    `Oklahoma Prospects booking ${receipt.id}: ${receipt.title}, $${receipt.price}.`,
  );
}

export function steveSms(receipt: ClubReceipt) {
  return smsHref(
    CLUB.coachSteveTel,
    `Paid lesson hold ${receipt.id}: ${receipt.title}, $${receipt.price}.`,
  );
}
