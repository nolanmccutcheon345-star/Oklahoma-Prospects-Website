import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  getShopOffice,
  syncShopProduct,
  saveShopProduct,
  refreshShopOrders,
  createShopDraft,
  archiveShopProduct,
  saveShopPricing,
  uploadShopPhoto,
  saveShopGallery,
  checkFulfillEngineConnection,
  searchFulfillEngineCatalog,
} from "@/lib/shop/api";
import { priceVariant, priceMetrics, type PricingMode } from "@/lib/shop/pricing";
import { prepareProductPhoto } from "@/lib/shop/photo-studio";
import { formatMoney } from "@/lib/pricing";
import { Orders } from "./shop";
import { ShopCollectionsEditor } from "./shop-collections-editor";
import type { ShopNavigation } from "@/lib/shop/collections";
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-base";
type Office = Awaited<ReturnType<typeof getShopOffice>>;
type Product = Office["products"][number];
type Run = (work: () => Promise<unknown>) => Promise<void>;
export function ShopOffice({ changed }: { changed: () => void }) {
  const [data, setData] = useState<Office>(),
    [id, setId] = useState(""),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [connection, setConnection] = useState("");
  async function refresh() {
    setData(await getShopOffice());
  }
  useEffect(() => {
    let active = true;
    void getShopOffice()
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
      changed();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 min-w-0 rounded-xl border border-line p-4 sm:p-6">
      <h2 className="text-3xl">Shop owner controls</h2>
      {message && (
        <p role="status" className="my-4 rounded-lg bg-paper-2 p-3">
          {message}
        </p>
      )}
      {data && (
        <>
          <details className="my-5 rounded-xl border border-line p-4" open={!data.readiness.vendor}>
            <summary className="cursor-pointer text-lg font-semibold">
              Fulfill Engine connection &amp; launch
            </summary>
            <p className="mt-3 text-sm">
              Selected for the premium Prospects collection. Browsing, product management and Square
              checkout stay on our website.
            </p>
            <ol className="my-3 list-decimal space-y-2 pl-5 text-sm">
              <li>Request the free Platform Connect account for Oklahoma Prospects.</li>
              <li>
                Confirm access to the exact Richardson, Nike, Under Armour and adidas styles. The
                Game and EvoShield are not verified.
              </li>
              <li>
                Add the account ID, API key and design campaign ID through secure production
                configuration. Never paste credentials into a product field.
              </li>
              <li>
                Configure production artwork in Fulfill Engine, then import the decorated product
                below. Supplier base prices remain preliminary until decoration, order fees and
                supplier tax are confirmed.
              </li>
              <li>
                Verify the vendor’s shipping calculation, finish the order integration and test
                fulfillment before opening sales. The public API does not currently document a
                pre-checkout shipping quote.
              </li>
            </ol>
            <div className="flex flex-wrap gap-3">
              <a
                className="underline"
                href="https://fulfillengine.com/pages/platform-connect-signup"
                target="_blank"
                rel="noreferrer"
              >
                Request free Platform Connect account
              </a>
              <a
                className="underline"
                href="https://help.fulfillengine.com/en/api-guide/rest-authentication"
                target="_blank"
                rel="noreferrer"
              >
                Connection instructions
              </a>
            </div>
            <ul className="my-3 grid gap-1 text-sm sm:grid-cols-2">
              {Object.entries(data.readiness).map(([k, v]) => (
                <li key={k}>
                  {
                    (
                      {
                        vendor: "Account credentials configured",
                        campaign: "Design campaign configured",
                        shipping: "Exact shipping calculation",
                        fulfillment: "Order submission and tracking",
                        tax: "Tax configuration",
                      } as Record<string, string>
                    )[k]
                  }
                  : {v ? "configured — verify before launch" : "pending"}
                </li>
              ))}
            </ul>
            <Button
              variant="outlineDark"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await checkFulfillEngineConnection();
                  setConnection(r.message);
                })
              }
            >
              Check Fulfill Engine connection
            </Button>
            {connection && (
              <p className="mt-3 text-sm" role="status">
                {connection}
              </p>
            )}
          </details>
          <ShopCollectionsEditor
            key={`navigation-${data.settings.revision}`}
            navigation={data.settings.navigation}
            revision={data.settings.revision}
            busy={busy}
            run={run}
          />
          <SupplierCatalog busy={busy} />
          <PricingSettings
            key={`pricing-${data.settings.revision}`}
            settings={data.settings}
            busy={busy}
            run={run}
          />
          <div className="my-6 grid gap-5 lg:grid-cols-2">
            <form
              className="grid gap-3 rounded-xl bg-paper-2 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await createShopDraft({ data: { title } });
                  setTitle("");
                });
              }}
            >
              <h3 className="text-xl">Add a product</h3>
              <label>
                New product title
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <p className="text-sm">
                Start a draft now, then link its Fulfill Engine design product and prepare the
                photos.
              </p>
              <Button type="submit" disabled={busy}>
                Create product draft
              </Button>
            </form>
            <form
              className="grid gap-3 rounded-xl bg-paper-2 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => syncShopProduct({ data: { id } }));
              }}
            >
              <h3 className="text-xl">Import from Fulfill Engine</h3>
              <label>
                Fulfill Engine product ID
                <input
                  className={inputClass}
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <p className="text-sm">
                Import an existing design and its sizes, colors and actual vendor costs. New
                products use your store markup.
              </p>
              <Button type="submit" disabled={busy}>
                Import product
              </Button>
            </form>
          </div>
          <label className="my-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived products
          </label>
          {!data.products.filter((p) => showArchived || !p.archived).length && (
            <p className="my-5">
              No products yet. Add a draft or import your first Fulfill Engine product.
            </p>
          )}
          {data.products
            .filter((p) => showArchived || !p.archived)
            .map((p) => (
              <ProductEditor
                key={p.id + ":" + p.revision + ":" + data.settings.revision}
                product={p}
                navigation={data.settings.navigation}
                defaultBps={data.settings.default_markup_bps}
                busy={busy}
                run={run}
              />
            ))}
          <h3 className="mt-8 text-2xl">Fulfillment queue & orders</h3>
          <p className="my-3 text-sm">
            Verified payments enter the queue. Supplier cost or shipping changes, refunds and
            production problems need owner review. A Square refund does not cancel manufacturing;
            check cancellation eligibility with that order’s supplier separately.
          </p>
          <Button
            variant="outlineDark"
            className="mb-5"
            disabled={busy}
            onClick={() => void run(() => refreshShopOrders())}
          >
            Process next fulfillment update
          </Button>
          <Orders rows={data.orders} />
        </>
      )}
    </section>
  );
}
function PricingSettings({
  settings,
  busy,
  run,
}: {
  settings: Office["settings"];
  busy: boolean;
  run: Run;
}) {
  const [markup, setMarkup] = useState(String(settings.default_markup_bps / 100));
  return (
    <form
      className="rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          saveShopPricing({
            data: { revision: settings.revision, markupBps: Math.round(Number(markup) * 100) },
          }),
        );
      }}
    >
      <h3 className="text-xl">Store pricing rule</h3>
      <label className="mt-3 block">
        Default markup on vendor cost (%)
        <input
          className={inputClass}
          type="number"
          min="0"
          max="1000"
          step="0.01"
          required
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
        />
      </label>
      <p className="my-3 text-sm">
        Retail = vendor cost × (1 + markup). A $20 cost becomes{" "}
        {formatMoney(Math.ceil(2000 * (1 + Number(markup) / 100)))}. Gross margin is{" "}
        {((Number(markup) / (100 + Number(markup))) * 100).toFixed(1)}% before fees and expenses.
        Shipping will use verified supplier charges with no markup. Fulfill Engine shipping and
        complete costs are still pending; these prices are drafts.
      </p>
      <p className="mb-3 text-sm">
        Saving updates products following the store rule. Custom product rules and fixed size prices
        remain in place.
      </p>
      <Button type="submit" disabled={busy}>
        Save store pricing
      </Button>
    </form>
  );
}
function ProductEditor({
  product: p,
  defaultBps,
  navigation,
  busy,
  run,
}: {
  product: Product;
  defaultBps: number;
  navigation: ShopNavigation;
  busy: boolean;
  run: Run;
}) {
  const initialForm = {
    id: p.id,
    revision: p.revision,
    title: p.title,
    preparationNotes: p.preparation_notes,
    description: p.description,
    sizeGuide: p.size_guide,
    teamLabel: p.team_label,
    category: p.category,
    taxCode: p.tax_code,
    sampleApproved: p.sample_approved,
    published: p.published,
    comingSoon: p.coming_soon ?? false,
    shopStatus: (p.published ? (p.coming_soon ? "coming-soon" : "for-sale") : "draft") as
      "draft" | "coming-soon" | "for-sale",
    collectionIds: p.collection_ids ?? [],
    pricingMode: p.pricing_mode,
    pricingBps: p.pricing_bps,
    variants: p.variants.map((v) => ({
      id: v.id,
      costOverrideCents: v.costOverrideCents,
      priceOverrideCents: v.priceOverrideCents,
      sellEnabled: v.sellEnabled,
    })),
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [supplierId, setSupplierId] = useState(p.provider_product_id || ""),
    [remove, setRemove] = useState(false);
  function editVariant(
    index: number,
    field: "costOverrideCents" | "priceOverrideCents",
    value: string,
  ) {
    setForm({
      ...form,
      variants: form.variants.map((v, i) =>
        i === index ? { ...v, [field]: value === "" ? null : Math.round(Number(value) * 100) } : v,
      ),
    });
  }
  return (
    <article className="my-6 min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl">{p.title}</h3>
        <span className="rounded-full bg-paper-2 px-3 py-1 text-sm">
          {p.archived
            ? "Archived"
            : p.published
              ? p.coming_soon
                ? "Coming soon"
                : "Published"
              : "Draft"}
        </span>
      </div>
      {!p.archived && (
        <>
          {(p.provider === "printify" || p.provider === "fulfill-engine") && (
            <form
              className="my-4 grid gap-3 sm:grid-cols-[1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  syncShopProduct({
                    data: {
                      id: supplierId,
                      targetId: p.id,
                      provider: p.provider === "printify" ? "printify" : "fulfill-engine",
                    },
                  }),
                );
              }}
            >
              <label>
                Linked {p.provider === "printify" ? "Printify" : "Fulfill Engine"} product ID
                <input
                  className={inputClass}
                  required
                  value={supplierId}
                  maxLength={80}
                  onChange={(e) => setSupplierId(e.target.value)}
                />
              </label>
              <Button
                type="submit"
                disabled={busy || dirty}
                variant="outlineDark"
                className="self-end"
              >
                Sync supplier costs & variants
              </Button>
            </form>
          )}
          {p.provider === "fulfill-engine" && (
            <p className="my-3 rounded-lg bg-paper-2 p-3 text-sm">
              Preparation only. Confirm exact styles, full decorated costs, sample quality and
              shipping before sales. Importing variants does not approve a product or enable
              checkout.
            </p>
          )}
          {dirty && (
            <p className="my-3 text-sm">
              Save product edits before changing photos or syncing supplier details.
            </p>
          )}
          <PhotoStudio product={p} busy={busy || dirty} run={run} />
          <form
            className="mt-5 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => saveShopProduct({ data: form }));
            }}
          >
            <label>
              Private buying &amp; design notes
              <textarea
                className={inputClass}
                rows={4}
                maxLength={5000}
                value={form.preparationNotes}
                onChange={(e) => setForm({ ...form, preparationNotes: e.target.value })}
              />
            </label>
            <label>
              Product title
              <input
                className={inputClass}
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            {(["description", "sizeGuide", "teamLabel", "category", "taxCode"] as const).map(
              (key) => (
                <div key={key}>
                  <label htmlFor={`shop-${p.id}-${key}`}>
                    {
                      {
                        description: "Description",
                        sizeGuide: "Size guide",
                        teamLabel: "Team collection (optional)",
                        category: "Category",
                        taxCode: "Stripe Tax product category code",
                      }[key]
                    }
                  </label>
                  <textarea
                    id={`shop-${p.id}-${key}`}
                    className={inputClass}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ),
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Pricing rule
                <select
                  className={inputClass}
                  value={form.pricingMode}
                  onChange={(e) => setForm({ ...form, pricingMode: e.target.value as PricingMode })}
                >
                  <option value="default">Follow store markup ({defaultBps / 100}%)</option>
                  <option value="markup">Custom markup on cost</option>
                  <option value="margin">Target gross margin</option>
                  <option value="fixed">Keep current / fixed retail prices</option>
                </select>
              </label>
              {["markup", "margin"].includes(form.pricingMode) && (
                <label>
                  {form.pricingMode === "margin" ? "Gross margin (%)" : "Markup (%)"}
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    max={form.pricingMode === "margin" ? "94.99" : "1000"}
                    value={form.pricingBps / 100}
                    onChange={(e) =>
                      setForm({ ...form, pricingBps: Math.round(Number(e.target.value) * 100) })
                    }
                  />
                </label>
              )}
            </div>
            <p className="text-sm">
              Cost overrides affect pricing calculations only. Actual supplier charges and shipping
              are verified separately. Blank overrides follow the rule. Figures below exclude
              payment fees, supplier tax, returns and operating costs.
            </p>
            <div className="grid gap-3">
              {p.variants.map((v, index) => {
                const edit = form.variants[index],
                  cost = edit.costOverrideCents ?? v.vendorCostCents;
                let price: number | null = null;
                try {
                  price = priceVariant(
                    { ...v, ...edit },
                    form.pricingMode,
                    form.pricingBps,
                    defaultBps,
                  );
                } catch {
                  /* Invalid inputs are explained before save. */
                }
                const metrics = price ? priceMetrics(cost, price) : null;
                return (
                  <fieldset className="min-w-0 rounded-xl bg-paper-2 p-3" key={v.id}>
                    <legend className="px-1 font-semibold">{v.label}</legend>
                    <p className="text-sm">
                      Vendor cost:{" "}
                      {v.vendorCostCents ? formatMoney(v.vendorCostCents) : "Sync to retrieve"} ·{" "}
                      {v.available ? "Supplier available" : "Supplier unavailable"}
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label>
                        Pricing cost override ($)
                        <input
                          className={inputClass}
                          aria-label={`Pricing cost override ${v.label}`}
                          type="number"
                          min="0.01"
                          max="2500"
                          step="0.01"
                          value={
                            edit.costOverrideCents === null ? "" : edit.costOverrideCents / 100
                          }
                          onChange={(e) => editVariant(index, "costOverrideCents", e.target.value)}
                        />
                      </label>
                      <label>
                        Fixed retail override ($)
                        <input
                          className={inputClass}
                          aria-label={`Fixed retail override ${v.label}`}
                          type="number"
                          min="0.01"
                          max="2500"
                          step="0.01"
                          value={
                            edit.priceOverrideCents === null ? "" : edit.priceOverrideCents / 100
                          }
                          onChange={(e) => editVariant(index, "priceOverrideCents", e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="mt-3 font-semibold">
                      Retail: {price ? formatMoney(price) : "Enter valid pricing"}
                    </p>
                    {metrics && (
                      <p className="text-sm">
                        Markup {metrics.markup.toFixed(1)}% · Gross margin{" "}
                        {metrics.margin.toFixed(1)}% · Before-expense contribution{" "}
                        {formatMoney(metrics.contribution)}
                      </p>
                    )}
                    <label className="mt-3 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={edit.sellEnabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            variants: form.variants.map((v, i) =>
                              i === index ? { ...v, sellEnabled: e.target.checked } : v,
                            ),
                          })
                        }
                      />
                      Offer this variant
                    </label>
                  </fieldset>
                );
              })}
            </div>
            <fieldset className="grid gap-3 rounded-xl border border-line p-4">
              <legend className="px-1 font-semibold">Collections & filters for {p.title}</legend>
              <p className="text-sm">
                Choose all that apply. A product can appear in several collections and audiences.
              </p>
              {navigation.map((group) => (
                <fieldset key={group.id} className="min-w-0">
                  <legend className="font-semibold">{group.label}</legend>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
                    {group.options.map((option) => (
                      <label key={option.id} className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.collectionIds.includes(option.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              collectionIds: e.target.checked
                                ? [...form.collectionIds, option.id]
                                : form.collectionIds.filter((id) => id !== option.id),
                            })
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </fieldset>
            <div>
              <label htmlFor={`shop-${p.id}-status`}>Shop status</label>
              <select
                id={`shop-${p.id}-status`}
                className={inputClass}
                value={form.shopStatus}
                onChange={(e) => {
                  const shopStatus = e.target.value as typeof form.shopStatus;
                  setForm({
                    ...form,
                    shopStatus,
                    published: shopStatus !== "draft",
                    comingSoon: shopStatus === "coming-soon",
                  });
                }}
              >
                <option value="draft">Draft — hidden from shop</option>
                <option value="coming-soon">Coming soon — visible, orders disabled</option>
                <option value="for-sale">For sale — visible after sale approvals</option>
              </select>
            </div>
            <p className="text-sm">
              Save Coming soon to show the product, approved photo and selected filters in the shop.
              A description is optional for previews. Supplier setup, sizes, prices and sample
              approval can be completed later. Choose Draft to hide it, or For sale when ready for
              the existing sale approvals.
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.sampleApproved}
                onChange={(e) => setForm({ ...form, sampleApproved: e.target.checked })}
              />
              I approved the physical sample and production artwork
            </label>
            <Button type="submit" disabled={busy}>
              Save product
            </Button>
          </form>
        </>
      )}
      <div className="mt-5 border-t border-line pt-4">
        {p.archived ? (
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(() =>
                archiveShopProduct({ data: { id: p.id, revision: p.revision, archived: false } }),
              )
            }
          >
            Restore as draft
          </Button>
        ) : !remove ? (
          <Button variant="outlineDark" onClick={() => setRemove(true)}>
            Remove product from shop
          </Button>
        ) : (
          <div>
            <p className="mb-3 text-sm">
              Archive {p.title}? It will disappear from sale. Past orders remain, and you can
              restore it as a draft.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    archiveShopProduct({
                      data: { id: p.id, revision: p.revision, archived: true },
                    }),
                  )
                }
              >
                Confirm archive
              </Button>
              <Button variant="outlineDark" onClick={() => setRemove(false)}>
                Keep product
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
function PhotoStudio({ product: p, busy, run }: { product: Product; busy: boolean; run: Run }) {
  const [file, setFile] = useState<File>(),
    [remove, setRemove] = useState(true),
    [zoom, setZoom] = useState(100),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [preparing, setPreparing] = useState(false),
    [alt, setAlt] = useState(p.title),
    [variants, setVariants] = useState<number[]>([]);
  useEffect(() => {
    if (!file) return;
    let current = true;
    setPreparing(true);
    setError("");
    setPreview("");
    void prepareProductPhoto(file, remove, zoom)
      .then((v) => {
        if (current) setPreview(v);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setPreparing(false);
      });
    return () => {
      current = false;
    };
  }, [file, remove, zoom]);
  return (
    <details className="rounded-xl bg-paper-2 p-4" open={!p.gallery.length}>
      <summary className="cursor-pointer text-lg font-semibold">
        Product photo studio & gallery
      </summary>
      <p className="my-3 text-sm">
        Every prepared image uses the same light background, square frame and centered scale. Upload
        a transparent cutout or flat-background product photo. Review garment edges and logo colors
        before saving. Complex scenes need a prepared cutout.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {p.gallery.map((image, index) => (
          <div key={image.id} className="min-w-0">
            <img
              src={image.url}
              alt={image.alt}
              width="250"
              height="250"
              className="aspect-square w-full rounded-lg object-contain"
            />
            <p className="my-2 text-xs">
              {index === 0 ? "Cover photo" : "Gallery photo"} ·{" "}
              {image.variantIds.length ? "Selected variants" : "All variants"}
            </p>
            <div className="flex flex-wrap gap-1">
              {index > 0 && (
                <Button
                  variant="outlineDark"
                  className="text-xs"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      saveShopGallery({
                        data: {
                          id: p.id,
                          revision: p.revision,
                          imageIds: [
                            image.id,
                            ...p.gallery.filter((i) => i.id !== image.id).map((i) => i.id),
                          ],
                        },
                      }),
                    )
                  }
                >
                  Make cover
                </Button>
              )}
              <Button
                variant="outlineDark"
                className="text-xs"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    saveShopGallery({
                      data: {
                        id: p.id,
                        revision: p.revision,
                        imageIds: p.gallery.filter((i) => i.id !== image.id).map((i) => i.id),
                      },
                    }),
                  )
                }
              >
                Remove photo {index + 1}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            uploadShopPhoto({
              data: { id: p.id, revision: p.revision, data: preview, alt, variantIds: variants },
            }),
          );
        }}
      >
        <label>
          Upload product photo
          <input
            className={inputClass}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        {file && (
          <>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
              />
              Remove a flat background
            </label>
            <label>
              Product scale
              <input
                type="range"
                className="mt-2 w-full"
                min="65"
                max="100"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            {preparing && <p role="status">Preparing photo…</p>}
            {error && <p role="alert">{error}</p>}
            {preview && (
              <img
                src={preview}
                alt="Prepared product photo preview"
                width="1000"
                height="1000"
                className="aspect-square w-full max-w-sm rounded-xl border border-line"
              />
            )}
            <label>
              Photo description
              <input
                className={inputClass}
                required
                maxLength={200}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
            {p.variants.length > 0 && (
              <label>
                Photo variants (leave empty for all)
                <select
                  multiple
                  className={inputClass}
                  value={variants.map(String)}
                  onChange={(e) =>
                    setVariants([...e.target.selectedOptions].map((o) => Number(o.value)))
                  }
                >
                  {p.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit" disabled={busy || preparing || !preview}>
              Use prepared photo
            </Button>
          </>
        )}
      </form>
    </details>
  );
}

function SupplierCatalog({ busy }: { busy: boolean }) {
  const [query, setQuery] = useState("Richardson"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchFulfillEngineCatalog>>>();
  return (
    <details className="my-4 rounded-xl border border-line p-4">
      <summary className="cursor-pointer text-lg font-semibold">
        Find premium supplier products
      </summary>
      <p className="my-3 text-sm">
        Search the catalog available to our connected account. Results are blank styles, not
        approved decorated merchandise. Choose the exact style and prepare its design in Fulfill
        Engine before importing a campaign product.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError("");
          setResult(undefined);
          try {
            setResult(await searchFulfillEngineCatalog({ data: { query } }));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Catalog unavailable.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="min-w-0 flex-1">
          Brand or style
          <input
            className={inputClass}
            value={query}
            minLength={2}
            maxLength={100}
            required
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button disabled={busy || loading} type="submit">
          {loading ? "Searching…" : "Search supplier catalog"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="my-3">
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status" className="my-3">
            {result.total} matches. Showing up to 50; narrow the search for more specific results.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.products.map((p) => (
              <li key={p.id} className="min-w-0 break-words rounded-lg bg-paper-2 p-3">
                <strong>
                  {p.brand} {p.name}
                </strong>
                <p className="text-sm">Style ID: {p.id}</p>
                <p className="text-sm">
                  Decoration: {p.methods.join(", ") || "Confirm with supplier"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
