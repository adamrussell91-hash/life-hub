import { knowledgeR2Config } from './knowledge-r2.mjs';

export const MAX_JOURNAL_MEDIA_BYTES = 50 * 1024 * 1024;
export const JOURNAL_MEDIA_SIGN_EXPIRES_IN = 300;
export const DERIVATIVE_WIDTHS = new Set([320, 960, 1600]);

const TRIP_ID_RE = /^trp_[a-z0-9_]{4,64}$/i;
const MED_ID_RE = /^med_[a-z0-9_]{4,64}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function validationError(message) {
  return { error: message };
}

function normalizeContentType(contentType) {
  return String(contentType).split(';')[0].trim().toLowerCase();
}

function requireTripMediaIds(tripId, mediaId) {
  if (typeof tripId !== 'string' || !TRIP_ID_RE.test(tripId)) {
    return validationError('trip_id must be a trp_ id');
  }
  if (typeof mediaId !== 'string' || !MED_ID_RE.test(mediaId)) {
    return validationError('media_id must be a med_ id');
  }
  return null;
}

export function travelJournalR2Config(env) {
  return knowledgeR2Config(env);
}

export function travelJournalR2Unbound() {
  return Object.assign(new Error('Journal media storage is not configured'), {
    status: 503,
    code: 'travel_journal_r2_unbound'
  });
}

export function journalMediaOriginalKey(tripId, mediaId) {
  const idErr = requireTripMediaIds(tripId, mediaId);
  if (idErr) throw Object.assign(new Error(idErr.error), { code: 'validation_error' });
  return `travel/journal/${tripId}/${mediaId}/original`;
}

export function journalMediaDerivativeKey(tripId, mediaId, width) {
  const idErr = requireTripMediaIds(tripId, mediaId);
  if (idErr) throw Object.assign(new Error(idErr.error), { code: 'validation_error' });
  if (!DERIVATIVE_WIDTHS.has(width)) {
    throw Object.assign(new Error('derivative_width must be 320, 960, or 1600'), {
      code: 'validation_error'
    });
  }
  return `travel/journal/${tripId}/${mediaId}/der/${width}.jpg`;
}

export function resolveJournalMediaKey({ trip_id, media_id, purpose, derivative_width }) {
  if (purpose === 'original') return journalMediaOriginalKey(trip_id, media_id);
  if (purpose === 'derivative') return journalMediaDerivativeKey(trip_id, media_id, derivative_width);
  throw Object.assign(new Error('purpose must be original or derivative'), { code: 'validation_error' });
}

function parseCommonIds(raw) {
  const trip_id = typeof raw.trip_id === 'string' ? raw.trip_id.trim() : '';
  const media_id = typeof raw.media_id === 'string' ? raw.media_id.trim() : '';
  const idErr = requireTripMediaIds(trip_id, media_id);
  if (idErr) return idErr;
  return { trip_id, media_id };
}

function parseChecksum(raw) {
  const checksum = typeof raw.checksum === 'string' ? raw.checksum.trim().toLowerCase() : '';
  if (!SHA256_RE.test(checksum)) return validationError('checksum must be a sha256 hex string');
  return { checksum };
}

function parseByteSize(raw) {
  const byte_size = typeof raw.byte_size === 'number' ? raw.byte_size : NaN;
  if (!Number.isFinite(byte_size) || byte_size < 1) return validationError('byte_size required');
  if (byte_size > MAX_JOURNAL_MEDIA_BYTES) {
    return validationError('File exceeds 50MB journal media limit');
  }
  return { byte_size };
}

export function parseJournalMediaSignRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validationError('Invalid JSON');
  if (raw.action === 'verify') return parseJournalMediaVerifyRequest(raw);

  const ids = parseCommonIds(raw);
  if (ids.error) return ids;
  const size = parseByteSize(raw);
  if (size.error) return size;
  const sum = parseChecksum(raw);
  if (sum.error) return sum;

  const purpose = raw.purpose === 'derivative' ? 'derivative' : raw.purpose === 'original' ? 'original' : '';
  if (!purpose) return validationError('purpose must be original or derivative');

  const content_type = normalizeContentType(
    typeof raw.content_type === 'string' ? raw.content_type : ''
  );
  if (!IMAGE_TYPES.has(content_type)) return validationError('content_type not allowed');

  let derivative_width;
  if (purpose === 'derivative') {
    derivative_width =
      typeof raw.derivative_width === 'number'
        ? raw.derivative_width
        : typeof raw.width === 'number'
          ? raw.width
          : NaN;
    if (!DERIVATIVE_WIDTHS.has(derivative_width)) {
      return validationError('derivative_width must be 320, 960, or 1600');
    }
    if (content_type !== 'image/jpeg') {
      return validationError('derivatives must be image/jpeg');
    }
  }

  const key = resolveJournalMediaKey({
    trip_id: ids.trip_id,
    media_id: ids.media_id,
    purpose,
    derivative_width
  });

  return {
    value: {
      trip_id: ids.trip_id,
      media_id: ids.media_id,
      content_type,
      byte_size: size.byte_size,
      checksum: sum.checksum,
      purpose,
      derivative_width,
      key
    }
  };
}

export function parseJournalMediaVerifyRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validationError('Invalid JSON');
  const ids = parseCommonIds(raw);
  if (ids.error) return ids;
  const size = parseByteSize(raw);
  if (size.error) return size;
  const sum = parseChecksum(raw);
  if (sum.error) return sum;

  const if_version = typeof raw.if_version === 'string' ? raw.if_version.trim() : '';
  if (!if_version) return validationError('if_version required');

  const purpose = raw.purpose === 'derivative' ? 'derivative' : raw.purpose === 'original' ? 'original' : '';
  if (!purpose) return validationError('purpose must be original or derivative');

  let derivative_width;
  if (purpose === 'derivative') {
    derivative_width =
      typeof raw.derivative_width === 'number'
        ? raw.derivative_width
        : typeof raw.width === 'number'
          ? raw.width
          : NaN;
    if (!DERIVATIVE_WIDTHS.has(derivative_width)) {
      return validationError('derivative_width must be 320, 960, or 1600');
    }
  }

  const content_type =
    raw.content_type === undefined
      ? undefined
      : normalizeContentType(typeof raw.content_type === 'string' ? raw.content_type : '');
  if (content_type !== undefined && !IMAGE_TYPES.has(content_type)) {
    return validationError('content_type not allowed');
  }

  const key = resolveJournalMediaKey({
    trip_id: ids.trip_id,
    media_id: ids.media_id,
    purpose,
    derivative_width
  });

  return {
    value: {
      action: 'verify',
      trip_id: ids.trip_id,
      media_id: ids.media_id,
      byte_size: size.byte_size,
      checksum: sum.checksum,
      purpose,
      derivative_width,
      if_version,
      content_type: content_type ?? null,
      key
    }
  };
}

export function verifyHeadObject(head, expected) {
  if (!head || typeof head !== 'object') {
    return { ok: false, message: 'Object not found in storage' };
  }
  const contentLength = Number(head.contentLength ?? head.ContentLength);
  if (!Number.isFinite(contentLength) || contentLength !== expected.byte_size) {
    return { ok: false, message: 'Stored size does not match' };
  }
  const metadata = head.metadata ?? head.Metadata ?? {};
  const stored =
    typeof metadata.checksum === 'string'
      ? metadata.checksum.toLowerCase()
      : typeof metadata.sha256 === 'string'
        ? metadata.sha256.toLowerCase()
        : '';
  if (stored) {
    return stored === expected.checksum
      ? { ok: true }
      : { ok: false, message: 'Stored checksum does not match' };
  }
  const etag = String(head.etag ?? head.ETag ?? '').replace(/^"|"$/g, '');
  if (etag && etag.length === 32 && /^[a-f0-9]{32}$/i.test(etag) && etag.toLowerCase() === expected.checksum) {
    return { ok: true };
  }
  return { ok: false, message: 'Stored checksum does not match' };
}

function s3Client(config) {
  return import('@aws-sdk/client-s3').then(({ S3Client }) =>
    new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  );
}

export async function travelJournalPresignPut(
  env,
  { key, contentType, checksum, signPut, expiresIn = JOURNAL_MEDIA_SIGN_EXPIRES_IN } = {}
) {
  const config = travelJournalR2Config(env);
  if (!config) throw travelJournalR2Unbound();
  if (typeof signPut === 'function') {
    return signPut({ ...config, key, contentType, checksum, expiresIn });
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await s3Client(config);
  const metadata = checksum ? { checksum: String(checksum).toLowerCase() } : undefined;
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata
    }),
    { expiresIn }
  );
}

export async function travelJournalPresignGet(
  env,
  { key, signGet, expiresIn = JOURNAL_MEDIA_SIGN_EXPIRES_IN } = {}
) {
  const config = travelJournalR2Config(env);
  if (!config) throw travelJournalR2Unbound();
  if (typeof signGet === 'function') return signGet({ ...config, key, expiresIn });
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await s3Client(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn }
  );
}

export async function travelJournalHeadObject(env, { key, headObject } = {}) {
  const config = travelJournalR2Config(env);
  if (!config) throw travelJournalR2Unbound();
  if (typeof headObject === 'function') return headObject({ ...config, key });
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await s3Client(config);
  try {
    const out = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return {
      contentLength: out.ContentLength,
      etag: out.ETag,
      metadata: out.Metadata ?? {}
    };
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}
