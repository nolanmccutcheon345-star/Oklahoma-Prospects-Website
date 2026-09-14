/**
 * Browser copy of netlify/functions/_shared/payment-fees.mjs. The two files are kept in step by
 * test/payment-fees.test.mjs, which runs the same amounts through both and fails if they disagree.
 *
 * Square / Card adds nothing here: Square applies the facility's configured 3% surcharge itself, at
 * checkout, and only to eligible credit-card payments. Debit cards are not surcharged.
 * Cash App Business deducts 2.6% + $0.15, so a Cash App payment is grossed up to leave the facility
 * the full base price. Venmo and membership credit are fee-free.
 */
(function (global) {
  'use strict'

  const PAYMENT_METHODS = ['Venmo', 'Cash App', 'Square']
  const SQUARE_METHOD_LABEL = 'Square / Card'
  const SQUARE_CREDIT_SURCHARGE_PERCENT = 3
  const CASH_APP_PERCENT = 2.6
  const CASH_APP_FIXED_CENTS = 15
  const CASH_APP_NET_NUMERATOR = 974
  const CASH_APP_NET_DENOMINATOR = 1000

  const SQUARE_CHECKOUT_NOTE = 'Square automatically applies the facility’s configured 3% surcharge to eligible credit-card payments at checkout. Debit cards are not surcharged, and nothing extra is added here.'
  const CASH_APP_FEE_NOTE = 'Cash App Business deducts 2.6% + $0.15 from each payment, so this total covers the fee and leaves Prospects the full booking price.'
  const NO_FEE_NOTE = 'No fee is added to this payment method.'

  function centsFromAmount(amount) {
    const value = Number(amount)
    return Number.isFinite(value) ? Math.round(value * 100) : 0
  }

  function wholeCents(value) {
    return Math.max(0, Math.round(Number(value) || 0))
  }

  /** roundUpToCent((base + 0.15) / 0.974), in whole cents and exact integer arithmetic. */
  function cashAppTotalCents(basePriceCents) {
    const base = wholeCents(basePriceCents)
    if (base === 0) return 0
    const numerator = (base + CASH_APP_FIXED_CENTS) * CASH_APP_NET_DENOMINATOR
    const whole = Math.floor(numerator / CASH_APP_NET_NUMERATOR)
    return numerator % CASH_APP_NET_NUMERATOR === 0 ? whole : whole + 1
  }

  function paymentTotalCents(basePriceCents, paymentMethod) {
    const basePrice = wholeCents(basePriceCents)
    const totalCents = paymentMethod === 'Cash App' ? cashAppTotalCents(basePrice) : basePrice
    return { basePriceCents: basePrice, feeRecoveryCents: totalCents - basePrice, totalCents }
  }

  function paymentTotal(basePrice, paymentMethod) {
    const split = paymentTotalCents(centsFromAmount(basePrice), paymentMethod)
    return {
      basePrice: split.basePriceCents / 100,
      feeRecovery: split.feeRecoveryCents / 100,
      total: split.totalCents / 100
    }
  }

  function chargedBookingPrice(basePrice, paymentMethod) {
    return paymentTotal(basePrice, paymentMethod).total
  }

  global.ProspectsPaymentFees = {
    PAYMENT_METHODS: PAYMENT_METHODS,
    SQUARE_METHOD_LABEL: SQUARE_METHOD_LABEL,
    SQUARE_CREDIT_SURCHARGE_PERCENT: SQUARE_CREDIT_SURCHARGE_PERCENT,
    CASH_APP_PERCENT: CASH_APP_PERCENT,
    CASH_APP_FIXED_CENTS: CASH_APP_FIXED_CENTS,
    CASH_APP_NET_NUMERATOR: CASH_APP_NET_NUMERATOR,
    CASH_APP_NET_DENOMINATOR: CASH_APP_NET_DENOMINATOR,
    SQUARE_CHECKOUT_NOTE: SQUARE_CHECKOUT_NOTE,
    CASH_APP_FEE_NOTE: CASH_APP_FEE_NOTE,
    NO_FEE_NOTE: NO_FEE_NOTE,
    cashAppTotalCents: cashAppTotalCents,
    paymentTotalCents: paymentTotalCents,
    paymentTotal: paymentTotal,
    chargedBookingPrice: chargedBookingPrice
  }
})(typeof window === 'undefined' ? globalThis : window)
