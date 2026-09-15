import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLUB, LINKS } from "@/lib/club";
import { cn } from "@/lib/utils";

export function GoogleReview({
  tone = "ink",
}: {
  tone?: "ink" | "paper";
}) {
  const dark = tone === "ink";
  return (
    <section
      className={cn(
        "rounded-2xl p-5",
        dark ? "bg-ink text-fg-inverse" : "bg-paper-2 text-ink shadow-border",
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold tracking-[0.16em] uppercase",
          dark ? "text-powder" : "text-maroon",
        )}
      >
        One listing · one name
      </p>
      <div className="mt-3 flex items-start gap-3">
        <Star
          className={cn("mt-1 size-5 shrink-0", dark ? "text-powder" : "text-maroon")}
        />
        <div>
          <h2 className="font-display text-2xl uppercase">Oklahoma Prospects</h2>
          <p className={cn("mt-2 text-sm", dark ? "text-fg-soft" : "text-muted")}>
            Search Google for Oklahoma Prospects, {CLUB.addressLine1}, Broken
            Arrow. Leave a review on this club’s listing.
          </p>
        </div>
      </div>
      <Button asChild className="mt-4" variant={dark ? "primary" : "maroon"}>
        <a href={LINKS.googleReview} target="_blank" rel="noopener noreferrer">
          Open the Oklahoma Prospects listing
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Button>
    </section>
  );
}
