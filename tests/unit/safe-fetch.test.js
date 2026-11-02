import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  checkOutboundUrl,
  isBlockedAddress,
  MAX_REDIRECTS,
  parseIPv6,
  pinnedRequest,
  resolvePublicAddress,
  safeFetch
} from '../../netlify/functions/_shared/safe-fetch.mjs';

const PUBLIC = [{ address: '93.184.215.14', family: 4 }];
const publicLookup = async () => PUBLIC;

test('address classifier blocks every internal range, including IPv6 forms that hide IPv4', () => {
  const blocked = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.254', '127.0.0.1', '127.1.2.3', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.7',
    '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd00:abcd::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:0:127.0.0.1', '::127.0.0.1',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1', '2002:7f00:1::1', '2002:c0a8:101::', '2001:0:4136:e378::1',
    'not-an-ip', ''
  ];
  for (const address of blocked) assert.equal(isBlockedAddress(address), true, address);

  const allowed = ['93.184.215.14', '1.1.1.1', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'];
  for (const address of allowed) assert.equal(isBlockedAddress(address), false, address);

  assert.deepEqual(parseIPv6('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  assert.equal(parseIPv6('fe80::1%eth0'), null, 'zone ids are refused');
  assert.equal(parseIPv6('1::2::3'), null);
});

test('URL check keeps http/https, refuses credentials, internal names and non-default ports', () => {
  assert.equal(checkOutboundUrl('https://example.org/page').ok, true);
  assert.equal(checkOutboundUrl('https://example.org:443/page').ok, true, 'a default port is dropped by URL');
  assert.equal(checkOutboundUrl('http://example.org:80/').ok, true);
  const cases = {
    'ftp://example.org/': 'unsupported_protocol',
    'file:///etc/passwd': 'unsupported_protocol',
    'https://user:pass@example.org/': 'credentials_forbidden',
    'http://127.0.0.1.nip.io:9001/2018-06-01/runtime/invocation/next': 'blocked_port',
    'https://example.org:8443/': 'blocked_port',
    'http://localhost/': 'blocked_host',
    'http://api.localhost/': 'blocked_host',
    'http://printer.local/': 'blocked_host',
    'http://metadata.google.internal/': 'blocked_host',
    'http://intranet/': 'blocked_host',
    'http://2130706433/': 'blocked_host',
    'http://0x7f.1/': 'blocked_host',
    'http://[::ffff:127.0.0.1]/': 'blocked_host',
    'http://[fd00::1]/': 'blocked_host',
    'http://169.254.169.254/latest/meta-data/': 'blocked_host',
    'not a url': 'invalid_url'
  };
  for (const [url, error] of Object.entries(cases)) assert.equal(checkOutboundUrl(url).error, error, url);
  assert.equal(checkOutboundUrl(`https://example.org/${'a'.repeat(3000)}`).error, 'url_too_long');
});

test('DNS answers must all be public: a name that resolves inward is refused before any request', async () => {
  let fetched = 0;
  const fetchImpl = async () => { fetched += 1; return new Response('x'); };
  const inward = await safeFetch('https://rebind.example.org/', {
    fetchImpl,
    lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }]
  });
  assert.deepEqual({ ok: inward.ok, error: inward.error }, { ok: false, error: 'blocked_address' });

  const mixed = await safeFetch('https://mixed.example.org/', {
    fetchImpl,
    lookupImpl: async () => [{ address: '93.184.215.14', family: 4 }, { address: 'fd00::5', family: 6 }]
  });
  assert.equal(mixed.error, 'blocked_address');

  const mapped = await safeFetch('https://mapped.example.org/', {
    fetchImpl,
    lookupImpl: async () => [{ address: '::ffff:169.254.169.254', family: 6 }]
  });
  assert.equal(mapped.error, 'blocked_address');

  const broken = await safeFetch('https://nxdomain.example.org/', {
    fetchImpl,
    lookupImpl: async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); }
  });
  assert.equal(broken.error, 'dns_failed');
  assert.equal(fetched, 0);

  const resolved = await resolvePublicAddress('example.org', { lookupImpl: async () => [{ address: '2606:4700::1', family: 6 }] });
  assert.deepEqual(resolved, { ok: true, address: '2606:4700::1', family: 6 });
});

test('redirects are followed by hand, each hop re-checked, and capped at five', async () => {
  const seen = [];
  const hosts = { 'start.example.org': '93.184.215.14', 'inner.example.org': '10.0.0.8' };
  const lookupImpl = async host => [{ address: hosts[host] ?? '93.184.215.14', family: 4 }];

  const toPrivate = await safeFetch('https://start.example.org/a', {
    lookupImpl,
    fetchImpl: async (url, init) => {
      seen.push({ url, redirect: init.redirect });
      return new Response(null, { status: 302, headers: { location: 'https://inner.example.org/admin' } });
    }
  });
  assert.equal(toPrivate.ok, false);
  assert.equal(toPrivate.error, 'blocked_redirect');
  assert.equal(toPrivate.reason, 'blocked_address');
  assert.deepEqual(seen, [{ url: 'https://start.example.org/a', redirect: 'manual' }], 'the inner host is never requested');

  const toLoopbackLiteral = await safeFetch('https://start.example.org/a', {
    lookupImpl,
    fetchImpl: async () => new Response(null, { status: 307, headers: { location: 'http://127.0.0.1:9001/runtime' } })
  });
  assert.equal(toLoopbackLiteral.error, 'blocked_redirect');

  let hops = 0;
  const loop = await safeFetch('https://start.example.org/0', {
    lookupImpl,
    fetchImpl: async () => {
      hops += 1;
      return new Response(null, { status: 301, headers: { location: `/${hops}` } });
    }
  });
  assert.equal(loop.error, 'too_many_redirects');
  assert.equal(hops, MAX_REDIRECTS + 1);

  const audited = [];
  const fine = await safeFetch('https://start.example.org/a', {
    lookupImpl,
    onHop: hop => audited.push(hop.url),
    fetchImpl: async url => url.endsWith('/a')
      ? new Response(null, { status: 308, headers: { location: '/b' } })
      : new Response('done', { status: 200 })
  });
  assert.equal(fine.ok, true);
  assert.equal(fine.url, 'https://start.example.org/b');
  assert.equal(fine.redirects, 1);
  assert.equal(await fine.response.text(), 'done');
  assert.deepEqual(audited, ['https://start.example.org/a', 'https://start.example.org/b']);
});

test('the built-in transport connects to the checked address, not whatever the name resolves to later', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/gz') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(gzipSync(Buffer.from('compressed body')));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain', 'x-host': String(req.headers.host) });
    res.end('pinned');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    // `pinned.invalid` cannot resolve anywhere; the socket still reaches the pinned address,
    // and the Host header keeps the real name.
    const response = await pinnedRequest(new URL(`http://pinned.invalid:${port}/x`), { address: '127.0.0.1', family: 4 });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'pinned');
    assert.equal(response.headers.get('x-host'), `pinned.invalid:${port}`);

    const gz = await pinnedRequest(new URL(`http://pinned.invalid:${port}/gz`), { address: '127.0.0.1', family: 4 });
    assert.equal(await gz.text(), 'compressed body');
    assert.equal(gz.headers.get('content-encoding'), null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('under the test harness, the default path never opens a real socket', async () => {
  await assert.rejects(
    () => safeFetch('https://example.org/', { lookupImpl: publicLookup }),
    /injected test mock/
  );
});
