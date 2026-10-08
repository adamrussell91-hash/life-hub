/**
 * Read one product's price from its shop page, for the watch price radar.
 * No HTML parser on the server, so this reads the three places shops publish a
 * machine readable price: JSON-LD Product offers, price meta tags, and Shopify's
 * product JSON. Anything else returns null rather than guessing from page text.
 */
const MAX_BODY_CHARS = 1_500_000;
export const PAGE_TIMEOUT_MS = 7000;
const USER_AGENT = 'Mozilla/5.0 (compatible; LifeHubWatchRadar/1; +https://life-hub.adam-russell.com)';

const CURRENCY = /^[A-Z]{3}$/;
function money(amount, currency, via) {
  const n = typeof amount === 'number' ? amount : Number(String(amount ?? '').replace(/[^0-9.]/g, ''));
  const cur = String(currency ?? '').toUpperCase();
  if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000 || !CURRENCY.test(cur)) return null;
  return { amount: Math.round(n * 100) / 100, currency: cur, via };
}

function offersIn(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) offersIn(n, out); return; }
  if (node['@graph']) offersIn(node['@graph'], out);
  const type = [].concat(node['@type'] ?? []).join(' ');
  if (/Product|ProductGroup/.test(type) && node.offers) {
    for (const o of [].concat(node.offers)) {
      const nested = o?.offers ? [].concat(o.offers) : [o];
      for (const offer of nested) {
        const spec = [].concat(offer?.priceSpecification ?? [])[0];
        const price = offer?.price ?? offer?.lowPrice ?? spec?.price;
        const currency = offer?.priceCurrency ?? spec?.priceCurrency;
        const m = money(price, currency, 'json-ld');
        if (m) out.push(m);
      }
    }
  }
  if (/ProductGroup/.test(type) && node.hasVariant) offersIn(node.hasVariant, out);
}

export function priceFromJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { offersIn(JSON.parse(m[1].trim()), out); } catch { /* malformed block: skip */ }
  }
  return out.sort((a, b) => a.amount - b.amount)[0] ?? null;
}

function metaContent(html, names) {
  for (const name of names) {
    const esc = name.replace(/[:]/g, '\\:');
    const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i').exec(html);
    if (a) return a[1];
    const b = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name|itemprop)\\s*=\\s*["']${esc}["']`, 'i').exec(html);
    if (b) return b[1];
  }
  return null;
}

export function priceFromMeta(html) {
  const amount = metaContent(html, ['product:price:amount', 'og:price:amount', 'price']);
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);
  return amount ? money(amount, currency, 'meta') : null;
}

/** Shopify product JSON prices are in cents; the store's currency is in the page. */
export function shopifyCurrency(html) {
  return /Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1]
    ?? metaContent(html, ['og:price:currency', 'product:price:currency']);
}
export function priceFromShopifyJson(product, currency) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const cents = variants.filter(v => v.available !== false).map(v => Number(v.price)).filter(Number.isFinite);
  const low = cents.length ? Math.min(...cents) : Number(product?.price);
  return Number.isFinite(low) ? money(low / 100, currency, 'shopify') : null;
}

async function fetchText(url, fetchImpl, accept) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-AU,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
  });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: 'http_error' });
  return (await response.text()).slice(0, MAX_BODY_CHARS);
}

/** → { amount, currency, via } or throws with a short `code` the radar stores. */
export async function readShopPrice(url, { fetchImpl = fetch } = {}) {
  const html = await fetchText(url, fetchImpl, 'text/html,application/xhtml+xml');
  const found = priceFromJsonLd(html) ?? priceFromMeta(html);
  if (found) return found;
  if (/cdn\.shopify\.com|Shopify\.shop/.test(html)) {
    const currency = shopifyCurrency(html);
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    const product = JSON.parse(await fetchText(`${u.href.replace(/\/$/, '')}.js`, fetchImpl, 'application/json'));
    const viaJson = priceFromShopifyJson(product, currency);
    if (viaJson) return viaJson;
  }
  throw Object.assign(new Error('No machine readable price on the page'), { code: 'no_price' });
}
