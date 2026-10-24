import { createFileRoute } from "@tanstack/react-router";
import { getPublicHandbooks } from "@/lib/enrollment/api";
import { HandbookReader } from "@/components/enrollment/handbook-reader";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/handbook")({
  loader: () => getPublicHandbooks(),
  staleTime: 0,
  head: () =>
    pageHead(
      "/handbook",
      "Parent & Player Handbook",
      "Prospects Sports Academy baseball and softball policies and family guide.",
    ),
  component: Page,
});
function Page() {
  const documents = Route.useLoaderData();
  return (
    <main id="main" className="mx-auto max-w-4xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-maroon">
        Prospects Sports Academy
      </p>
      <h1 className="mt-2 text-4xl">Parent & Player Handbook</h1>
      <p className="my-5">
        Organization standards, sport supplements and a clear start to your season. Your private
        team packet and signed agreements stay in your account.
      </p>
      <a href="/enrollment" className="mb-6 inline-flex min-h-11 items-center underline">
        My season & enrollment
      </a>
      <HandbookReader documents={documents} />
    </main>
  );
}
