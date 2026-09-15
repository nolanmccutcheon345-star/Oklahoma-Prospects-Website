import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  accent,
  copy,
  actions,
  image,
  compact,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  copy?: string;
  actions?: ReactNode;
  image?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-ink text-fg-inverse",
        compact ? "pt-8 pb-10" : "pt-10 pb-14",
      )}
    >
      {image ? (
        <>
          <img
            src={image}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-[center_36%]"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/88 to-ink/45" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-ink/20" />
        </>
      ) : null}
      <div className="relative mx-auto w-full max-w-3xl px-5">
        <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-powder uppercase">
          {eyebrow}
        </p>
        <h1 className="max-w-xl font-display text-5xl leading-[0.92] font-extrabold italic sm:text-6xl">
          {title}
          {accent ? (
            <>
              <br />
              <span className="text-powder not-italic">{accent}</span>
            </>
          ) : null}
        </h1>
        {copy ? (
          <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-fg-soft">
            {copy}
          </p>
        ) : null}
        {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-maroon from-70% to-powder" />
    </section>
  );
}
