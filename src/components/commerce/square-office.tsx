import { useEffect, useRef, useState } from "react";
import {
  getSquareOffice,
  testSiteActivityAlerts,
  sendOwnerBookingAlerts,
  prepareSquareMonthlyPlans,
  prepareSquareMembershipWebhooks,
  reconcilePayments,
  ownerRefund,
  approveMembershipPause,
  checkSquareLocation,
  checkSquareWebhooks,
  saveCageWindow,
  checkReceiptEmail,
} from "@/lib/commerce/square-office-api";
import { formatMoney } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
export function SquareOffice() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getSquareOffice>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [planResults, setPlanResults] = useState<
    Awaited<ReturnType<typeof prepareSquareMonthlyPlans>>
  >([]);
  const [emailCheckId, setEmailCheckId] = useState<string>();
  const refundKey = useRef(crypto.randomUUID());
  async function load() {
    setData(await getSquareOffice());
  }
  useEffect(() => {
    void load().catch(() => setError("Payment console requires owner access."));
  }, []);
  async function action(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment operation could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }
  const checkedAt = data ? new Date(data.recovery.checkedAt).getTime() : Date.now();
  const age = (value: Date | string | null) => {
    if (!value) return "None";
    const minutes = Math.max(0, Math.floor((checkedAt - new Date(value).getTime()) / 60000));
    return minutes < 60
      ? `${minutes} min`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hr`
        : `${Math.floor(minutes / 1440)} days`;
  };
  return (
    <section className="my-8 grid gap-4" aria-label="Square payment administration">
      <h2 className="text-3xl">Square payments</h2>
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {data ? (
        <>
          <p>
            {data.config
              ? `Connected configuration: ${data.config.environment}. Verify the location and complete Sandbox acceptance before enabling live payments.`
              : "Square is not configured. Checkout remains closed; no unpaid booking can be confirmed."}
          </p>
          <p>
            Owner activity emails cover saved site changes. Cage-booking emails also go to the
            designated facility staff. Other activity is checked every minute.
          </p>
          <Button
            disabled={busy}
            variant="outlineDark"
            onClick={() =>
              void action(async () => {
                const rows = await testSiteActivityAlerts();
                if (!rows.length || rows.some((r) => r.status !== "sent"))
                  throw new Error(
                    "Some alert test emails remain pending. The scheduled sender will retry.",
                  );
              }, "Alert test emails accepted for the owners and cage staff.")
            }
          >
            Test staff and owner alerts
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !data.config}
              variant="outlineDark"
              onClick={() =>
                void action(async () => {
                  const result = await sendOwnerBookingAlerts();
                  if (!result.accepted)
                    throw new Error(
                      "No new owner alerts were accepted. Check the notification queue below for pending or review items.",
                    );
                }, "Owner booking alerts accepted by the email provider. Check your inbox.")
              }
            >
              Send pending owner alerts
            </Button>
            <Button
              disabled={busy || !data.config}
              onClick={() =>
                void action(
                  () => reconcilePayments(),
                  "Pending payment work was retried. Review remaining items below.",
                )
              }
            >
              Retry pending payments
            </Button>
            <Button
              variant="outlineDark"
              disabled={busy || !data.config}
              onClick={() =>
                void action(async () => {
                  const checks = await checkSquareLocation();
                  if (
                    !checks.active ||
                    !checks.usd ||
                    !checks.chicago ||
                    !checks.merchantMatches ||
                    !checks.cards
                  )
                    throw new Error(
                      "Square location settings do not meet the payment requirements.",
                    );
                }, "Square location is active, USD, America/Chicago, and enabled for cards.")
              }
            >
              Verify Square location
            </Button>
            <Button
              variant="outlineDark"
              disabled={busy || !data.config}
              onClick={() =>
                void action(async () => {
                  const checks = await checkSquareWebhooks();
                  if (checks.pendingEvents)
                    throw new Error(
                      `Square webhook settings match, but ${checks.pendingEvents} delivered event(s) still need processing. Review Needs attention below.`,
                    );
                  if (!checks.processedEvents)
                    throw new Error(
                      "Square webhook settings match, but no delivered event has been processed yet.",
                    );
                }, "Square webhook settings match and delivered events have been processed.")
              }
            >
              Verify Square webhooks
            </Button>
          </div>
          <Button
            variant="outlineDark"
            disabled={busy || !data.config}
            onClick={() =>
              void action(async () => {
                const result = await checkReceiptEmail({ data: { messageId: emailCheckId } });
                setEmailCheckId(result.id);
                if (result.status !== "delivered")
                  throw new Error(
                    `Receipt test email: ${result.status}. Check delivery again shortly.`,
                  );
              }, "Receipt test email delivered to your account address.")
            }
          >
            {emailCheckId ? "Check test email delivery" : "Send receipt test to my email"}
          </Button>
          <details>
            <summary className="min-h-11 cursor-pointer">Configure cage booking windows</summary>
            <p>
              All-Star receives a 14-day booking window. Set the ordinary window before offering
              that priority benefit.
            </p>
            <form
              className="flex flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const days = Number(new FormData(e.currentTarget).get("days"));
                void action(
                  () => saveCageWindow({ data: { standardDays: days } }),
                  "Cage booking windows saved and enforced on the server.",
                );
              }}
            >
              <label>
                Standard days ahead{" "}
                <input
                  type="number"
                  name="days"
                  min={1}
                  max={13}
                  required
                  className="w-16 rounded border p-2"
                />
              </label>
              <Button type="submit" disabled={busy}>
                Save booking policy
              </Button>
            </form>
          </details>
          {data.config ? (
            <section className="grid gap-3 rounded-lg border p-4" aria-label="Monthly plan setup">
              <h3 className="text-xl">Set up monthly payments</h3>
              <p>
                Create and verify the Square {data.config.environment} plans for the current site
                prices. This creates no customer charges and does not open live enrollment.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const results = await prepareSquareMonthlyPlans();
                    setPlanResults(results);
                    if (results.some((p) => !p.ready))
                      throw new Error(
                        "Some monthly plans still need setup. Review the results below and retry.",
                      );
                  }, `All eight monthly plans are connected in ${data.config?.environment}. Checkout availability is unchanged.`)
                }
              >
                Prepare {data.config.environment} monthly plans
              </Button>
              {planResults.map((p) => (
                <p key={p.id}>
                  {p.name} · {formatMoney(p.cents)}/month · {p.ready ? "Connected" : p.error}
                </p>
              ))}
              <Button
                disabled={busy}
                variant="outlineDark"
                onClick={() =>
                  void action(
                    () => prepareSquareMembershipWebhooks(),
                    "Payment and membership event delivery is configured. Review pending events before launch.",
                  )
                }
              >
                Connect {data.config.environment} membership events
              </Button>
            </section>
          ) : null}
          <h3 className="text-xl">Payments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Paid</th>
                  <th>Refunded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-52 break-all p-2">{p.id}</td>
                    <td>{formatMoney(p.amount_cents)}</td>
                    <td>{formatMoney(p.refunded_cents)}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer">Issue an owner-approved refund</summary>
            <form
              className="grid gap-3 rounded-lg border p-4"
              onChange={() => {
                refundKey.current = crypto.randomUUID();
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(
                  () =>
                    ownerRefund({
                      data: {
                        paymentId: String(f.get("paymentId")),
                        amountCents: Math.round(Number(f.get("amount")) * 100),
                        reason: String(f.get("reason")),
                        requestId: refundKey.current,
                        withdrawUnused: f.get("withdraw") === "on",
                      },
                    }),
                  "Refund submitted to Square. Review its confirmed status below.",
                );
              }}
            >
              <label>
                Payment
                <select className="w-full rounded border p-3" name="paymentId" required>
                  {data.payments
                    .filter((p) => p.refunded_cents < p.amount_cents)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} · {formatMoney(p.amount_cents - p.refunded_cents)} remaining
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Approved refund in dollars
                <input
                  className="w-full rounded border p-3"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                />
              </label>
              <label>
                Reason
                <textarea
                  className="w-full rounded border p-3"
                  name="reason"
                  minLength={5}
                  maxLength={192}
                  required
                />
              </label>
              <label className="flex gap-3">
                <input type="checkbox" name="withdraw" />
                Withdraw all unused credits and cancel future bookings covered by this payment.
                Completed sessions remain in the audit history.
              </label>
              <Button type="submit" disabled={busy || !data.config}>
                Issue refund
              </Button>
            </form>
          </details>
          <h3 className="text-xl">Refunds</h3>
          {data.refunds.map((r) => (
            <p key={r.id}>
              {formatMoney(r.amount_cents)} · {r.status} · {r.reason}
            </p>
          ))}
          <h3 className="text-xl">Membership billing</h3>
          {data.subscriptions.map((s) => (
            <article className="rounded border p-3" key={s.id}>
              <p>
                {s.product_id} · {s.status}
                {s.scheduled_action
                  ? ` · ${s.scheduled_action} ${s.action_effective_date || ""}`
                  : ""}
              </p>
              <form
                className="mt-2 flex flex-wrap gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const cycles = Number(new FormData(e.currentTarget).get("cycles"));
                  void action(
                    () => approveMembershipPause({ data: { id: s.id, cycles } }),
                    "Approved pause scheduled in Square. Existing credit expiration dates remain unchanged.",
                  );
                }}
              >
                <label>
                  Approved pause cycles{" "}
                  <input
                    type="number"
                    name="cycles"
                    min={1}
                    max={12}
                    defaultValue={1}
                    required
                    className="w-16 rounded border p-2"
                  />
                </label>
                <Button type="submit" disabled={busy || !data.config} variant="outlineDark">
                  Approve pause
                </Button>
              </form>
            </article>
          ))}
          <section
            className="grid gap-3 rounded-lg border p-4"
            aria-label="Recovery and email health"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl">Recovery and email health</h3>
              <Button
                variant="outlineDark"
                disabled={busy}
                onClick={() => void action(load, "Recovery status refreshed.")}
              >
                Refresh status
              </Button>
            </div>
            <p>
              Payments are checked every 10 minutes; email queues every minute. Completion means the
              worker finished, not that every payment is settled or every email reached an inbox.
            </p>
            {[
              { name: "payments", label: "Payment recovery", staleMinutes: 25 },
              { name: "notifications", label: "Email delivery", staleMinutes: 5 },
            ].map((expected) => {
              const job = data.recovery.jobs.find((j) => j.name === expected.name);
              const stale =
                !job ||
                checkedAt - new Date(job.started_at).getTime() > expected.staleMinutes * 60000 ||
                (job.status === "running" &&
                  checkedAt - new Date(job.started_at).getTime() > 120000);
              return (
                <p
                  key={expected.name}
                  className={
                    stale || job?.status === "failed" || job?.status === "attention"
                      ? "font-semibold text-maroon"
                      : ""
                  }
                >
                  {expected.label}:{" "}
                  {stale
                    ? "check needed — no recent completed check"
                    : job?.status === "completed"
                      ? "last run completed"
                      : job?.status === "attention"
                        ? "items still need attention"
                        : job?.status}{" "}
                  · started {age(job?.started_at || null)} ago · last clean completion{" "}
                  {age(job?.last_success_at || null)} ago
                </p>
              );
            })}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Queue</th>
                    <th>Pending</th>
                    <th>Review</th>
                    <th>Oldest</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recovery.queues.map((q) => (
                    <tr key={q.kind}>
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {q.kind}
                      </th>
                      <td>{q.pending}</td>
                      <td className={q.review ? "font-semibold text-maroon" : ""}>{q.review}</td>
                      <td>{age(q.oldest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              Payment attempts older than a day need a Square record check before another charge.
              Email marked review needs a delivery-history check before resending, to avoid
              duplicates.
            </p>
            {data.recovery.attempts.map((a) => (
              <p className="break-all text-sm" key={a.id}>
                Unresolved payment attempt · order {a.order_id} · {a.status} · {age(a.created_at)}{" "}
                old
              </p>
            ))}
          </section>
          <h3 className="text-xl">Needs attention</h3>
          {data.pending.map((p) => (
            <p key={p.id}>
              Order {p.id}: {p.status} / recurring setup {p.subscription_setup_status || "none"}
            </p>
          ))}
          {data.events.map((e) => (
            <p key={e.id}>
              {e.type}: {e.status}, {e.attempts} attempts
            </p>
          ))}
          {data.notifications.map((n) => (
            <p key={n.id}>
              Email {n.kind}: {n.status} · reference {n.id}
            </p>
          ))}
          <h3 className="text-xl">Disputes</h3>
          {data.disputes.map((d) => (
            <p key={d.id}>
              {d.payment_id} · {formatMoney(d.amount_cents)} · {d.state} · due{" "}
              {d.due_at ? new Date(d.due_at).toLocaleDateString() : "see Square"}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}
