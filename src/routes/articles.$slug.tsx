import { createFileRoute, notFound, redirect, useRouter } from "@tanstack/react-router";
import { getPublicArticle } from "@/lib/journal/api";
import { pageHead } from "@/lib/seo";
import { ArticleBody } from "@/components/journal/article-body";
import { ArticleCard, JournalCTA, JournalMeasurement } from "@/components/journal/public";
export const Route = createFileRoute("/articles/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicArticle({ data: { slug: params.slug } });
    if (!data) throw notFound();
    if ("redirect" in data) throw redirect({ href: `/articles/${data.redirect}`, statusCode: 301 });
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return pageHead("/articles", "Article unavailable", "This article is not available.", true);
    const a = loaderData.article,
      d = a.document,
      path = `/articles/${d.slug}`,
      head = pageHead(path, d.seoTitle || d.title, d.seoDescription || d.excerpt, d.noindex);
    return {
      ...head,
      meta: head.meta
        .map((m) =>
          "property" in m && m.property === "og:type"
            ? { property: "og:type", content: d.news ? "article" : "article" }
            : "property" in m && m.property === "og:image" && d.heroId
              ? {
                  property: "og:image",
                  content: `https://prospectssports.club/api/journal/images/${d.heroId}`,
                }
              : m,
        )
        .concat([
          { property: "article:published_time", content: a.publishedAt },
          { property: "article:modified_time", content: a.updatedAt },
        ]),
    };
  },
  notFoundComponent: () => (
    <main id="main" className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-4xl">Article not available</h1>
      <p className="mt-4">This story may have been withdrawn or its address may be incorrect.</p>
      <a className="mt-5 inline-block underline" href="/articles">
        Back to the Journal
      </a>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main id="main" className="p-8">
      <h1 className="text-3xl">Could not load this article</h1>
      <button className="mt-4 rounded bg-powder p-3" onClick={reset}>
        Retry
      </button>
    </main>
  ),
  component: ArticlePage,
});
function ArticlePage() {
  const { article: a, related, credits, links } = Route.useLoaderData(),
    d = a.document,
    nonce = useRouter().options.ssr?.nonce;
  const url = `https://prospectssports.club/articles/${d.slug}`;
  const date = (s: string) =>
    new Date(s).toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": d.news ? "NewsArticle" : "Article",
      headline: d.title,
      description: d.excerpt,
      datePublished: a.publishedAt,
      dateModified: a.updatedAt,
      mainEntityOfPage: url,
      ...(d.heroId ? { image: `https://prospectssports.club/api/journal/images/${d.heroId}` } : {}),
      ...(a.author
        ? {
            author: {
              "@type": "Person",
              name: a.author.name,
              url: `https://prospectssports.club${a.author.href}`,
            },
          }
        : {}),
      publisher: {
        "@type": "Organization",
        name: "Prospects Sports Academy",
        url: "https://prospectssports.club",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://prospectssports.club/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "The Prospects Journal",
          item: "https://prospectssports.club/articles",
        },
        { "@type": "ListItem", position: 3, name: d.title, item: url },
      ],
    },
  ];
  return (
    <main id="main">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}
      />
      <JournalMeasurement id={a.id} />
      <article className="mx-auto max-w-3xl px-5 py-10">
        <nav aria-label="Breadcrumb" className="mb-7 text-sm">
          <a className="underline" href="/">
            Home
          </a>{" "}
          /{" "}
          <a className="underline" href="/articles">
            The Prospects Journal
          </a>
        </nav>
        <p className="font-semibold tracking-widest text-maroon uppercase">
          {d.sport} {d.series ? `· ${d.series}` : ""}
        </p>
        <h1 className="mt-3 text-4xl break-words sm:text-6xl">{d.title}</h1>
        {d.subtitle && <p className="mt-4 text-xl text-muted">{d.subtitle}</p>}
        <div className="my-5 space-y-1 text-sm text-muted">
          {a.author && (
            <p>
              By{" "}
              <a className="underline" href={a.author.href}>
                {a.author.name}
              </a>
            </p>
          )}
          {a.reviewer && (
            <p>
              Reviewed by{" "}
              <a className="underline" href={a.reviewer.href}>
                {a.reviewer.name}
              </a>
            </p>
          )}
          <p>
            <time dateTime={a.publishedAt}>{date(a.publishedAt)}</time> · {a.readingMinutes} min
            read
          </p>
          {a.updatedAt !== a.publishedAt && (
            <p>
              Updated <time dateTime={a.updatedAt}>{date(a.updatedAt)}</time>
            </p>
          )}
        </div>
        {d.heroId && (
          <figure className="mb-8">
            <img
              src={`/api/journal/images/${d.heroId}`}
              alt={d.heroAlt}
              width="1280"
              height="720"
              className="h-auto w-full rounded-xl"
            />
            <figcaption className="mt-2 text-xs text-muted">
              {credits.find((c) => c.id === d.heroId)?.credit}
            </figcaption>
          </figure>
        )}
        <ArticleBody blocks={d.body} credits={credits} />
        {d.sources.length > 0 && (
          <section className="mt-10 border-t border-line pt-5">
            <h2 className="text-2xl">Sources & further reading</h2>
            <ul className="mt-3 space-y-2">
              {d.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} className="underline" rel="noopener noreferrer">
                    {s.title}
                  </a>
                  {s.checkedOn && (
                    <span className="ml-2 text-xs text-muted">Reviewed {s.checkedOn}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mt-8 flex flex-wrap gap-4 border-t border-line pt-5">
          <a
            href={`mailto:?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(url)}`}
            className="underline"
          >
            Share by email
          </a>
          <button
            className="underline"
            onClick={() => {
              if (navigator.share) void navigator.share({ title: d.title, url }).catch(() => {});
              else void navigator.clipboard.writeText(url);
            }}
          >
            Share article link
          </button>
        </div>
        {links.length > 0 && (
          <section className="my-8">
            <h2 className="text-2xl">Explore related Prospects resources</h2>
            <ul className="mt-3 space-y-2">
              {links.map((link, i) => (
                <li key={i}>
                  <a className="underline" href={link.href}>
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <JournalCTA id={a.id} />
      </article>
      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-12">
          <h2 className="mb-5 text-3xl">More from the Journal</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {related.map((a) => (
              <ArticleCard article={a} key={a.id} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
