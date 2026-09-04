import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createProjectsHandler } from '../../netlify/functions/projects.mjs';
import { createReviewsHandler } from '../../netlify/functions/reviews.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin = 'https://tasks-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/reviews',
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function handlerFor(store) {
  return createReviewsHandler({
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  });
}

test('reviews require the Life session and answer CORS preflight', async () => {
  const handler = handlerFor(memoryStore());
  const denied = await handler(request({ cookie: false }));
  assert.equal(denied.status, 401);

  const preflight = await handler(request({ method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://tasks-hub.adam-russell.com');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
});

test('reviews list, variance, and close write a ReviewLog on the Tasks store', async () => {
  const store = memoryStore({
    'projects/p1': {
      id: 'p1',
      title: 'Wrap demo',
      status: 'active',
      baseline_end_date: '2026-07-15',
      current_end_date: '2026-07-20',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z'
    },
    'tasks/t1': {
      id: 't1',
      parent_project_id: 'p1',
      status: 'done',
      due_date: '2026-08-01'
    }
  });
  const handler = handlerFor(store);

  const empty = await handler(request());
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data.reviews, []);

  const varianceRes = await handler(request({
    url: 'https://api.adam-russell.com/api/reviews?project_id=p1'
  }));
  assert.equal(varianceRes.status, 200);
  const variance = (await varianceRes.json()).data.variance;
  assert.equal(variance.slip_days, 17);
  assert.equal(variance.ready_to_close, true);

  const missing = await handler(request({
    url: 'https://api.adam-russell.com/api/reviews?project_id=nope'
  }));
  assert.equal(missing.status, 404);

  const closed = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: 'Marks landed; wrap the arc.' }
  }));
  assert.equal(closed.status, 200);
  const result = (await closed.json()).data;
  assert.equal(result.project.status, 'archived_dead');
  assert.equal(result.project.review_summary, 'Marks landed; wrap the arc.');
  assert.equal(result.review.outcome, 'closed');
  assert.equal(result.review.slip_days, 17);
  assert.equal(result.review.baseline_end_date, '2026-07-15');
  assert.equal(result.variance.slip_days, 17);

  const listed = await handler(request());
  assert.equal(listed.status, 200);
  const reviews = (await listed.json()).data.reviews;
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].reason, 'Marks landed; wrap the arc.');

  const again = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: 'Already done' }
  }));
  assert.equal(again.status, 400);
});

function isApiResult(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.ok === 'boolean';
}

/** Same unwrap the Tasks SPA uses: parse `{ ok, data }` then `.reviews` / close payload. */
async function spaGet(response) {
  const body = JSON.parse(await response.text());
  assert.equal(isApiResult(body), true, 'SPA rejects a non-envelope body as invalid_response');
  assert.equal(body.ok, true, body.ok === false ? body.error?.message : 'ok');
  return body.data;
}

function reviewLogLine(review, projects) {
  const proj = projects.find(project => project.id === review.project_id);
  const slip =
    review.slip_days === null || review.slip_days === undefined
      ? ''
      : review.slip_days === 0
        ? ' · on baseline'
        : review.slip_days > 0
          ? ` · +${review.slip_days}d vs baseline`
          : ` · ${review.slip_days}d vs baseline`;
  return {
    title: `${review.outcome} · ${proj?.title ?? review.project_id}`,
    desc: `${review.reason}${slip}`
  };
}

async function withHandlerServer(handler, run) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const request = new Request(`https://api.adam-russell.com${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: raw.length ? raw : undefined
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('signed-in Projects page can list reviews and close over fetch', async () => {
  const store = memoryStore({
    'projects/proj_tom': {
      schema_version: 1,
      id: 'proj_tom',
      title: 'Tournament of Minds',
      status: 'active',
      type: 'excursion',
      baseline_end_date: '2026-08-30',
      current_end_date: '2026-08-30',
      milestones: [
        { id: 'ms1', title: 'Permission note drafted and sent', status: 'done' },
        { id: 'ms2', title: 'Staff absence email sent', status: 'done' },
        { id: 'ms3', title: 'Risk assessment lodged', status: 'done' }
      ],
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    },
    'review_logs/rev_stall': {
      schema_version: 1,
      id: 'rev_stall',
      project_id: 'proj_tom',
      outcome: 'revived',
      reason: 'Venue confirmed — moving again',
      merge_into_project_id: null,
      created_at: '2026-07-15T00:00:00.000Z'
    }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  };
  const reviewsHandler = createReviewsHandler(deps);
  const projectsHandler = createProjectsHandler(deps);

  const listedProjects = await spaGet(await projectsHandler(request({
    origin: 'https://life-hub.adam-russell.com',
    url: 'https://api.adam-russell.com/api/projects'
  })));
  assert.equal(listedProjects.projects[0].title, 'Tournament of Minds');

  await withHandlerServer(reviewsHandler, async base => {
    const headers = {
      accept: 'application/json',
      origin: 'https://life-hub.adam-russell.com',
      cookie: `life_hub_session=${session}`
    };

    const listed = await fetch(`${base}/api/reviews`, { headers });
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get('access-control-allow-origin'), 'https://life-hub.adam-russell.com');
    assert.equal(listed.headers.get('access-control-allow-credentials'), 'true');
    const reviews = (await spaGet(listed)).reviews;
    assert.equal(Array.isArray(reviews), true);
    assert.equal(reviews.length, 1);
    assert.deepEqual(reviewLogLine(reviews[0], listedProjects.projects), {
      title: 'revived · Tournament of Minds',
      desc: 'Venue confirmed — moving again'
    });

    const closed = await fetch(`${base}/api/reviews`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'close',
        project_id: 'proj_tom',
        reason: 'Heat done; wrap the admin trail.'
      })
    });
    assert.equal(closed.status, 200);
    const payload = await spaGet(closed);
    assert.equal(payload.project.status, 'archived_dead');
    assert.equal(payload.project.title, 'Tournament of Minds');
    assert.equal(payload.project.review_summary, 'Heat done; wrap the admin trail.');
    assert.equal(payload.review.outcome, 'closed');
    assert.equal(payload.review.project_id, 'proj_tom');
    assert.equal(payload.review.baseline_end_date, '2026-08-30');
    assert.equal(typeof payload.variance.slip_days === 'number' || payload.variance.slip_days === null, true);

    const after = (await spaGet(await fetch(`${base}/api/reviews`, { headers }))).reviews;
    assert.equal(after.length, 2);
    const closedRow = after.find(item => item.outcome === 'closed');
    assert.deepEqual(
      reviewLogLine(closedRow, [payload.project]),
      reviewLogLine(payload.review, [payload.project])
    );
    assert.match(reviewLogLine(closedRow, [payload.project]).title, /^closed · Tournament of Minds$/);
    assert.match(reviewLogLine(closedRow, [payload.project]).desc, /Heat done; wrap the admin trail/);
  });
});

test('reviews reject a blank retrospective and unknown actions', async () => {
  const store = memoryStore({
    'projects/p1': { id: 'p1', title: 'Open', status: 'active' }
  });
  const handler = handlerFor(store);

  const blank = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: '   ' }
  }));
  assert.equal(blank.status, 400);

  const unknown = await handler(request({
    method: 'POST',
    body: { action: 'flag_stalled' }
  }));
  assert.equal(unknown.status, 400);
});
