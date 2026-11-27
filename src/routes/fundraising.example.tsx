import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import FundraisingApp from "@/components/fundraising-app";
import css from "@/fundraising.css?url";
export const Route = createFileRoute("/fundraising/example")({
  head: () => {
    const head = pageHead(
      "/fundraising/example",
      "Player Fundraising",
      "Example fundraising page. This demonstration is not a live player campaign.",
      true,
    );
    return { ...head, links: [...head.links, { rel: "stylesheet", href: css }] };
  },
  component: Page,
});
function Page() {
  return <FundraisingApp mode="example" />;
}
