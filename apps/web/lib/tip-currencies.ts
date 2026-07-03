/** Stripe-supported currencies commonly used for tips (ISO 4217). */
export const TIP_CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'NZD', label: 'New Zealand Dollar (NZD)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SEK', label: 'Swedish Krona (SEK)' },
  { code: 'NOK', label: 'Norwegian Krone (NOK)' },
  { code: 'DKK', label: 'Danish Krone (DKK)' },
  { code: 'PLN', label: 'Polish Złoty (PLN)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'MXN', label: 'Mexican Peso (MXN)' },
  { code: 'BRL', label: 'Brazilian Real (BRL)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'HKD', label: 'Hong Kong Dollar (HKD)' },
] as const;

export type TipCurrencyCode = (typeof TIP_CURRENCIES)[number]['code'];

export const TIP_CURRENCY_CODES = TIP_CURRENCIES.map((c) => c.code);

export function isTipCurrency(code: string): code is TipCurrencyCode {
  return (TIP_CURRENCY_CODES as readonly string[]).includes(code.toUpperCase());
}
