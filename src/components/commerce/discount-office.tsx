import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDiscountCodes, saveDiscountCode } from "@/lib/commerce/discounts-api";
import {
  discountStatus,
  discountPurchaseTypes,
  discountPurchaseLabels,
  type Discount,
  type DiscountInput,
} from "@/lib/commerce/discounts";
import { formatMoney } from "@/lib/pricing";

type Form = {
  id?: string;
  version?: number;
  code: string;
  kind: DiscountInput["kind"];
  value: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  purchaseTypes: DiscountInput["purchaseTypes"];
};
const empty: Form = {
  code: "",
  kind: "percentage",
  value: "",
  startsOn: "",
  endsOn: "",
  active: false,
  purchaseTypes: ["cage"],
};
const edit = (d: Discount): Form => ({
  id: d.id,
  version: d.version,
  code: d.code,
  kind: d.kind,
  value: String(d.value / 100),
  startsOn: d.starts_on || "",
  endsOn: d.ends_on || "",
  active: d.active,
  purchaseTypes: d.purchase_types,
});

export function DiscountOffice() {
  const [codes, setCodes] = useState<Discount[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setCodes(await getDiscountCodes());
    setReady(true);
  }
  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Discount codes could not load."),
    );
  }, []);
  async function save(value: Form) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveDiscountCode({
        data: {
          ...value,
          value: Math.round(Number(value.value) * 100),
          startsOn: value.startsOn || null,
          endsOn: value.endsOn || null,
        },
      });
      await load();
      setForm(empty);
      setNotice(`${saved.code} saved · ${discountStatus(saved)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the discount code.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="discount-codes"
      className="my-8 grid gap-4"
      aria-label="Discount code administration"
    >
      <h2 className="text-3xl">Discount codes</h2>
      <p className="text-sm">
        Choose eligible purchase types for each code. One code per one-time purchase. Monthly
        memberships and renewal charges are excluded. A discounted order must still have an amount
        to pay. Existing paid bookings keep their original price.
      </p>
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!ready && !error ? <p role="status">Loading discount codes…</p> : null}
      {ready ? (
        <>
          <form
            className="grid gap-4 rounded-xl border border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(form);
            }}
          >
            <h3 className="text-xl">{form.id ? `Edit ${form.code}` : "Create discount code"}</h3>
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                Code
                <input
                  className="min-h-11 rounded-lg border p-3"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_-]+"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="grid gap-1">
                Discount type
                <select
                  className="min-h-11 rounded-lg border p-3"
                  value={form.kind}
                  onChange={(e) =>
                    setForm({ ...form, kind: e.target.value as Form["kind"], value: "" })
                  }
                >
                  <option value="percentage">Percentage off</option>
                  <option value="fixed">Dollar amount off</option>
                </select>
              </label>
              <label className="grid gap-1">
                {form.kind === "percentage" ? "Percent off" : "Amount off ($)"}
                <input
                  className="min-h-11 rounded-lg border p-3"
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max={form.kind === "percentage" ? "99.99" : "10000"}
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Activated
              </label>
              <label className="grid gap-1">
                Starts on (optional)
                <input
                  className="min-h-11 rounded-lg border p-3"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                Valid through (optional)
                <input
                  className="min-h-11 rounded-lg border p-3"
                  type="date"
                  min={form.startsOn || undefined}
                  value={form.endsOn}
                  onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                />
              </label>
            </fieldset>
            <fieldset disabled={busy} className="grid gap-2 rounded-lg border border-line p-3">
              <legend className="px-1 font-semibold">Eligible purchases</legend>
              {discountPurchaseTypes.map((type) => (
                <label key={type} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={form.purchaseTypes.includes(type)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        purchaseTypes: event.target.checked
                          ? [...form.purchaseTypes, type]
                          : form.purchaseTypes.filter((value) => value !== type),
                      })
                    }
                  />
                  {discountPurchaseLabels[type]}
                </label>
              ))}
              <p className="text-sm">
                Select at least one. Assessments have their own option. Product availability and
                assessment requirements still apply.
              </p>
            </fieldset>
            <p className="text-sm">
              Dates use America/Chicago (Central time). The end date is included. Leave dates blank
              to control availability with the activation switch. Edits and deactivation apply
              before a new payment starts; payments already processing retain their agreed total.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || form.purchaseTypes.length === 0}>
                {busy ? "Saving…" : form.id ? "Save changes" : "Create code"}
              </Button>
              {form.id ? (
                <Button
                  type="button"
                  variant="outlineDark"
                  disabled={busy}
                  onClick={() => setForm(empty)}
                >
                  Cancel editing
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={() => {
                  setError("");
                  void load().catch((e) => setError(e.message));
                }}
              >
                Refresh codes
              </Button>
            </div>
          </form>
          {!codes.length ? (
            <p>No discount codes yet.</p>
          ) : (
            <ul className="grid gap-3">
              {codes.map((code) => (
                <li
                  key={code.id}
                  className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <h3 className="break-all text-xl">{code.code}</h3>
                    <p>
                      {code.kind === "percentage"
                        ? `${code.value / 100}% off`
                        : `${formatMoney(code.value)} off`}{" "}
                      · {discountStatus(code)}
                    </p>
                    <p className="text-sm">
                      Applies to:{" "}
                      {code.purchase_types.map((type) => discountPurchaseLabels[type]).join(", ")}
                    </p>
                    <p className="text-sm">
                      {code.starts_on || "No start date"} → {code.ends_on || "No expiration"} ·
                      Central time
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outlineDark"
                      disabled={busy}
                      aria-label={`Edit ${code.code}`}
                      onClick={() => {
                        setForm(edit(code));
                        setError("");
                        setNotice("");
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outlineDark"
                      disabled={busy}
                      aria-label={`${code.active ? "Deactivate" : "Activate"} ${code.code}`}
                      onClick={() => void save({ ...edit(code), active: !code.active })}
                    >
                      {code.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
