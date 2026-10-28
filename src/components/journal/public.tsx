import { useEffect } from "react";
import type { PublicArticle } from "@/lib/journal/contracts";
import { recordJournalMetric } from "@/lib/journal/api";
export function JournalMasthead() {
  return (
    <header className="border-b-4 border-maroon bg-ink px-5 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold tracking-[.2em] text-powder">PROSPECTS SPORTS ACADEMY</p>
        <h1 className="mt-3 text-5xl sm:text-7xl">THE PROSPECTS JOURNAL</h1>
        <p className="mt-3 font-semibold tracking-widest text-powder">
          THE GAME. THE GRIND. THE NEXT GENERATION.
        </p>
        <p className="mt-5 max-w-2xl text-fg-soft">
          Baseball and softball news, player development insights, and stories from the Prospects
          community.
        </p>
      </div>
    </header>
  );
}
export function ArticleCard({ article, hero = false }: { article: PublicArticle; hero?: boolean }) {
  const d = article.document;
  return (
    <article
      className={`overflow-hidden rounded-2xl border border-line bg-white ${hero ? "md:col-span-2" : ""}`}
    >
      {d.heroId ? (
        <a href={`/articles/${d.slug}`} tabIndex={-1} aria-hidden="true">
          <img
            src={`/api/journal/images/${d.heroId}`}
            alt=""
            loading="lazy"
            width="1280"
            height="720"
            className="aspect-video w-full object-cover"
          />
        </a>
      ) : (
        <div
          className="border-b border-line bg-ink px-6 py-8 font-bold tracking-widest text-powder"
          aria-hidden="true"
        >
          THE PROSPECTS JOURNAL
        </div>
      )}
      <div className="p-6">
        <p className="text-xs font-bold tracking-widest text-maroon uppercase">
          {d.sport} {d.series ? `· ${d.series}` : ""}
        </p>
        <h2 className="mt-2 text-3xl break-words">
          <a href={`/articles/${d.slug}`}>{d.title}</a>
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{d.excerpt}</p>
        <p className="mt-4 text-xs text-muted">
          {new Date(article.publishedAt).toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          · {article.readingMinutes} min read
        </p>
      </div>
    </article>
  );
}
export function JournalStrip({ articles }: { articles: PublicArticle[] }) {
  if (!articles.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-12" aria-label="From the Prospects Journal">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-maroon">ARTICLES & NEWS</p>
          <h2 className="text-4xl">From the Prospects Journal</h2>
        </div>
        <a className="font-semibold underline" href="/articles">
          Read all articles
        </a>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}
export function JournalMeasurement({ id }: { id: string }) {
  useEffect(() => {
    if (
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    )
      return;
    void recordJournalMetric({ data: { id, event: "view" } }).catch(() => {});
  }, [id]);
  return null;
}
export function JournalCTA({ id }: { id: string }) {
  return (
    <aside className="my-10 rounded-2xl bg-ink p-7 text-white">
      <h2 className="text-3xl">Put your next practice on the calendar.</h2>
      <p className="mt-2 text-fg-soft">
        Explore current cage availability, instruction, and team opportunities.
      </p>
      <div className="mt-5 flex flex-wrap gap-4">
        {[
          ["/book", "Book a cage"],
          ["/training", "Find instruction"],
          ["/tryouts", "Explore tryouts"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            onClick={() => {
              void recordJournalMetric({ data: { id, event: "cta" } }).catch(() => {});
            }}
            className="rounded-lg bg-powder px-4 py-3 font-semibold text-ink"
          >
            {label}
          </a>
        ))}
      </div>
    </aside>
  );
}
