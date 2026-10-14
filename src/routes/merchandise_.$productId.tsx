import { createFileRoute } from "@tanstack/react-router";
import { Shop } from "@/components/shop";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/merchandise_/$productId")({
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
  return <Shop selectedProductId={productId} />;
}
