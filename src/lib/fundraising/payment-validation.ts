import { AppError } from "./errors";
export function validatePayment(p: any, row: any, location: string) {
  if (
    p.order_id !== row.order_id ||
    p.location_id !== location ||
    p.amount_money?.currency !== "USD" ||
    Number(p.amount_money?.amount) !== row.amount ||
    !p.id
  )
    throw new AppError("Payment does not match this sponsorship.", 409);
  const refunded = Number(p.refunded_money?.amount || 0);
  if (
    !Number.isSafeInteger(refunded) ||
    refunded < 0 ||
    refunded > row.amount ||
    (p.refunded_money && p.refunded_money.currency !== "USD")
  )
    throw new AppError("Refund does not match this sponsorship.", 409);
  return {
    status:
      p.status === "COMPLETED"
        ? "completed"
        : p.status === "FAILED" || p.status === "CANCELED"
          ? "failed"
          : "pending",
    refunded,
  };
}
