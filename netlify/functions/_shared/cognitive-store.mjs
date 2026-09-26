import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { umbrellaSessionSecret } from './http.mjs';
import { knowledgeR2Config } from './knowledge-r2.mjs';

const PREFIX = 'cognitive-protocols/v1';

function keyFor(owner, id) {
  return `${PREFIX}/${encodeURIComponent(owner)}/${id}.json`;
}

function indexKeyFor(owner, id) {
  return `${PREFIX}/${encodeURIComponent(owner)}/index/${id}.json`;
}

function indexPrefix(owner) {
  return `${PREFIX}/${encodeURIComponent(owner)}/index/`;
}

function etagOf(value) {
  return `"${randomUUID()}"`;
}

export function sessionIndexRow(value) {
  return {
    id: value.id,
    protocolId: value.protocolId,
    mode: value.mode,
    status: value.status,
    stage: value.stage,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt || null,
    title: value.summary?.title || value.intake?.task || value.intake?.focus || value.intake?.claim || value.protocolId,
    summary: typeof value.summary?.summary === 'string'
      ? value.summary.summary
      : (typeof value.summary?.keyFinding === 'string' ? value.summary.keyFinding : (typeof value.summary === 'string' ? value.summary : null))
  };
}

export function createMemoryCognitiveStore() {
  const rows = new Map();
  return {
    async read(owner, id) {
      const row = rows.get(keyFor(owner, id));
      return row ? { value: structuredClone(row.value), etag: row.etag } : null;
    },
    async write(owner, id, value, expectedEtag) {
      const key = keyFor(owner, id);
      const prior = rows.get(key);
      if (expectedEtag === null ? Boolean(prior) : prior?.etag !== expectedEtag) return null;
      const next = { value: structuredClone(value), etag: etagOf(value) };
      rows.set(key, next);
      return { value: structuredClone(next.value), etag: next.etag };
    },
    async list(owner, limit = 1000, offset = 0) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${PREFIX}/${encodeURIComponent(owner)}/`) && !key.includes('/index/'))
        .map(([, row]) => ({ value: structuredClone(row.value), etag: row.etag }))
        .sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)))
        .slice(offset, offset + limit);
    },
    async delete(owner, id) {
      rows.delete(keyFor(owner, id));
    }
  };
}

async function bodyText(body) {
  if (typeof body?.transformToString === 'function') return body.transformToString();
  if (typeof body?.text === 'function') return body.text();
  const chunks = [];
  for await (const chunk of body ?? []) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function encrypt(value, secret) {
  if (!secret) return JSON.stringify(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

function decrypt(text, secret) {
  const parsed = JSON.parse(text);
  if (!parsed?.v) return parsed;
  if (!secret) throw new Error('Protocol session encryption is not configured.');
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}

export function createR2CognitiveStore({ client, bucket, encryptionSecret = '' }) {
  if (!client || !bucket) throw new TypeError('R2 client and bucket are required.');
  async function putIndex(owner, value) {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: indexKeyFor(owner, value.id),
      Body: encrypt(sessionIndexRow(value), encryptionSecret),
      ContentType: 'application/json'
    }));
  }
  return {
    async read(owner, id) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: keyFor(owner, id) }));
        return { value: decrypt(await bodyText(result.Body), encryptionSecret), etag: result.ETag };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async write(owner, id, value, expectedEtag) {
      try {
        const input = {
          Bucket: bucket,
          Key: keyFor(owner, id),
          Body: encrypt(value, encryptionSecret),
          ContentType: 'application/json',
          ...(expectedEtag === null ? { IfNoneMatch: '*' } : { IfMatch: expectedEtag })
        };
        const result = await client.send(new PutObjectCommand(input));
        await putIndex(owner, value);
        return { value: structuredClone(value), etag: result.ETag };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 412) return null;
        throw error;
      }
    },
    async delete(owner, id) {
      // Index rows are deleted with the session so the Past runs list cannot retain orphans.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyFor(owner, id) }));
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: indexKeyFor(owner, id) }));
    },
    async list(owner, limit = 1000, offset = 0) {
      // Past runs list from encrypted per-session index objects under .../<owner>/index/.
      // Full session bodies stay out of the list path. Index rows are written on every
      // commit and deleted when the session is deleted.
      const keys = [];
      let ContinuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: indexPrefix(owner),
          ContinuationToken
        }));
        for (const item of page.Contents || []) {
          if (item?.Key) keys.push(item.Key);
        }
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);

      const rows = [];
      for (const Key of keys) {
        try {
          const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
          const value = decrypt(await bodyText(result.Body), encryptionSecret);
          if (value?.id) rows.push({ value, etag: result.ETag });
        } catch (error) {
          if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') continue;
          throw error;
        }
      }
      return rows
        .sort((a, b) => String(b.value.updatedAt || '').localeCompare(String(a.value.updatedAt || '')))
        .slice(offset, offset + limit);
    }
  };
}

export async function defaultGetCognitiveStore(env) {
  const config = knowledgeR2Config(env);
  if (!config) return null;
  const { S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  });
  const sessionSecret = umbrellaSessionSecret(env);
  const encryptionSecret = typeof sessionSecret === 'string' ? sessionSecret : '';
  if (Buffer.byteLength(encryptionSecret) < 32) return null;
  return createR2CognitiveStore({ client, bucket: config.bucket, encryptionSecret });
}
