import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shop } from "@/components/shop";
export const Route = createFileRoute("/merchandise")({
  head: () =>
    pageHead(
      "/merchandise",
      "Oklahoma Prospects Shop",
      "Official Oklahoma Prospects apparel, headwear, and team collections.",
      false,
    ),
  component: Shop,
});
