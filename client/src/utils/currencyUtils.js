/**
 * Currency utility functions — centralized formatting so we never hardcode $ again
 */

const CURRENCY_SYMBOLS = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$',
  CAD: 'C$', CHF: 'CHF', SGD: 'S$', AED: 'د.إ', SAR: '﷼',
};

export const BASE_CURRENCY = 'INR';
export const BASE_SYMBOL = '₹';

/**
 * Get the symbol for a given currency code
 */
export function getCurrencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code;
}

/**
 * Format an amount with the correct currency symbol (Indian number system for INR)
 */
export function formatCurrency(amount, currency = BASE_CURRENCY) {
  if (amount == null || isNaN(amount)) return '—';
  const symbol = getCurrencySymbol(currency);
  
  if (currency === 'INR') {
    // Indian number system: 1,00,000 instead of 100,000
    return `${symbol}${Number(amount).toLocaleString('en-IN')}`;
  }
  return `${symbol}${Number(amount).toLocaleString('en-US')}`;
}

/**
 * Format base currency amount (shorthand for the most common case)
 */
export function formatBase(amount) {
  return formatCurrency(amount, BASE_CURRENCY);
}

/**
 * Format with both original and converted amounts
 * e.g. "USD 75.00 → ₹6,285"
 */
export function formatConversion(originalAmount, originalCurrency, convertedAmount) {
  if (!originalAmount) return '—';
  if (originalCurrency === BASE_CURRENCY || !convertedAmount) {
    return formatCurrency(originalAmount, originalCurrency);
  }
  return `${getCurrencySymbol(originalCurrency)}${Number(originalAmount).toLocaleString()} → ${formatBase(convertedAmount)}`;
}
