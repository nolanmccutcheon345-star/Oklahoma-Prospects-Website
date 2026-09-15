import { useState } from "react";
import { LANES } from "@/lib/club";
import { cn } from "@/lib/utils";

const TONE: Record<(typeof LANES)[number]["tone"], string> = {
  maroon: "bg-maroon text-fg-inverse",
  navy: "bg-navy text-fg-inverse",
  ink: "bg-ink text-fg-inverse",
  powder: "bg-powder text-ink",
};

export function FacilityLanes() {
  const [selected, setSelected] = useState<(typeof LANES)[number]["id"]>("1");
  const lane = LANES.find((item) => item.id === selected) ?? LANES[0];

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl bg-ink p-3 text-fg-inverse">
        <p className="px-2 pt-1 pb-3 text-[0.7rem] font-semibold tracking-[0.16em] text-powder uppercase">
          Oklahoma Prospects
        </p>
        <div className="grid gap-1.5">
          {LANES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-left transition-[transform,background-color] duration-150",
                TONE[item.tone],
                "tall" in item && item.tall ? "min-h-16" : "min-h-12",
                selected === item.id
                  ? "ring-2 ring-powder ring-offset-2 ring-offset-ink"
                  : "opacity-90",
              )}
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="font-display text-2xl leading-none font-extrabold">
                  {item.id}
                </span>
                <span className="truncate text-sm font-semibold">{item.name}</span>
              </span>
              <span className="shrink-0 text-xs font-medium opacity-80">{item.size}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-paper-2 p-5 shadow-border">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Lane {lane.id}
        </p>
        <h3 className="mt-1 text-3xl">{lane.name}</h3>
        <p className="mt-2 text-muted">
          {lane.size} · {lane.use}
        </p>
      </div>
    </div>
  );
}
