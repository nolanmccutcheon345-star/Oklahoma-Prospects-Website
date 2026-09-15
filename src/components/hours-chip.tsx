import { useClubStatus } from "@/lib/hours";
import { cn } from "@/lib/utils";

export function HoursChip({
  className,
  tone = "onDark",
}: {
  className?: string;
  tone?: "onDark" | "onLight";
}) {
  const status = useClubStatus();
  const onDark = tone === "onDark";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide uppercase",
        onDark
          ? status.open
            ? "bg-powder/15 text-powder"
            : "bg-fg-inverse/10 text-fg-soft"
          : status.open
            ? "bg-maroon/10 text-maroon"
            : "bg-ink/10 text-muted",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status.open ? (onDark ? "bg-powder" : "bg-maroon") : "bg-muted",
        )}
        aria-hidden="true"
      />
      {status.detail}
    </span>
  );
}
