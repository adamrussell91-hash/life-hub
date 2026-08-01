const MAX_BATCH_FILES = 50;
const MAX_BATCH_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const BLOB_SHA = /^[0-9a-f]{40}$/;
const activeSyncs = new WeakMap();

export class SyncError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SyncError';
    this.code = code;
  }
}

export function diffManifest(previous, next) {
  const previousByPath = new Map((previous?.files ?? []).map(entry => [entry.path, entry]));
  const nextPaths = new Set(next.files.map(entry => entry.path));
  const changed = [];
  const unchanged = [];

  for (const entry of next.files) {
    const prior = previousByPath.get(entry.path);
    if (prior?.sha === entry.sha) unchanged.push(entry);
    else changed.push(entry);
  }

  return {
    changed,
    removed: [...previousByPath.keys()].filter(path => !nextPaths.has(path)),
    unchanged
  };
}

export function syncRepository(options) {
  if (!options?.cache || (typeof options.cache !== 'object' && typeof options.cache !== 'function')) {
    return Promise.reject(new TypeError('Repository cache is required'));
  }

  const key = `${options.from}\0${options.to}`;
  const active = activeSyncs.get(options.cache);
  if (active?.key === key) return active.promise;
  active?.controller.abort(new DOMException('Superseded repository range', 'AbortError'));

  const controller = new AbortController();
  const detach = forwardAbort(options.signal, controller);
  const promise = performSync({ ...options, signal: controller.signal })
    .finally(() => {
      detach();
      if (activeSyncs.get(options.cache)?.promise === promise) activeSyncs.delete(options.cache);
    });
  activeSyncs.set(options.cache, { key, controller, promise });
  return promise;
}

async function performSync({ fetchImpl, cache, from, to, signal, validateFile }) {
  if (typeof fetchImpl !== 'function' || typeof validateFile !== 'function') {
    throw new TypeError('Repository sync dependencies are unavailable');
  }

  const previous = await cache.read();
  const previousMatchesRange = isExactRange(previous?.manifest, from, to);
  signal.throwIfAborted();

  let manifestResponse;
  try {
    manifestResponse = await fetchImpl(`/api/repo/manifest?from=${from}&to=${to}`, {
      headers: previousMatchesRange && previous.manifest.manifestId
        ? { 'if-none-match': `"${previous.manifest.manifestId}"` }
        : {},
      signal
    });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    return staleOrThrow(previous, 'github_unavailable');
  }
  signal.throwIfAborted();

  if (manifestResponse.status === 304) {
    if (!previousMatchesRange) throw new SyncError('github_invalid_response');
    return resultFrom(previous, [], false);
  }
  if (manifestResponse.status === 401) throw new SyncError('session_expired');
  if (!manifestResponse.ok) return staleOrThrow(previous, responseCode(manifestResponse));

  let manifest;
  try {
    manifest = (await manifestResponse.json()).data;
  } catch {
    return staleOrThrow(previous, 'github_invalid_response');
  }
  if (!isManifest(manifest) || !isExactRange(manifest, from, to)) {
    return staleOrThrow(previous, 'github_invalid_response');
  }

  const diff = diffManifest(previous?.manifest, manifest);
  const previousFiles = new Map((previous?.files ?? []).map(entry => [entry.path, entry]));
  const downloads = diff.changed.filter(entry => {
    const prior = previousFiles.get(entry.path);
    return prior?.sha !== entry.sha;
  });
  const received = new Map();
  const warnings = [];

  for (const batch of createBatches(downloads)) {
    let response;
    try {
      response = await fetchImpl('/api/repo/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          files: batch.map(({ path, sha }) => ({ path, sha }))
        }),
        signal
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      return staleOrThrow(previous, 'github_unavailable');
    }
    signal.throwIfAborted();

    if (response.status === 401) throw new SyncError('session_expired');
    if (!response.ok) return staleOrThrow(previous, responseCode(response));

    let data;
    try {
      data = (await response.json()).data;
    } catch {
      return staleOrThrow(previous, 'github_invalid_response');
    }
    if (!isExactBatch(data, batch, manifest.commitSha)) {
      return staleOrThrow(previous, 'github_invalid_response');
    }

    for (const candidate of data.files) {
      let validation;
      try {
        validation = await validateFile(candidate);
      } catch {
        validation = { valid: false, code: 'invalid_file' };
      }
      if (validation?.valid === true) {
        received.set(candidate.path, candidate);
        continue;
      }

      const prior = previousFiles.get(candidate.path);
      if (prior && typeof prior.content === 'string') {
        received.set(candidate.path, { ...prior, sha: candidate.sha });
      }
      warnings.push({
        path: candidate.path,
        code: typeof validation?.code === 'string' ? validation.code : 'invalid_file'
      });
    }
  }

  const files = [];
  for (const entry of manifest.files) {
    const candidate = received.get(entry.path) ?? previousFiles.get(entry.path);
    if (candidate && candidate.sha === entry.sha && typeof candidate.content === 'string') {
      files.push({ path: entry.path, sha: entry.sha, content: candidate.content });
    }
  }

  const record = { manifest, files };
  try {
    signal.throwIfAborted();
    await cache.write(record);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    return staleOrThrow(previous, 'cache_unavailable');
  }
  return resultFrom(record, warnings, true);
}

function createBatches(files) {
  const batches = [];
  let batch = [];
  let bytes = 0;

  for (const file of files) {
    if (file.size > MAX_BATCH_BYTES) throw new SyncError('file_too_large');
    if (batch.length && (batch.length === MAX_BATCH_FILES || bytes + file.size > MAX_BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(file);
    bytes += file.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function isManifest(value) {
  if (!value || typeof value !== 'object' || !BLOB_SHA.test(value.commitSha) ||
      typeof value.manifestId !== 'string' || value.manifestId.length === 0 || !Array.isArray(value.files)) {
    return false;
  }
  const paths = new Set();
  return value.files.every(entry => {
    const valid = entry && typeof entry.path === 'string' && !paths.has(entry.path) &&
      BLOB_SHA.test(entry.sha) && Number.isInteger(entry.size) &&
      entry.size >= 0 && entry.size <= MAX_FILE_BYTES;
    paths.add(entry?.path);
    return valid;
  });
}

function isExactRange(manifest, from, to) {
  return manifest?.from === from && manifest?.to === to;
}

function isExactBatch(data, requested, commitSha) {
  return data && data.commitSha === commitSha && Array.isArray(data.files) &&
    data.files.length === requested.length && data.files.every((candidate, index) => (
      candidate && candidate.path === requested[index].path && candidate.sha === requested[index].sha &&
      typeof candidate.content === 'string'
    ));
}

function responseCode(response) {
  return response.status === 409 ? 'stale_manifest' : 'github_unavailable';
}

function staleOrThrow(previous, code) {
  if (!previous) throw new SyncError(code);
  return resultFrom(previous, [{ code }], false);
}

function resultFrom(record, warnings, changed) {
  return {
    files: record.files,
    warnings,
    commitSha: record.manifest.commitSha,
    manifestId: record.manifest.manifestId,
    changed
  };
}

function forwardAbort(signal, controller) {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => undefined;
  }
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
