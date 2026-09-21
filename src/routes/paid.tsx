import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SquareCard } from "@/components/commerce/square-card";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getOrderStatus, submitSquarePayment } from "@/lib/commerce/api";
import { formatMoney } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/paid")({
  head: () =>
    pageHead(
      "/paid",
      "Payment Status",
      "Check the verified status of your Oklahoma Prospects payment.",
      true,
    ),
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search.order_id === "string" ? search.order_id : "",
  }),
  component: Paid,
});
function Paid() {
  const user = useCurrentUser();
  const [payment, setPayment] = useState<Awaited<ReturnType<typeof getOrderStatus>> | null>(null);
  const { order_id } = Route.useSearch();
  const [setup, setSetup] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!order_id) {
      setError("No payment reference was supplied. Open billing history to see your purchases.");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const result = await getOrderStatus({ data: { orderId: order_id } });
        if (!active) return;
        setPayment(result);
        setSetup(result.subscription_setup_status);
        setStatus(result.status);
        setAmount(result.total_cents);
        if (["pending", "pending_fee"].includes(result.status))
          timer = setTimeout(() => {
            void check();
          }, 3000);
      } catch {
        if (active)
          setError(
            "Payment confirmation could not load. Your card has not been charged again. Check billing history.",
          );
      }
    };
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [order_id]);
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-4xl">
        {status === "pending_fee"
          ? "Complete your first-month fee"
          : status === "paid"
            ? "Payment confirmed"
            : status === "payment_review"
              ? "We’re reviewing your booking"
              : status === "failed"
                ? "Payment wasn’t completed"
                : status === "refunded"
                  ? "Payment refunded"
                  : "Checking your payment"}
      </h1>
      <p className="my-5" role="status">
        {status === "pending_fee"
          ? "Your membership payment was received. The separate first-month fee shown in your order is still due. No booking is confirmed until both payments succeed."
          : status === "paid"
            ? `${formatMoney(amount)} received. Your saved booking and receipt are in your account. An assessment stays incomplete until your coach completes it.`
            : status === "payment_review"
              ? "Payment was received, but the selected time could not be booked. A refund is being processed. This booking is not confirmed."
              : "This page waits for verified payment confirmation. Returning here does not mark an order paid."}
      </p>
      {payment?.feeDue && payment.square && user ? (
        <SquareCard
          config={payment.square}
          amountCents={payment.feeDue}
          expiresAt={payment.holdUntil}
          name={user.displayName || ""}
          email={user.primaryEmail || ""}
          onToken={async (sourceId, attemptId) => {
            const result = await submitSquarePayment({
              data: { orderId: order_id, sourceId, attemptId },
            });
            if (result.url) window.location.reload();
            return result;
          }}
        />
      ) : null}
      {setup === "pending" ? (
        <p role="status">
          Your first payment succeeded. Recurring billing setup is still being confirmed; the office
          can see this on your account. Do not pay again.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      ) : null}
      {status === "paid" && payment?.receipt_url ? (
        <section className="my-5 rounded-xl border p-4" aria-label="Payment receipt">
          <a className="inline-flex min-h-11 items-center underline" href={payment.receipt_url} target="_blank" rel="noopener noreferrer">View your Square receipt</a>
          {payment.bookingConfirmed ? <p className="mt-3">Questions about your paid booking? <a className="inline-flex min-h-11 items-center underline" href={`tel:${CLUB.phoneTel}`}>Call {CLUB.phoneDisplay}</a>.</p> : null}
        </section>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/family">Open billing history</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/login" search={{ next: "/family" }}>
            Create or sign into your account
          </Link>
        </Button>
      </div>
      <p className="mt-5">
        Payment is required before any booking is confirmed. Your completed assessment remains a
        separate coach-recorded requirement.
      </p>
    </main>
  );
}
