/** Exact token arithmetic and untrusted launch-data normalization. No network or DOM side effects. */
export const UNIT = 10n ** 18n;
export const SUPPLY = 1_000_000_000n * UNIT;

/** @param {string} text */
export function splitBuy(text) {
  const value = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('Use a positive number or zero, with up to 18 decimals.');
  const [whole, fraction = ''] = value.split('.');
  const gross = BigInt(whole) * UNIT + BigInt(fraction.padEnd(18, '0'));
  if (gross > SUPPLY) throw new Error('Enter no more than the fixed supply: 1,000,000,000 SFPT.');
  const tax = gross / 50n;
  return { gross, tax, net: gross - tax };
}

/** @param {bigint} amount */
export function formatToken(amount) {
  const whole = (amount / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (amount % UNIT).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Permit only absolute HTTPS or same-origin relative links, never executable schemes.
 * @param {unknown} value @param {string} origin */
export function safeUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** @param {unknown} value */
export function marketNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** @param {unknown} input @param {string} origin */
export function normalizeCoin(input, origin) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid launch data.');
  const data = /** @type {Record<string, any>} */ (input);
  const market = data.market && typeof data.market === 'object' ? data.market : {};
  const token = typeof data.token === 'string' && /^0x[0-9a-fA-F]{40}$/.test(data.token) && !/^0x0{40}$/.test(data.token) ? data.token : null;
  return {
    token,
    coinUrl: safeUrl(data.coinUrl, origin),
    chartUrl: safeUrl(data.chartUrl, origin),
    logo: safeUrl(data.logo, origin),
    status: typeof data.status === 'string' ? data.status.slice(0, 80) : null,
    market: { priceUsd: marketNumber(market.priceUsd), marketCap: marketNumber(market.marketCap), volume24h: marketNumber(market.volume24h) },
  };
}

/** @param {number} value @param {boolean} price */
export function formatMarket(value, price = false) {
  if (price && value > 0 && value < 0.000001) return `$${value.toExponential(3)}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: price ? 8 : 0, minimumFractionDigits: price ? 2 : 0 }).format(value);
}
