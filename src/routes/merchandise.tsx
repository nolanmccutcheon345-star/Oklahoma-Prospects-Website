import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shop } from "@/components/shop";
import { shopSearch } from "@/lib/shop/navigation";
export const Route = createFileRoute("/merchandise")({
  validateSearch: shopSearch,
  head: () =>
    pageHead(
      "/merchandise",
      "Oklahoma Prospects Shop",
      "Official Oklahoma Prospects apparel, headwear, and team collections.",
      false,
    ),
  component: MerchandisePage,
});
function MerchandisePage() {
  const { view = "shop" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Shop
      view={view}
      setView={(next) => void navigate({ search: { view: next === "shop" ? undefined : next } })}
    />
  );
}
