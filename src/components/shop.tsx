import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, Truck, ShieldCheck, PackageCheck } from "lucide-react";
import { Button } from "./ui/button";
import { SquareCard } from "./commerce/square-card";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatMoney } from "@/lib/pricing";
import {
  getShop,
  canManageShop,
  quoteShop,
  myShopOrders,
  getShopOffice,
  syncShopProduct,
  saveShopProduct,
  refreshShopOrders,
} from "@/lib/shop/api";
import { submitSquarePayment } from "@/lib/commerce/api";
import { cartSchema, type Cart } from "@/lib/shop/contracts";
type Shop = Awaited<ReturnType<typeof getShop>>;
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-base";
const concepts = [
  ["Dugout hoodie", "Navy / Heather gray"],
  ["Training tee", "White / Columbia blue"],
  ["Coach & parent quarter-zip", "Navy"],
  ["Structured cap", "Navy / Columbia blue"],
  ["Canvas tote", "Natural"],
];
export function Shop() {
  const { user } = useCurrentUserState();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const userId = user?.id;
  const canManage = Boolean(userId && ownerId === userId);
  useEffect(() => {
    let current = true;
    void canManageShop()
      .then((v) => {
        if (current) setOwnerId(v && userId ? userId : null);
      })
      .catch(() => {
        if (current) setOwnerId(null);
      });
    return () => {
      current = false;
    };
  }, [userId]);
  const [data, setData] = useState<Shop>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cart, setCart] = useState<Cart>([]);
  const [view, setView] = useState("shop");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [team, setTeam] = useState("");
  const [checkout, setCheckout] = useState<Awaited<ReturnType<typeof quoteShop>>>();
  const [address, setAddress] = useState({
    name: "",
    address1: "",
    address2: "",
    city: "",
    state_code: "OK",
    country_code: "US" as const,
    zip: "",
  });
  const [consent, setConsent] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof myShopOrders>>>([]);
  useEffect(() => {
    setOrders([]);
    setCheckout(undefined);
    setAddress({
      name: "",
      address1: "",
      address2: "",
      city: "",
      state_code: "OK",
      country_code: "US",
      zip: "",
    });
    setConsent(false);
    setRequestId(crypto.randomUUID());
    setView("shop");
  }, [userId]);
  useEffect(() => {
    void getShop()
      .then(setData)
      .catch(() => setError("The shop could not load. Please refresh."));
    try {
      const saved = JSON.parse(localStorage.getItem("prospects-shop-bag") || "[]");
      const parsed = cartSchema.safeParse(saved);
      if (parsed.success) setCart(parsed.data);
    } catch {
      /* Invalid local cart is discarded. */
    }
    setRequestId(crypto.randomUUID());
  }, []);
  function changeCart(next: Cart) {
    setCart(next);
    setCheckout(undefined);
    setRequestId(crypto.randomUUID());
    localStorage.setItem("prospects-shop-bag", JSON.stringify(next));
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function add(productId: string, variantId: number) {
    const found = cart.find((i) => i.productId === productId && i.variantId === variantId);
    const next = found
      ? cart.map((i) => (i === found ? { ...i, quantity: Math.min(20, i.quantity + 1) } : i))
      : [...cart, { productId, variantId, quantity: 1 }];
    if (next.length > 20) {
      setError("Your bag can hold up to 20 different selections.");
      return;
    }
    changeCart(next);
    setMessage("Added to your bag.");
  }
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <main id="main" className="min-w-0">
      <section className="bg-navy px-5 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-200">
            Oklahoma Prospects · Official shop
          </p>
          <h1 className="mt-3 text-5xl sm:text-7xl">Wear the colors.</h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">
            From the dugout to the stands. Gear for our players, families, and coaches.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setView("shop")}>
              Shop collection
            </Button>
            <Button variant="outline" onClick={() => setView("bag")}>
              <ShoppingBag className="mr-2 size-4" />
              Bag ({count})
            </Button>
            {user && (
              <Button
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    setOrders(await myShopOrders());
                    setView("orders");
                  })
                }
              >
                My shop orders
              </Button>
            )}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-maroon p-4 text-maroon">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-5 rounded-lg bg-paper-2 p-4">
            {message}
          </p>
        )}
        {!data ? (
          <p role="status">Loading the collection…</p>
        ) : (
          <>
            {view === "shop" && (
              <>
                {!data.checkout && (
                  <div className="mb-6 rounded-xl border border-line bg-paper-2 p-5">
                    <h2 className="text-2xl">Our first collection is taking shape.</h2>
                    <p className="mt-2">
                      Preview the designs below. Online ordering opens after product samples, final
                      sizes, and delivery details are approved.
                    </p>
                  </div>
                )}
                {data.products.length > 0 && (
                  <>
                    <div className="mb-6 grid gap-3 sm:grid-cols-2">
                      <label>
                        Collection
                        <select
                          className={inputClass}
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="">All collections</option>
                          {[...new Set(data.products.map((p) => p.category))].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Team shop
                        <select
                          className={inputClass}
                          value={team}
                          onChange={(e) => setTeam(e.target.value)}
                        >
                          <option value="">All teams & club gear</option>
                          {[...new Set(data.products.map((p) => p.team_label).filter(Boolean))].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {data.products
                        .filter(
                          (p) =>
                            (!category || p.category === category) &&
                            (!team || p.team_label === team),
                        )
                        .map((p) => (
                          <Product key={p.id} product={p} add={(id) => add(p.id, id)} />
                        ))}
                    </div>
                  </>
                )}
                {!data.products.length && (
                  <>
                    <figure className="overflow-hidden rounded-2xl border border-line">
                      <img
                        src="/images/shop/starting-collection.jpg"
                        alt="Concepts for navy and gray Prospects hoodies, white and blue training shirts, navy quarter-zip, two embroidered caps, and a natural canvas tote"
                        width="1536"
                        height="1024"
                        className="h-auto w-full"
                      />
                      <figcaption className="bg-paper-2 p-4 text-sm">
                        Design preview. Final garments, colors, logo placement, sizes, and pricing
                        will be shown on each approved product.
                      </figcaption>
                    </figure>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {concepts.map(([name, color]) => (
                        <article className="rounded-xl border border-line p-5" key={name}>
                          <h2 className="text-2xl">{name}</h2>
                          <p className="mt-2 text-muted">{color}</p>
                          <p className="mt-3 text-sm">Coming in the first collection</p>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-10 grid gap-5 sm:grid-cols-3">
                  {[
                    [
                      ShoppingBag,
                      "Your size. Your colors.",
                      "Each product will have its own size guide and available colors.",
                    ],
                    [
                      Truck,
                      "Made for you. Shipped home.",
                      "Shipping and sales tax are shown before you pay. Items may ship separately.",
                    ],
                    [
                      PackageCheck,
                      "Follow your order",
                      "Order progress and shipment tracking stay in your Prospects account.",
                    ],
                  ].map(([Icon, title, text]) => {
                    const I = Icon as typeof Truck;
                    return (
                      <div key={String(title)} className="rounded-xl bg-paper-2 p-5">
                        <I className="size-6 text-maroon" />
                        <h2 className="mt-3 text-xl">{String(title)}</h2>
                        <p className="mt-2 text-sm">{String(text)}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {view === "bag" && (
              <section className="mx-auto max-w-2xl">
                <h2 className="text-3xl">Your bag</h2>
                {!cart.length ? (
                  <p className="my-5">Your bag is empty.</p>
                ) : (
                  <>
                    {cart.map((i) => {
                      const p = data.products.find((p) => p.id === i.productId),
                        v = p?.variants.find((v) => v.id === i.variantId);
                      return (
                        <div
                          key={i.productId + ":" + i.variantId}
                          className="my-4 grid min-w-0 gap-3 rounded-xl border border-line p-4"
                        >
                          <p className="font-semibold">
                            {p?.title || "Unavailable product"} ·{" "}
                            {v?.label || "Unavailable selection"}
                          </p>
                          <p>
                            {v
                              ? formatMoney(v.priceCents * i.quantity)
                              : "Refresh your bag before checkout"}
                          </p>
                          <label>
                            Quantity
                            <input
                              className={inputClass}
                              type="number"
                              min="1"
                              max="20"
                              value={i.quantity}
                              onChange={(e) =>
                                changeCart(
                                  cart.map((c) =>
                                    c === i
                                      ? {
                                          ...c,
                                          quantity: Math.max(
                                            1,
                                            Math.min(20, Number(e.target.value) || 1),
                                          ),
                                        }
                                      : c,
                                  ),
                                )
                              }
                            />
                          </label>
                          <Button
                            variant="outlineDark"
                            onClick={() => changeCart(cart.filter((c) => c !== i))}
                          >
                            Remove {p?.title || "item"}
                          </Button>
                        </div>
                      );
                    })}
                    {!data.checkout ? (
                      <p className="rounded-lg bg-paper-2 p-4">
                        Ordering has not opened yet. Your selections can stay in your bag.
                      </p>
                    ) : !user ? (
                      <p>
                        <Link to="/login" search={{ next: "/merchandise" }} className="underline">
                          Sign in or create your Prospects account
                        </Link>{" "}
                        to check out and track delivery.
                      </p>
                    ) : (
                      <>
                        {!checkout ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(async () => {
                                setCheckout(
                                  await quoteShop({
                                    data: { requestId, cart, address, consent: true },
                                  }),
                                );
                              });
                            }}
                          >
                            <h3 className="mt-6 text-2xl">Ship to your door</h3>
                            <p className="my-3 text-sm">
                              U.S. delivery. Check your address and size selections before
                              continuing. Production time is additional to shipping time.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {(
                                [
                                  ["name", "Full name"],
                                  ["address1", "Street address"],
                                  ["address2", "Apartment / suite (optional)"],
                                  ["city", "City"],
                                  ["state_code", "State (two letters)"],
                                  ["zip", "ZIP code"],
                                ] as const
                              ).map(([key, label]) => (
                                <label key={key}>
                                  {label}
                                  <input
                                    className={inputClass}
                                    required={key !== "address2"}
                                    value={address[key]}
                                    maxLength={key === "state_code" ? 2 : 150}
                                    onChange={(e) => {
                                      setAddress({
                                        ...address,
                                        [key]:
                                          key === "state_code"
                                            ? e.target.value.toUpperCase()
                                            : e.target.value,
                                      });
                                      setRequestId(crypto.randomUUID());
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
                            <label className="my-5 flex items-start gap-3">
                              <input
                                type="checkbox"
                                required
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                className="mt-1 size-5 shrink-0"
                              />
                              <span>
                                I checked my sizes and shipping address. These items are made to
                                order; size changes and returns for a change of mind are not
                                offered. Contact Prospects about damage, misprints, or missing
                                packages.
                              </span>
                            </label>
                            <Button type="submit" disabled={busy || !consent}>
                              Calculate shipping & tax
                            </Button>
                          </form>
                        ) : (
                          <div className="mt-6">
                            <h3 className="text-2xl">Review your total</h3>
                            <p className="my-3">
                              {address.name} · {address.address1} · {address.city},{" "}
                              {address.state_code} {address.zip}
                            </p>
                            {checkout.quote.lines.map((l, i) => (
                              <div className="my-2 flex justify-between gap-4" key={i}>
                                <span>{l.label}</span>
                                <span className="shrink-0">{formatMoney(l.cents)}</span>
                              </div>
                            ))}
                            <p className="my-5 text-xl font-bold">
                              Total {formatMoney(checkout.quote.totalCents)}
                            </p>
                            {data.square && (
                              <SquareCard
                                config={data.square}
                                merchandise
                                amountCents={checkout.quote.totalCents}
                                email={user.primaryEmail || ""}
                                name={address.name}
                                expiresAt={checkout.expiresAt}
                                onToken={async (sourceId, attemptId) => {
                                  const r = await submitSquarePayment({
                                    data: { orderId: checkout.orderId, sourceId, attemptId },
                                  });
                                  if (r.url) {
                                    const rows = await myShopOrders();
                                    const saved = rows.find(
                                      (order) => order.id === checkout.orderId,
                                    );
                                    setOrders(rows);
                                    setView("orders");
                                    if (
                                      saved &&
                                      ["paid", "payment_review", "refunded"].includes(saved.status)
                                    )
                                      changeCart([]);
                                    setMessage(
                                      saved?.status === "paid"
                                        ? "Payment confirmed. Check your order status below."
                                        : saved?.status === "payment_review"
                                          ? "Payment needs owner review. Please do not pay again."
                                          : saved?.status === "refunded"
                                            ? "This payment was refunded. Check your order details below."
                                            : "Payment confirmation is pending. Refresh your order status before trying again.",
                                    );
                                  }
                                  return r;
                                }}
                              />
                            )}
                            <Button
                              variant="outlineDark"
                              className="mt-4"
                              onClick={() => {
                                setCheckout(undefined);
                                setRequestId(crypto.randomUUID());
                              }}
                            >
                              Edit address or bag
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </section>
            )}
            {view === "orders" && user && (
              <section>
                <h2 className="text-3xl">My shop orders</h2>
                <Button
                  className="my-4"
                  variant="outlineDark"
                  disabled={busy}
                  onClick={() => void run(async () => setOrders(await myShopOrders()))}
                >
                  Refresh status
                </Button>
                <Orders rows={orders} />
              </section>
            )}
          </>
        )}
        <div className="mt-10 border-t border-line pt-6 text-sm text-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="size-5 shrink-0" />
            Secure checkout stays on this website. We share the delivery information needed to
            produce and ship your order.
          </p>
          <p className="mt-3">
            Questions about sizing, a damaged item, or a delivery?{" "}
            <Link to="/contact" className="underline">
              Contact Oklahoma Prospects
            </Link>
            . Report delivery or quality problems within 30 days. Please use each product’s size
            guide before ordering.
          </p>
          {canManage && (
            <Button
              variant="outlineDark"
              className="mt-5"
              onClick={() => setView(view === "office" ? "shop" : "office")}
            >
              Shop owner controls
            </Button>
          )}
        </div>
        {view === "office" && canManage && <ShopOffice />}
      </div>
    </main>
  );
}
function Product({
  product: p,
  add,
}: {
  product: Shop["products"][number];
  add: (id: number) => void;
}) {
  const [id, setId] = useState("");
  const variant = p.variants.find((v) => String(v.id) === id);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line">
      <img
        src={p.image_url}
        alt={p.title}
        loading="lazy"
        width="600"
        height="600"
        className="aspect-square w-full object-contain bg-paper-2"
      />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs uppercase tracking-widest text-muted">
          {p.team_label || "Club collection"}
        </p>
        <h2 className="mt-2 text-2xl">{p.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">{p.description}</p>
        <p className="mt-4 font-semibold">
          {variant
            ? formatMoney(variant.priceCents)
            : `From ${formatMoney(Math.min(...p.variants.map((v) => v.priceCents)))}`}
        </p>
        <label className="mt-3" htmlFor={"variant-" + p.id}>
          Color / size
        </label>
        <select
          id={"variant-" + p.id}
          className={inputClass}
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Choose your selection</option>
          {p.variants.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.available}>
              {v.label}
              {v.available ? "" : " — unavailable"}
            </option>
          ))}
        </select>
        <details className="my-4 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 underline">Size guide</summary>
          <p className="whitespace-pre-wrap">{p.size_guide}</p>
        </details>
        <Button
          className="mt-auto"
          disabled={!variant?.available}
          onClick={() => variant && add(variant.id)}
        >
          Add to bag
        </Button>
      </div>
    </article>
  );
}
function Orders({ rows }: { rows: Awaited<ReturnType<typeof myShopOrders>> }) {
  return (
    <div className="grid gap-4">
      {!rows.length && <p>No shop orders yet.</p>}
      {rows.map((o) => (
        <article key={o.id} className="min-w-0 rounded-xl border border-line p-5">
          <h3 className="text-xl">Order {o.id.slice(0, 8)}</h3>
          <p>
            {new Date(o.created_at).toLocaleDateString()} · {formatMoney(o.total_cents)}
          </p>
          <p className="mt-2">
            Payment: {o.status.replaceAll("_", " ")} · Fulfillment:{" "}
            {o.fulfillment_status.replaceAll("-", " ")}
          </p>
          {o.snapshot.lines.map((l, i) => (
            <p className="mt-1 text-sm" key={i}>
              {l.label} — {formatMoney(l.cents)}
            </p>
          ))}
          {o.last_error && <p className="mt-3 text-maroon">{o.last_error}</p>}
          {o.shipments.map((s) => (
            <p className="mt-3 break-words" key={s.tracking_number}>
              {s.carrier} · {s.tracking_number}
              {s.tracking_url && (
                <>
                  {" "}
                  ·{" "}
                  <a className="underline" href={s.tracking_url} target="_blank" rel="noreferrer">
                    Track package
                  </a>
                </>
              )}
            </p>
          ))}
          {o.fulfillment_status === "review" && (
            <p className="mt-3">
              Our team needs to review this order. Contact us with your order number.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
function ShopOffice() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getShopOffice>>>();
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await getShopOffice());
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, []);
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-xl border border-line p-5">
      <h2 className="text-3xl">Shop owner controls</h2>
      {message && (
        <p role="status" className="my-4">
          {message}
        </p>
      )}
      {data && (
        <>
          <p className="my-4">
            Readiness:{" "}
            {Object.entries(data.readiness)
              .map(([k, v]) => `${k}: ${v ? "ready" : "pending"}`)
              .join(" · ")}
          </p>
          <p className="text-sm">
            Create and price your products in the Printful API store. Import a product ID here, then
            approve its sample, size guide, and description. Reimporting withdraws it from sale
            until reviewed again.
          </p>
          <form
            className="my-5 grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => syncShopProduct({ data: { id } }));
            }}
          >
            <label>
              Printful sync product ID
              <input
                className={inputClass}
                required
                inputMode="numeric"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <Button className="self-end" disabled={busy}>
              Import product
            </Button>
          </form>
          {data.products.map((p) => (
            <ProductEditor
              key={p.id + ":" + p.revision}
              product={p}
              busy={busy}
              save={(value) => void run(() => saveShopProduct({ data: value }))}
            />
          ))}
          <h3 className="mt-8 text-2xl">Fulfillment queue & orders</h3>
          <p className="my-3 text-sm">
            Confirmed payments enter the fulfillment queue. Cost changes, refunds, cancellations,
            and supplier failures need owner review. Refund customers through the existing Square
            tools; a supplier refund does not refund the customer.
          </p>
          <Button
            disabled={busy}
            variant="outlineDark"
            className="mb-5"
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
function ProductEditor({
  product: p,
  busy,
  save,
}: {
  product: Awaited<ReturnType<typeof getShopOffice>>["products"][number];
  busy: boolean;
  save: (v: Parameters<typeof saveShopProduct>[0]["data"]) => void;
}) {
  const [form, setForm] = useState({
    id: p.id,
    revision: p.revision,
    description: p.description,
    sizeGuide: p.size_guide,
    teamLabel: p.team_label,
    category: p.category,
    taxCode: p.tax_code,
    sampleApproved: p.sample_approved,
    published: p.published,
  });
  return (
    <form
      className="my-5 grid gap-3 rounded-xl bg-paper-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(form);
      }}
    >
      <h3 className="text-xl">{p.title}</h3>
      {(["description", "sizeGuide", "teamLabel", "category", "taxCode"] as const).map((key) => (
        <label key={key}>
          {
            {
              description: "Description",
              sizeGuide: "Size guide",
              teamLabel: "Team collection (optional)",
              category: "Category",
              taxCode: "Stripe Tax product category code",
            }[key]
          }
          <textarea
            className={inputClass}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </label>
      ))}
      <p className="text-sm">
        Retail prices are imported from Printful. Review every size:{" "}
        {p.variants.map((v) => `${v.label} ${formatMoney(v.priceCents)}`).join(" · ")}
      </p>
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={form.sampleApproved}
          onChange={(e) => setForm({ ...form, sampleApproved: e.target.checked })}
        />
        I approved the physical sample and production artwork
      </label>
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => setForm({ ...form, published: e.target.checked })}
        />
        Publish this product
      </label>
      <Button disabled={busy}>Save product</Button>
    </form>
  );
}
