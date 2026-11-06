import { createFileRoute, notFound } from "@tanstack/react-router";
import { getShop } from "@/lib/shop/api";
import { Shop } from "@/components/shop";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/merchandise_/$productId")({
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
      "Oklahoma Prospects Product",
      "Official Oklahoma Prospects gear, available sizes and product details.",
      false,
    ),
  component: ProductPage,
});
function ProductPage() {
  const { productId } = Route.useParams();
  const data = Route.useLoaderData();
  return <Shop selectedProductSlug={productId} initialData={data} />;
}
