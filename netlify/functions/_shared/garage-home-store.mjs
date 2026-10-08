/**
 * Storage + Gmail scan for Garage & Home. Shared by the page API and the cron.
 * Both records live in the private data repo (GITHUB_REPOSITORY), never in code.
 */
import { decodeBlob } from './decode-blob.mjs';
import { createGmailClient, fetchNewMessages, isGmailConfigured } from './gmail-client.mjs';
import {
  GARAGE_HOME_DATA_PATH,
  MAILROOM_DATA_PATH,
  buildGmailQuery,
  emptyGarageHomeRecord,
  emptyMailroomRecord,
  mergeScan,
  parseGarageHomeRecord,
  parseMailroomRecord
} from '../../../apps/life/js/app/garage-home-model.js';

async function loadJson(github, tree, path, parse, empty) {
  const entry = tree.find(item => item.path === path && item.type === 'blob');
  if (!entry) return { record: empty(), sha: null };
  let raw;
  try {
    raw = JSON.parse(decodeBlob(await github.readBlob(entry.sha)));
  } catch {
    throw Object.assign(new Error('garage_home_corrupt'), { code: 'garage_home_corrupt' });
  }
  const record = parse(raw);
  if (!record) throw Object.assign(new Error('garage_home_corrupt'), { code: 'garage_home_corrupt' });
  return { record, sha: entry.sha };
}

/** Read both records with one tree lookup. A missing file is an empty record. */
export async function loadGarageHome(github) {
  const { tree } = await github.resolveTree();
  const [home, mailroom] = await Promise.all([
    loadJson(github, tree, GARAGE_HOME_DATA_PATH, parseGarageHomeRecord, emptyGarageHomeRecord),
    loadJson(github, tree, MAILROOM_DATA_PATH, parseMailroomRecord, emptyMailroomRecord)
  ]);
  return { home, mailroom };
}

export function saveRecord(github, path, record, sha, message) {
  return github.writeFile({ path, content: JSON.stringify(record, null, 2), ...(sha ? { sha } : {}), message });
}

/** Day before the last scan, so mail that arrived mid-scan isn't missed. Ids dedupe the overlap. */
function sinceKey(lastScanAt) {
  const time = Date.parse(lastScanAt ?? '');
  if (!Number.isFinite(time)) return null;
  return new Date(time - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pull new mail and fold it into the Mailroom. Returns what happened; writes
 * only when something changed or the scan time needs recording.
 */
export async function scanMailroom({ github, env, fetchImpl, now = Date.now, loaded }) {
  if (!isGmailConfigured(env)) return { status: 'not_connected', added: 0 };
  const { home, mailroom } = loaded ?? (await loadGarageHome(github));
  const query = buildGmailQuery(home.record, mailroom.record, { sinceDateKey: sinceKey(mailroom.record.lastScanAt) });
  if (!query) return { status: 'no_places', added: 0, mailroom: mailroom.record };
  const client = createGmailClient({ env, fetchImpl });
  const knownIds = new Set(mailroom.record.items.map(item => item.id));
  const messages = await fetchNewMessages(client, query, { knownIds, max: 40 });
  const scannedAt = new Date(now()).toISOString();
  const { mailroom: next, added } = mergeScan(mailroom.record, messages, { home: home.record, scannedAt });
  // Quiet runs only commit once a day (to move the search window); runs with new mail always commit.
  const lastTime = Date.parse(mailroom.record.lastScanAt ?? '');
  const stale = !Number.isFinite(lastTime) || now() - lastTime > 20 * 3_600_000;
  if (!added.length && !stale) return { status: 'ok', added: 0, mailroom: mailroom.record };
  await saveRecord(github, MAILROOM_DATA_PATH, next, mailroom.sha, `chore(mailroom): scan${added.length ? ` +${added.length}` : ''}`);
  return { status: 'ok', added: added.length, mailroom: next };
}
