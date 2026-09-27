/**
 * In-memory mock of the /api/travel-* endpoints for local Vite dev and
 * vitest. Serves the invented fixture trip only — no production data.
 */
import { randomUUID } from 'node:crypto';
import fixtureTrip from '../fixtures/test-trip.json' with { type: 'json' };
import type { Item, ItemDraft, Trip } from '@/types';

const LOCAL_PASSPHRASE = 'travel-hub-local';

function json(status: number, body: unknown) {
  return { status, body };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createMockApi() {
  const trips = new Map<string, Trip>([[fixtureTrip.id, clone(fixtureTrip) as Trip]]);
  const shareTokens = new Map<string, { tripId: string; createdAt: string }>();
  let authenticated = false;

  function version(trip: Trip): string {
    return Buffer.from(JSON.stringify(trip)).toString('base64').slice(0, 24);
  }

  function tripOr404(id: string) {
    const trip = trips.get(id);
    return trip ?? null;
  }

  function fillMoney(cost: ItemDraft['cost']): Item['cost'] | undefined {
    if (!cost) return undefined;
    if ('aud' in cost) return cost as Item['cost'];
    const rate = cost.currency === 'AUD' ? 1 : 1.6;
    return {
      amount: cost.amount,
      currency: cost.currency,
      aud: cost.currency === 'AUD' ? cost.amount : Math.round(cost.amount * rate),
      rate,
      rate_date: new Date().toISOString().slice(0, 10)
    };
  }

  async function handle(method: string, urlPath: string, body?: unknown) {
    const url = new URL(urlPath, 'http://local.test');
    const path = url.pathname;

    if (path === '/api/session' && method === 'GET') {
      if (!authenticated) {
        return json(401, { ok: false, error: { code: 'unauthenticated', message: 'Please sign in to continue.' } });
      }
      return json(200, { ok: true, data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 } });
    }
    if (path === '/api/auth' && method === 'POST') {
      const passphrase = (body as { passphrase?: string })?.passphrase;
      if (typeof passphrase === 'string' && passphrase.trim() === LOCAL_PASSPHRASE) {
        authenticated = true;
        return json(200, { ok: true, data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 } });
      }
      return json(401, { ok: false, error: { code: 'invalid_credentials', message: 'Invalid passphrase' } });
    }
    if (path === '/api/logout' && method === 'POST') {
      authenticated = false;
      return json(200, { ok: true, data: { loggedOut: true } });
    }

    if (!authenticated && path !== '/api/travel-public') {
      return json(401, { ok: false, error: { code: 'unauthenticated', message: 'Please sign in to continue.' } });
    }

    if (path === '/api/travel-trips' && method === 'GET') {
      const summaries = [...trips.values()].map((trip) => ({
        id: trip.id,
        title: trip.title,
        start_date: trip.start_date,
        end_date: trip.end_date,
        cities: trip.cities.map((c) => c.name)
      }));
      return json(200, { ok: true, data: { trips: summaries } });
    }
    if (path === '/api/travel-trips' && method === 'POST') {
      const payload = body as { title?: string; start_date?: string; end_date?: string; import?: Partial<Trip> };
      const trip: Trip = payload.import
        ? {
            id: `trp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
            schema_version: 1,
            title: payload.import.title ?? 'New trip',
            start_date: payload.import.start_date ?? nowIso().slice(0, 10),
            end_date: payload.import.end_date ?? nowIso().slice(0, 10),
            home_tz: payload.import.home_tz ?? 'Australia/Sydney',
            followers_label: payload.import.followers_label ?? '',
            cities: payload.import.cities ?? [],
            items: ((payload.import.items ?? []) as Item[]).map((item) => ({
              ...item,
              id: `itm_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
              created_at: nowIso(),
              updated_at: nowIso()
            })),
            days: payload.import.days ?? [],
            checkins: [],
            share: { enabled: false, created_at: null },
            created_at: nowIso(),
            updated_at: nowIso()
          }
        : {
            id: `trp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
            schema_version: 1,
            title: payload.title ?? 'New trip',
            start_date: payload.start_date ?? nowIso().slice(0, 10),
            end_date: payload.end_date ?? nowIso().slice(0, 10),
            home_tz: 'Australia/Sydney',
            followers_label: '',
            cities: [],
            items: [],
            days: [],
            checkins: [],
            share: { enabled: false, created_at: null },
            created_at: nowIso(),
            updated_at: nowIso()
          };
      trips.set(trip.id, trip);
      return json(201, { ok: true, data: { trip, version: version(trip) } });
    }

    if (path === '/api/travel-trip') {
      const id = url.searchParams.get('id') ?? '';
      const trip = tripOr404(id);
      if (!trip) return json(404, { ok: false, error: { code: 'not_found', message: 'Trip not found.' } });

      if (method === 'GET') return json(200, { ok: true, data: { trip, version: version(trip) } });
      if (method === 'PATCH') {
        const payload = body as { if_version?: string; patch?: Partial<Trip> };
        if (payload.if_version !== version(trip)) {
          return json(409, { ok: false, error: { code: 'conflict', message: 'This trip changed somewhere else. Reload to see the latest.' } });
        }
        Object.assign(trip, payload.patch, { updated_at: nowIso() });
        return json(200, { ok: true, data: { trip, version: version(trip) } });
      }
      if (method === 'DELETE') {
        trips.delete(id);
        return json(200, { ok: true, data: { id, deleted: true } });
      }
    }

    if (path === '/api/travel-items') {
      const tripId = url.searchParams.get('trip') ?? '';
      const trip = tripOr404(tripId);
      if (!trip) return json(404, { ok: false, error: { code: 'not_found', message: 'Trip not found.' } });

      if (method === 'POST') {
        const payload = body as { if_version?: string; item?: ItemDraft };
        if (payload.if_version !== version(trip)) {
          return json(409, { ok: false, error: { code: 'conflict', message: 'This trip changed somewhere else. Reload to see the latest.' } });
        }
        const item = {
          ...payload.item,
          id: `itm_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          cost: fillMoney(payload.item?.cost),
          created_at: nowIso(),
          updated_at: nowIso()
        } as Item;
        trip.items.push(item);
        trip.updated_at = nowIso();
        return json(200, { ok: true, data: { trip, version: version(trip) } });
      }
      if (method === 'PATCH') {
        const itemId = url.searchParams.get('id') ?? '';
        const payload = body as { if_version?: string; item?: ItemDraft };
        if (payload.if_version !== version(trip)) {
          return json(409, { ok: false, error: { code: 'conflict', message: 'This trip changed somewhere else. Reload to see the latest.' } });
        }
        const index = trip.items.findIndex((i) => i.id === itemId);
        if (index === -1) return json(404, { ok: false, error: { code: 'not_found', message: 'Item not found.' } });
        trip.items[index] = {
          ...trip.items[index],
          ...payload.item,
          cost: fillMoney(payload.item?.cost) ?? trip.items[index]!.cost,
          id: itemId,
          updated_at: nowIso()
        } as Item;
        trip.updated_at = nowIso();
        return json(200, { ok: true, data: { trip, version: version(trip) } });
      }
      if (method === 'DELETE') {
        const itemId = url.searchParams.get('id') ?? '';
        const payload = body as { if_version?: string };
        if (payload?.if_version !== version(trip)) {
          return json(409, { ok: false, error: { code: 'conflict', message: 'This trip changed somewhere else. Reload to see the latest.' } });
        }
        trip.items = trip.items.filter((i) => i.id !== itemId);
        trip.updated_at = nowIso();
        return json(200, { ok: true, data: { trip, version: version(trip) } });
      }
    }

    if (path === '/api/travel-checkins' && method === 'POST') {
      const tripId = url.searchParams.get('trip') ?? '';
      const trip = tripOr404(tripId);
      if (!trip) return json(404, { ok: false, error: { code: 'not_found', message: 'Trip not found.' } });
      const payload = body as { city_id?: string; label?: string };
      trip.checkins.push({
        id: `chk_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
        at: nowIso(),
        city_id: payload.city_id ?? '',
        label: payload.label ?? 'Check-in'
      });
      trip.updated_at = nowIso();
      return json(200, { ok: true, data: { trip, version: version(trip) } });
    }

    if (path === '/api/travel-share' && method === 'POST') {
      const tripId = url.searchParams.get('trip') ?? '';
      const trip = tripOr404(tripId);
      if (!trip) return json(404, { ok: false, error: { code: 'not_found', message: 'Trip not found.' } });
      const token = randomUUID().replace(/-/g, '');
      shareTokens.set(token, { tripId, createdAt: nowIso() });
      trip.share = { enabled: true, created_at: nowIso() };
      return json(200, { ok: true, data: { url: `https://life-hub.adam-russell.com/travel/t/${token}` } });
    }
    if (path === '/api/travel-share' && method === 'DELETE') {
      const tripId = url.searchParams.get('trip') ?? '';
      const trip = tripOr404(tripId);
      if (trip) trip.share = { enabled: false, created_at: null };
      for (const [token, entry] of shareTokens) if (entry.tripId === tripId) shareTokens.delete(token);
      return json(200, { ok: true, data: { enabled: false } });
    }

    if (path === '/api/travel-public' && method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      const entry = shareTokens.get(token);
      if (!entry) return json(404, { ok: false, error: { code: 'not_found', message: 'This link has been turned off.' } });
      const trip = tripOr404(entry.tripId);
      if (!trip) return json(404, { ok: false, error: { code: 'not_found', message: 'Not found.' } });
      const publicTrip = redactTrip(trip);
      return json(200, { ok: true, data: { trip: publicTrip } });
    }

    if (path === '/api/travel-places' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      if (!q) return json(200, { ok: true, data: { places: [] } });
      return json(200, {
        ok: true,
        data: { places: [{ name: `${q} (mock result)`, lat: -33.87, lon: 151.21 }] }
      });
    }

    if (path === '/api/travel-rates' && method === 'GET') {
      const from = url.searchParams.get('from') ?? 'AUD';
      return json(200, { ok: true, data: { from, to: 'AUD', rate: from === 'AUD' ? 1 : 1.6, date: nowIso().slice(0, 10) } });
    }

    if (path === '/api/travel-parse' && method === 'POST') {
      const text = String((body as { text?: string })?.text ?? '');
      const hasCost = /\$|AUD|EUR|GBP/.test(text);
      return json(200, {
        ok: true,
        data: {
          draft: { title: text.split('\n')[0]?.slice(0, 60) ?? 'Imported item', note: '', status: 'planned' },
          confidence: hasCost ? 'high' : 'low',
          missing: hasCost ? [] : ['cost']
        }
      });
    }

    return json(404, { ok: false, error: { code: 'not_found', message: 'Unknown route.' } });
  }

  return {
    handle,
    async handleNodeRequest(
      req: { method?: string; url?: string; on: Function },
      res: { statusCode: number; setHeader: Function; end: Function }
    ) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve());
      });
      let requestBody: unknown;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          requestBody = JSON.parse(raw);
        } catch {
          requestBody = undefined;
        }
      }
      const result = await handle(req.method ?? 'GET', req.url ?? '/', requestBody);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    }
  };
}

/** §4 redaction (mirrors the eventual netlify-side `travel-redact.mjs`). */
function redactTrip(trip: Trip) {
  const lastCheckin = trip.checkins[trip.checkins.length - 1];
  return {
    ...trip,
    items: trip.items
      .filter((item) => !item.private && item.kind !== 'med')
      .map((item) => {
        const { booking_ref, cost, link, note, ...rest } = item as Item & { source?: string };
        void booking_ref;
        void cost;
        void link;
        void note;
        const withoutSource = 'source' in rest ? (({ source, ...r }) => r)(rest as { source?: string }) : rest;
        return { ...withoutSource, note: '' };
      }),
    days: trip.days.map(({ penelope_prompt, ...rest }) => {
      void penelope_prompt;
      return rest;
    }),
    checkins: undefined,
    share: undefined,
    last_checkin: lastCheckin
      ? {
          at: lastCheckin.at,
          city_name: trip.cities.find((c) => c.id === lastCheckin.city_id)?.name ?? lastCheckin.city_id,
          label: lastCheckin.label
        }
      : null
  };
}
