import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { umbrellaSessionSecret } from './http.mjs';
import { knowledgeR2Config } from './knowledge-r2.mjs';

const PREFIX = 'cognitive-protocols/v1';

function keyFor(owner, id) {
  return `${PREFIX}/${encodeURIComponent(owner)}/${id}.json`;
}

function etagOf(value) {
  return `"${randomUUID()}"`;
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
    async list(owner, limit = 50) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${PREFIX}/${encodeURIComponent(owner)}/`))
        .map(([, row]) => ({ value: structuredClone(row.value), etag: row.etag }))
        .sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)))
        .slice(0, limit);
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
        return { value: structuredClone(value), etag: result.ETag };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 412) return null;
        throw error;
      }
    },
    async list() {
      // Session discovery is deliberately kept out of a shared object bucket.
      // The client resumes opaque IDs it already owns; server-side listings can
      // be added once a private index has a separately reviewed retention policy.
      return [];
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
