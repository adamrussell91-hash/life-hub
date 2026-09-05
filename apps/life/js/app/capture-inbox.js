/** Capture Inbox — receives Web Share Target handoffs (GET text/url, POST files via SW).
 * Prototype: classify + suggest destination. Does not auto-write to any hub.
 */

import {
  classifyClipboardData,
  suggestIngestTarget
} from '../../../../packages/design-kit/js/hub-rich-paste.js';

const SHARE_CACHE = 'life-hub-share-target-v1';
const SHARE_KEY = 'share-handoff';

const params = new URLSearchParams(location.search);
const card = document.getElementById('capture-inbox-card');

init().catch((error) => {
  renderError(error instanceof Error ? error.message : 'Could not read shared content.');
});

async function init() {
  const fromQuery = readQueryShare(params);
  const fromPost = params.get('share') === '1' ? await readPostedShare() : null;
  const share = fromPost || fromQuery;

  if (!share || isEmptyShare(share)) {
    card.replaceChildren(
      p(
        'capture-inbox__empty',
        'Nothing was shared yet. Use the system share sheet into Life Hub, or open this page after a share.'
      )
    );
    return;
  }

  const payload = classifyShare(share);
  const suggestion = suggestIngestTarget(payload, { currentHub: 'life' });
  renderShare(share, payload, suggestion);
}

function readQueryShare(search) {
  const title = (search.get('title') || '').trim();
  const text = (search.get('text') || '').trim();
  const url = (search.get('url') || '').trim();
  if (!title && !text && !url) return null;
  return { title, text, url, files: [] };
}

async function readPostedShare() {
  if (!('caches' in globalThis)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARE_KEY);
  if (!response) return null;
  await cache.delete(SHARE_KEY);
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isEmptyShare(share) {
  return !share.title && !share.text && !share.url && !(share.files && share.files.length);
}

function classifyShare(share) {
  if (share.files?.length) {
    const files = share.files.map((entry) => {
      if (typeof File !== 'undefined' && entry?.name) {
        const bytes = entry.base64 ? base64ToBytes(entry.base64) : new Uint8Array();
        return new File([bytes], entry.name, { type: entry.type || 'application/octet-stream' });
      }
      return entry;
    });
    const dt = new DataTransfer();
    for (const file of files) {
      try {
        dt.items.add(file);
      } catch {
        /* happy-dom / older engines may reject */
      }
    }
    if (dt.files?.length) return classifyClipboardData(dt);
    return {
      kind: files.every((f) => /^image\//i.test(f.type || '')) ? 'image' : 'file',
      files,
      subtype: files.some((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf') ? 'pdf' : undefined
    };
  }

  // Prefer an explicit shared URL (Share Target `url` param), then a URL-only text body.
  const urlCandidate = (share.url || '').trim() || ((share.text || '').trim().match(/^(https?:\/\/\S+)$/i)?.[1] ?? '');
  if (urlCandidate) {
    const dt = {
      files: [],
      getData: (type) => (type === 'text/plain' ? urlCandidate : '')
    };
    return classifyClipboardData(/** @type {DataTransfer} */ (dt));
  }

  const text = [share.title, share.text].filter(Boolean).join('\n').trim();
  const dt = {
    files: [],
    getData: (type) => (type === 'text/plain' ? text : '')
  };
  return classifyClipboardData(/** @type {DataTransfer} */ (dt));
}

function renderShare(share, payload, suggestion) {
  card.replaceChildren();

  card.append(
    p('capture-inbox__meta', `Detected: ${payload.kind}${payload.subtype ? ` · ${payload.subtype}` : ''}`)
  );

  if (suggestion) {
    card.append(
      p(
        'capture-inbox__meta',
        `Suggested route: ${suggestion.hub} → ${suggestion.action} (${suggestion.reason})`
      )
    );
  }

  if (share.title) card.append(p('capture-inbox__meta', `Title: ${share.title}`));
  if (share.text) card.append(p('capture-inbox__meta', share.text));
  if (share.url) {
    const link = document.createElement('a');
    link.href = share.url;
    link.textContent = share.url;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    const wrap = p('capture-inbox__meta', 'URL: ');
    wrap.append(link);
    card.append(wrap);
  }

  if (share.files?.length) {
    const list = document.createElement('ul');
    list.className = 'capture-inbox__files';
    for (const file of share.files) {
      const item = document.createElement('li');
      item.textContent = `${file.name || 'file'} (${file.type || 'unknown'}, ${formatBytes(file.size || file.base64?.length || 0)})`;
      list.append(item);
    }
    card.append(list);
  }

  const actions = document.createElement('div');
  actions.className = 'capture-inbox__actions';

  const home = document.createElement('a');
  home.className = 'btn btn--primary';
  home.href = './';
  home.textContent = 'Open Life Hub';
  actions.append(home);

  if (suggestion?.hub === 'knowledge' || payload.kind === 'image' || payload.subtype === 'pdf') {
    const knowledge = document.createElement('a');
    knowledge.className = 'btn btn--secondary';
    knowledge.href = '../knowledge/';
    knowledge.textContent = 'Open Knowledge';
    actions.append(knowledge);
  }

  card.append(actions);
}

function renderError(message) {
  card.replaceChildren(p('capture-inbox__empty', message));
}

function p(className, text) {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

function formatBytes(n) {
  const value = Number(n) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
