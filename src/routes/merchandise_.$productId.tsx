import { createFileRoute, notFound } from "@tanstack/react-router";
import { getShop } from "@/lib/shop/api";
import { Shop } from "@/components/shop";
import { pageHead } from "@/lib/seo";
import { shopSearch } from "@/lib/shop/navigation";
export const Route = createFileRoute("/merchandise_/$productId")({
  validateSearch: shopSearch,
  loader: async ({ params }) => {
    // Internal draft identifiers are never public product URLs, even after publication.
    if (params.productId.toLowerCase().startsWith("draft-")) throw notFound();
    const data = await getShop();
    if (!data.products.some((p) => p.slug === params.productId)) throw notFound();
    return data;
  },
  head: ({ params }) =>
    pageHead(
      "/merchandise/" + encodeURIComponent(params.productId),
      "Pro Shop Product",
      "Official Prospects gear, available sizes and product details.",
      false,
    ),
  component: ProductPage,
});
function ProductPage() {
  const { productId } = Route.useParams();
  const data = Route.useLoaderData();
  const { view = "shop" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Shop
      selectedProductSlug={productId}
      initialData={data}
      view={view}
      setView={(next) => void navigate({ search: { view: next === "shop" ? undefined : next } })}
    />
  );
}
