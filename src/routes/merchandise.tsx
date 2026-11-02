import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shop } from "@/components/shop";
export const Route = createFileRoute("/merchandise")({
  head: () =>
    pageHead(
      "/merchandise",
      "Pro Shop",
      "Official Prospects apparel, headwear, and team collections.",
      false,
    ),
  component: Shop,
});
