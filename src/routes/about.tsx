import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicAbout } from "@/lib/website-content-api";
import { pageHead } from "@/lib/seo";
import { AboutContent } from "@/components/about-content";

export const Route = createFileRoute("/about")({
  loader: () => getPublicAbout(),
  staleTime: 0,
  head: ({ loaderData }) =>
    pageHead(
      "/about",
      loaderData?.content?.seoTitle || "About",
      loaderData?.content?.seoDescription ||
        "Learn about Prospects Sports Academy, baseball and softball training in Broken Arrow, Oklahoma.",
    ),
  component: AboutPage,
});

function AboutPage() {
  const data = Route.useLoaderData();
  return (
    <main id="main">
      {data.content ? (
        <AboutContent content={data.content} />
      ) : (
        <section className="mx-auto max-w-3xl px-5 py-12">
          <h1 className="text-4xl">About Prospects Sports Academy</h1>
          <p className="mt-4" role={data.failed ? "alert" : "status"}>
            {data.failed
              ? "The About page is temporarily unavailable. Please try again."
              : "Our academy story will be available here soon."}
          </p>
          <div className="mt-4 flex flex-wrap gap-5">
            {data.failed && (
              <Link
                to="/about"
                reloadDocument
                className="inline-flex min-h-11 items-center underline"
              >
                Try again
              </Link>
            )}
            <Link to="/contact" className="inline-flex min-h-11 items-center underline">
              Contact the academy
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
