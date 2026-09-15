import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { PaySearch } from "@/lib/pay";

export function HoldConfirm({
  title,
  summary,
  smsHref,
  smsLabel,
  onReset,
  paySearch,
  payLabel,
}: {
  title: string;
  summary: string;
  smsHref: string;
  smsLabel: string;
  onReset: () => void;
  paySearch?: PaySearch;
  payLabel?: string;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 p-5 shadow-border">
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        Still in Oklahoma Prospects
      </p>
      <h2 className="mt-2 text-3xl">{title}</h2>
      <p className="mt-3 text-muted">{summary}</p>
      <p className="mt-3 text-sm text-muted">
        Hold it on this club. Call or text the desk only after this hour is
        booked if you have a question.
      </p>
      <div className="mt-5 grid gap-2">
        {paySearch && payLabel ? (
          <Button asChild>
            <Link to="/pay" search={paySearch}>
              {payLabel}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outlineDark">
          <a href={smsHref}>{smsLabel}</a>
        </Button>
        <Button type="button" variant="ghost" onClick={onReset}>
          Change this request
        </Button>
      </div>
    </section>
  );
}
