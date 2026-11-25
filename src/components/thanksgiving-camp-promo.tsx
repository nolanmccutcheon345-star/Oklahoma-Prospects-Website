import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { thanksgivingCampAgeRangeLabel, thanksgivingCampIsCurrent } from "@/lib/thanksgiving-camp";

/** Site-wide Thanksgiving Camp promo. Hidden after the last camp date in America/Chicago. */
export function ThanksgivingCampPromo() {
  if (!thanksgivingCampIsCurrent()) return null;
  return (
    <aside className="border-y border-line bg-powder/30 px-5 py-5" aria-label="Thanksgiving Camp">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          Baseball & softball · Ages {thanksgivingCampAgeRangeLabel()} · $45/day or $120 for all 3
          days
        </p>
        <Button asChild variant="maroon">
          <Link to="/thanksgiving-camp">Thanksgiving Camp — Nov. 23–25 — Register Now</Link>
        </Button>
      </div>
    </aside>
  );
}
