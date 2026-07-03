/** Stripe-supported currencies commonly used for tips (ISO 4217). */
export const TIP_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'JPY', 'MXN', 'BRL', 'SGD', 'HKD',
] as const;

export type TipCurrencyCode = (typeof TIP_CURRENCY_CODES)[number];

export function normalizeTipCurrency(raw: unknown, fallback: TipCurrencyCode = 'USD'): TipCurrencyCode {
  const code = String(raw ?? fallback).toUpperCase().slice(0, 3);
  return (TIP_CURRENCY_CODES as readonly string[]).includes(code) ? (code as TipCurrencyCode) : fallback;
}
