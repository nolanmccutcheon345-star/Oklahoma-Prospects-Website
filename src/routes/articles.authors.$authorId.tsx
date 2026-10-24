import { createFileRoute, notFound } from "@tanstack/react-router";
import { getJournalFeed } from "@/lib/journal/api";
import { pageHead } from "@/lib/seo";
import { ArticleCard } from "@/components/journal/public";
export const Route = createFileRoute("/articles/authors/$authorId")({
  validateSearch: (s: Record<string, unknown>) => ({
    ...(Number(s.page) > 1 ? { page: Math.min(10000, Math.floor(Number(s.page))) } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const f = await getJournalFeed({ data: { author: params.authorId, ...deps } });
    if (!f.articles.length) throw notFound();
    return f;
  },
  head: ({ loaderData, params }) =>
    pageHead(
      `/articles/authors/${encodeURIComponent(params.authorId)}`,
      loaderData?.articles[0]?.author?.name || "Journal author",
      "Articles from the Prospects Journal.",
      (loaderData?.page || 1) > 1,
    ),
  component: function AuthorArchive() {
    const f = Route.useLoaderData();
    const { authorId } = Route.useParams();
    return (
      <main id="main" className="mx-auto max-w-6xl px-5 py-12">
        <a href="/articles" className="underline">
          The Prospects Journal
        </a>
        <h1 className="my-6 text-4xl">
          Articles by {f.articles[0]?.author?.name || "Prospects staff"}
        </h1>
        <div className="grid gap-5 md:grid-cols-3">
          {f.articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
        <nav aria-label="Author article pages" className="mt-6 flex justify-between">
          {f.page > 1 && (
            <a
              className="underline"
              href={`/articles/authors/${encodeURIComponent(authorId)}?page=${f.page - 1}`}
            >
              Previous
            </a>
          )}
          {f.page < f.pages && (
            <a
              className="underline"
              href={`/articles/authors/${encodeURIComponent(authorId)}?page=${f.page + 1}`}
            >
              Next
            </a>
          )}
        </nav>
      </main>
    );
  },
});
