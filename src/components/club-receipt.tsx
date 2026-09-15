import { Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";
import {
  receiptMailto,
  receiptSms,
  type ClubReceipt,
} from "@/lib/receipt";

export function ClubReceiptCard({ receipt }: { receipt: ClubReceipt }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-ink text-fg-inverse">
      <div className="h-1 bg-maroon" />
      <div className="p-5">
        <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
          Oklahoma Prospects receipt
        </p>
        <p className="mt-2 font-display text-sm tracking-widest text-fg-soft uppercase">
          {receipt.id}
        </p>
        <h2 className="mt-3 text-3xl italic">{receipt.title}</h2>
        <p className="mt-2 text-sm text-fg-soft">{receipt.detail}</p>
        <p className="mt-3 text-sm">
          {[receipt.date, receipt.time].filter(Boolean).join(" · ") || "On file"}
        </p>
        <p className="mt-4 font-display text-5xl">${receipt.price}</p>
        <p className="mt-2 text-xs font-semibold tracking-[0.16em] text-powder uppercase">
          Paid · Oklahoma Prospects
        </p>
        <p className="mt-4 text-sm text-fg-soft">
          {CLUB.addressLine1}
          <br />
          {CLUB.addressLine2}
          <br />
          {CLUB.phoneDisplay}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button asChild variant="primary">
            <a href={receiptMailto(receipt)}>
              <Mail className="size-4" />
              Email this receipt
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={receiptSms(receipt)}>
              <MessageSquare className="size-4" />
              Text this receipt
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
