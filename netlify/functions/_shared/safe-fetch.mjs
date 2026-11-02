// Outbound fetch for URLs that a person or a model supplied (Clare's web tools,
// Knowledge URL watches, Notion media imports, the watch price radar).
//
// Every hop (the first URL and each redirect, at most MAX_REDIRECTS) is checked:
//   - http or https only, no credentials in the URL, default port only;
//   - the host name is not an internal name (localhost, *.local, *.internal, one label);
//   - the name is resolved with dns.lookup(…, { all: true }) and EVERY answer must be a
//     public unicast address (no loopback, private, link-local, CGNAT, multicast,
//     reserved, documentation, IPv6 ULA / link-local / site-local, or an IPv4 address
//     hidden in IPv4-mapped, IPv4-compatible, NAT64, 6to4 or Teredo form).
//
// The built-in transport then connects to the address that was checked (the socket's
// lookup is pinned to it, TLS still verifies the real host name), so a DNS answer that
// changes between the check and the connect cannot redirect the request inward.
//
// When a caller injects its own fetchImpl (tests, or a future proxy), that function does
// its own name resolution. The address check still runs first, but the connection is not
// pinned, so a short DNS-rebinding window remains on that path only.
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

export const MAX_REDIRECTS = 5;
export const MAX_OUTBOUND_URL_LENGTH = 2048;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_NAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.lan', '.intranet', '.corp'];

// The test harness (scripts/test-network-guard.mjs) installs this so unit tests never
// resolve real names and never open sockets: lookups return a fixed public address and
// the transport is the guarded global fetch, which refuses external hosts.
const TEST_NETWORK = Symbol.for('life-hub.test-network');

/** Strict dotted-quad IPv4 → four octets, else null. */
export function parseIPv4(text) {
  const parts = String(text ?? '').split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** IPv6 text (no zone id) → eight 16-bit words, else null. Accepts a dotted IPv4 tail. */
export function parseIPv6(text) {
  let value = String(text ?? '').trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  if (!value || value.includes('%')) return null;
  const lastColon = value.lastIndexOf(':');
  if (lastColon === -1) return null;
  if (value.includes('.', lastColon)) {
    // A dotted IPv4 tail (::ffff:127.0.0.1) becomes two hex groups.
    const v4 = parseIPv4(value.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const toWords = (part) => (part === '' ? [] : part.split(':'));
  const head = toWords(halves[0]);
  const rest = halves.length === 2 ? toWords(halves[1]) : [];
  const words = [];
  for (const group of [...head, ...rest]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  }
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    words.push(...head.map(g => parseInt(g, 16)), ...new Array(missing).fill(0), ...rest.map(g => parseInt(g, 16)));
  } else {
    if (head.length !== 8) return null;
    words.push(...head.map(g => parseInt(g, 16)));
  }
  return words.length === 8 ? words : null;
}

function inV4(octets, base, bits) {
  const toInt = (o) => ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((toInt(octets) & mask) >>> 0) === ((toInt(base) & mask) >>> 0);
}

const BLOCKED_V4 = [
  [[0, 0, 0, 0], 8], // "this network", includes 0.0.0.0
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16], // link-local, cloud metadata
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4] // reserved, includes broadcast
];

export function isBlockedIPv4(octets) {
  if (!Array.isArray(octets) || octets.length !== 4) return true;
  return BLOCKED_V4.some(([base, bits]) => inV4(octets, base, bits));
}

function v4FromWords(hi, lo) {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

export function isBlockedIPv6(words) {
  if (!Array.isArray(words) || words.length !== 8) return true;
  const [w0, w1, w2, w3, , w5, w6, w7] = words;
  const w4 = words[4];
  const zeroPrefix = (n) => words.slice(0, n).every(w => w === 0);
  if (zeroPrefix(8)) return true; // :: unspecified
  if (zeroPrefix(7) && w7 === 1) return true; // ::1 loopback
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-translated ::ffff:0:a.b.c.d
  if (zeroPrefix(5) && w5 === 0xffff) return isBlockedIPv4(v4FromWords(w6, w7));
  if (zeroPrefix(4) && w4 === 0xffff && w5 === 0) return isBlockedIPv4(v4FromWords(w6, w7));
  // Deprecated IPv4-compatible ::a.b.c.d
  if (zeroPrefix(6)) return true;
  // NAT64 well-known 64:ff9b::/96 and local-use 64:ff9b:1::/48
  if (w0 === 0x64 && w1 === 0xff9b) {
    if (w2 === 1) return true;
    return isBlockedIPv4(v4FromWords(w6, w7));
  }
  // 6to4 2002:V4ADDR::/48
  if (w0 === 0x2002) return isBlockedIPv4(v4FromWords(w1, w2));
  // Teredo 2001:0::/32 hides an obfuscated IPv4; never a destination we need.
  if (w0 === 0x2001 && w1 === 0) return true;
  if (w0 === 0x2001 && w1 === 0x0db8) return true; // documentation
  if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) return true; // discard-only 100::/64
  if ((w0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((w0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((w0 & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((w0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

/** True unless `address` is a public unicast IPv4 or IPv6 address. Unparseable → blocked. */
export function isBlockedAddress(address) {
  const text = String(address ?? '').trim().replace(/^\[|\]$/g, '');
  const family = isIP(text);
  if (family === 4) return isBlockedIPv4(parseIPv4(text));
  if (family === 6) return isBlockedIPv6(parseIPv6(text));
  return true;
}

/** Lexical host check: internal names and blocked IP literals. */
export function isBlockedHostname(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  const literal = host.replace(/^\[|\]$/g, '');
  if (isIP(literal)) return isBlockedAddress(literal);
  if (BLOCKED_NAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) return true;
  // A single-label name resolves through search domains, i.e. somewhere internal.
  if (!host.includes('.')) return true;
  return false;
}

/** Shape and host checks for one hop. → { ok: true, url: URL } | { ok: false, error } */
export function checkOutboundUrl(raw, { maxLength = MAX_OUTBOUND_URL_LENGTH } = {}) {
  const text = raw instanceof URL ? raw.href : String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'missing_url' };
  if (text.length > maxLength) return { ok: false, error: 'url_too_long' };
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' };
  }
  if (parsed.username || parsed.password) return { ok: false, error: 'credentials_forbidden' };
  if (isBlockedHostname(parsed.hostname)) return { ok: false, error: 'blocked_host' };
  // WHATWG URL drops a default port, so any port left here is a non-default one
  // (9001 is the Lambda runtime API; 8080, 6379, 2375… are internal services).
  if (parsed.port !== '') return { ok: false, error: 'blocked_port' };
  return { ok: true, url: parsed };
}

function testNetwork() {
  return globalThis[TEST_NETWORK] ?? null;
}

/**
 * Resolve a host and require every answer to be public.
 * → { ok: true, address, family } (the address the transport pins) | { ok: false, error }
 */
export async function resolvePublicAddress(hostname, { lookupImpl } = {}) {
  const host = String(hostname ?? '').replace(/^\[|\]$/g, '');
  const literal = isIP(host);
  if (literal) {
    return isBlockedAddress(host) ? { ok: false, error: 'blocked_address' } : { ok: true, address: host, family: literal };
  }
  const lookup = lookupImpl ?? testNetwork()?.lookup ?? dnsLookup;
  let answers;
  try {
    answers = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: 'dns_failed' };
  }
  const list = (Array.isArray(answers) ? answers : [answers])
    .map(entry => (typeof entry === 'string' ? { address: entry } : entry))
    .filter(entry => entry && typeof entry.address === 'string');
  if (!list.length) return { ok: false, error: 'dns_failed' };
  // One private answer is enough to refuse: a name that mixes public and private
  // records is either misconfigured or a rebinding setup.
  if (list.some(entry => isBlockedAddress(entry.address))) return { ok: false, error: 'blocked_address' };
  const first = list[0];
  return { ok: true, address: first.address, family: Number(first.family) || isIP(first.address) };
}

function decodeStream(res) {
  const encoding = String(res.headers['content-encoding'] ?? '').trim().toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return res.pipe(zlib.createInflate());
  if (encoding === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/** One HTTP request whose socket connects only to `pinned.address`. Resolves to a WHATWG Response. */
export function pinnedRequest(url, pinned, { method = 'GET', headers = {}, signal } = {}) {
  const transport = url.protocol === 'https:' ? https : http;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: host,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: { 'accept-encoding': 'gzip, deflate, br', ...headers },
      agent: false,
      signal,
      ...(isIP(host) ? {} : { servername: host }),
      lookup(_name, options, callback) {
        const cb = typeof options === 'function' ? options : callback;
        if (options && typeof options === 'object' && options.all) {
          cb(null, [{ address: pinned.address, family: pinned.family }]);
        } else {
          cb(null, pinned.address, pinned.family);
        }
      }
    }, (res) => {
      const status = res.statusCode ?? 502;
      const responseHeaders = new Headers();
      const raw = res.rawHeaders ?? [];
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const name = raw[i].toLowerCase();
        if (name === 'content-encoding' || name === 'content-length' || name === 'transfer-encoding') continue;
        try { responseHeaders.append(raw[i], raw[i + 1]); } catch { /* skip a malformed header */ }
      }
      const noBody = method === 'HEAD' || status === 204 || status === 304 || status < 200;
      if (noBody || status < 200 || status > 599) {
        res.resume();
        resolve(new Response(null, { status: status < 200 || status > 599 ? 502 : status, headers: responseHeaders }));
        return;
      }
      const body = decodeStream(res);
      resolve(new Response(Readable.toWeb(body), { status, headers: responseHeaders }));
    });
    request.on('error', reject);
    request.end();
  });
}

function locationOf(response) {
  try {
    const value = response?.headers?.get?.('location');
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

async function discard(response) {
  try { await response?.body?.cancel?.(); } catch { /* nothing to free */ }
}

/**
 * GET (or HEAD) a user- or model-supplied URL safely.
 *
 * → { ok: true, response, url: <final URL string>, redirects }
 * → { ok: false, error, url?, status? }   error ∈ missing_url, invalid_url, url_too_long,
 *   unsupported_protocol, credentials_forbidden, blocked_port, blocked_host, dns_failed,
 *   blocked_address, blocked_redirect, too_many_redirects
 *
 * Network failures (timeouts, resets) throw, as fetch does.
 */
export async function safeFetch(raw, {
  method = 'GET',
  headers = {},
  signal,
  fetchImpl,
  lookupImpl,
  maxRedirects = MAX_REDIRECTS,
  maxUrlLength = MAX_OUTBOUND_URL_LENGTH,
  onHop
} = {}) {
  const verb = String(method).toUpperCase() === 'HEAD' ? 'HEAD' : 'GET';
  const injected = typeof fetchImpl === 'function' && fetchImpl !== globalThis.fetch ? fetchImpl : null;
  const harness = testNetwork();
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const checked = checkOutboundUrl(current, { maxLength: maxUrlLength });
    if (!checked.ok) {
      return { ...checked, error: hop > 0 ? 'blocked_redirect' : checked.error, reason: checked.error };
    }
    const url = checked.url;
    const resolved = await resolvePublicAddress(url.hostname, { lookupImpl });
    if (!resolved.ok) {
      return { ok: false, error: hop > 0 ? 'blocked_redirect' : resolved.error, reason: resolved.error, url: url.href };
    }
    if (typeof onHop === 'function') {
      try { onHop({ hop, url: url.href, address: resolved.address }); } catch { /* audit must not break the fetch */ }
    }
    let response;
    if (injected) {
      response = await injected(url.href, { method: verb, headers, signal, redirect: 'manual' });
    } else if (harness) {
      response = await globalThis.fetch(url.href, { method: verb, headers, signal, redirect: 'manual' });
    } else {
      response = await pinnedRequest(url, resolved, { method: verb, headers, signal });
    }
    const status = Number(response?.status) || 0;
    const location = REDIRECT_STATUSES.has(status) ? locationOf(response) : null;
    if (!location) return { ok: true, response, url: url.href, redirects: hop };
    await discard(response);
    let next;
    try {
      next = new URL(location, url);
    } catch {
      return { ok: false, error: 'blocked_redirect', reason: 'invalid_url', url: url.href, status };
    }
    current = next.href;
  }
  return { ok: false, error: 'too_many_redirects', url: String(current) };
}
