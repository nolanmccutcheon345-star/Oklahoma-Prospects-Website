import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { JournalEditor } from "@/components/journal/editor";
export const Route = createFileRoute("/office_/journal")({
  head: () =>
    pageHead(
      "/office/journal",
      "Journal editorial workspace",
      "Private editorial workspace.",
      true,
    ),
  component: () => (
    <main id="main" className="mx-auto max-w-7xl px-4 py-8">
      <JournalEditor />
    </main>
  ),
});
