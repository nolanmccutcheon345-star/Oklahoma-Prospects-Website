import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getJournalFeed } from "@/lib/journal/api";
import { pageHead } from "@/lib/seo";
import { JournalMasthead, ArticleCard } from "@/components/journal/public";
export const Route = createFileRoute("/articles/")({
  validateSearch: (s: Record<string, unknown>) => ({
    ...(typeof s.q === "string" && s.q.trim() ? { q: s.q.slice(0, 200) } : {}),
    ...(typeof s.category === "string" && s.category ? { category: s.category.slice(0, 100) } : {}),
    ...(["baseball", "softball", "academy"].includes(String(s.sport))
      ? { sport: s.sport as "baseball" | "softball" | "academy" }
      : {}),
    ...(Number(s.page) > 1 ? { page: Math.min(10000, Math.floor(Number(s.page))) } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getJournalFeed({ data: deps }),
  head: ({ loaderData }) =>
    pageHead(
      "/articles",
      "The Prospects Journal",
      "Baseball and softball news, player development insights, and stories from the Prospects community.",
      Boolean(loaderData?.filtered),
    ),
  pendingComponent: () => (
    <main id="main">
      <JournalMasthead />
      <div
        role="status"
        className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-3"
        aria-label="Loading articles"
      >
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-80 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main id="main" className="p-8">
      <h1 className="text-3xl">Articles could not be loaded</h1>
      <p>Please try again.</p>
      <button onClick={reset} className="mt-4 rounded bg-powder px-5 py-3">
        Retry
      </button>
    </main>
  ),
  component: Newsroom,
});
function Newsroom() {
  const feed = Route.useLoaderData(),
    search = Route.useSearch(),
    router = useRouter();
  return (
    <main id="main">
      <JournalMasthead />
      <div className="mx-auto max-w-6xl px-5 py-9">
        <form
          action="/articles"
          method="get"
          className="mb-8 grid gap-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-4"
        >
          <label className="text-sm">
            Search articles
            <input
              name="q"
              defaultValue={search.q}
              maxLength={200}
              className="mt-1 w-full rounded border border-line p-3"
            />
          </label>
          <label className="text-sm">
            Category
            <select
              name="category"
              defaultValue={search.category}
              className="mt-1 w-full rounded border border-line p-3"
            >
              <option value="">All Articles</option>
              {feed.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Sport
            <select
              name="sport"
              defaultValue={search.sport || ""}
              className="mt-1 w-full rounded border border-line p-3"
            >
              <option value="">All sports</option>
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
              <option value="academy">Academy</option>
            </select>
          </label>
          <button className="self-end rounded-lg bg-powder px-5 py-3 font-semibold">
            Find articles
          </button>
        </form>
        {!feed.articles.length ? (
          <section className="rounded-2xl border border-line bg-white p-8">
            <h2 className="text-3xl">
              {search.q || search.category || search.sport
                ? "No matching articles"
                : "Stories are on the way"}
            </h2>
            <p className="mt-2 text-muted">
              {search.q || search.category || search.sport
                ? "Try another search or category."
                : "Visit again for approved stories and player development resources from Prospects."}
            </p>
            <a className="mt-4 inline-block underline" href="/articles">
              All articles
            </a>
          </section>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {feed.total} article{feed.total === 1 ? "" : "s"}
            </p>
            <section className="grid gap-6 md:grid-cols-3" aria-label="Latest articles">
              {feed.articles.map((a, i) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  hero={
                    i === 0 &&
                    (search.page || 1) === 1 &&
                    a.document.featured.newsroom &&
                    (!a.document.featured.expiresAt ||
                      Date.parse(a.document.featured.expiresAt) > Date.now())
                  }
                />
              ))}
            </section>
            <nav
              aria-label="Article pages"
              className="my-8 flex items-center justify-between gap-4"
            >
              {feed.page > 1 ? (
                <Link
                  to="/articles"
                  search={{ ...search, page: feed.page - 1 }}
                  className="rounded border px-4 py-3"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {feed.page} of {feed.pages}
              </span>
              {feed.page < feed.pages ? (
                <Link
                  to="/articles"
                  search={{ ...search, page: feed.page + 1 }}
                  className="rounded border px-4 py-3"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
        <section className="my-10 grid gap-5 md:grid-cols-2" aria-label="Journal collections">
          <a
            href="/articles?category=development"
            className="rounded-2xl border border-line bg-white p-6"
          >
            <p className="text-xs font-bold text-maroon">LEARN THE GAME</p>
            <h2 className="mt-2 text-3xl">Player development</h2>
            <p className="mt-2 text-sm text-muted">
              Explore coaching insights and resources for the next practice.
            </p>
          </a>
          <a
            href="/articles?category=teams"
            className="rounded-2xl border border-line bg-white p-6"
          >
            <p className="text-xs font-bold text-maroon">AROUND THE ACADEMY</p>
            <h2 className="mt-2 text-3xl">Our Prospects community</h2>
            <p className="mt-2 text-sm text-muted">
              Read verified team news and stories from the academy.
            </p>
          </a>
        </section>
        {feed.popular.length > 0 && (
          <section className="my-8 rounded-xl bg-white p-6">
            <h2 className="text-3xl">Most read on the Journal</h2>
            <p className="mt-2 text-sm text-muted">
              Based on recorded article views, not unique readers.
            </p>
            <ol className="mt-4 list-decimal space-y-3 pl-5">
              {feed.popular.map((a) => (
                <li key={a.slug}>
                  <a className="underline" href={`/articles/${a.slug}`}>
                    {a.title}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
        <button
          type="button"
          className="text-sm underline"
          onClick={() => void router.invalidate()}
        >
          Refresh articles
        </button>
      </div>
    </main>
  );
}
