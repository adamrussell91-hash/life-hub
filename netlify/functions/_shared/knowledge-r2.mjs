export function knowledgeR2Config(env) {
  const accountId = typeof env?.R2_ACCOUNT_ID === 'string' ? env.R2_ACCOUNT_ID.trim() : '';
  const bucket = typeof env?.R2_BUCKET === 'string' ? env.R2_BUCKET.trim() : '';
  const accessKeyId = typeof env?.R2_ACCESS_KEY_ID === 'string' ? env.R2_ACCESS_KEY_ID.trim() : '';
  const secretAccessKey = typeof env?.R2_SECRET_ACCESS_KEY === 'string' ? env.R2_SECRET_ACCESS_KEY.trim() : '';
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

export function knowledgeR2Unbound() {
  return Object.assign(new Error('Attachment storage is not configured'), {
    status: 503,
    code: 'knowledge_r2_unbound'
  });
}

// R2 rejects the AWS SDK's default CRC32 checksum mode with 501 NotImplemented,
// which makes a presigned photo URL return XML instead of the JPEG.
export function knowledgeR2ClientOptions(config) {
  return {
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  };
}

export async function knowledgePresignPut(env, { key, contentType, signPut, expiresIn = 300 } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof signPut === 'function') return signPut({ ...config, key, contentType, expiresIn });
  const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client(knowledgeR2ClientOptions(config));
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

// Writes from the function, so the browser never needs the bucket's CORS rules.
export async function knowledgePutObject(env, { key, body, contentType, putObject } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof putObject === 'function') return putObject({ ...config, key, body, contentType });
  const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client(knowledgeR2ClientOptions(config));
  await client.send(
    new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType })
  );
}

// Reads from the function, for server-side copies between namespaces.
export async function knowledgeGetObject(env, { key, getObject } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof getObject === 'function') return getObject({ ...config, key });
  const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client(knowledgeR2ClientOptions(config));
  const out = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return Buffer.from(await out.Body.transformToByteArray());
}

// An object's size without reading it, so a copy can refuse one too large.
export async function knowledgeHeadObject(env, { key, headObject } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof headObject === 'function') return headObject({ ...config, key });
  const { HeadObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client(knowledgeR2ClientOptions(config));
  const out = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  return { size: out.ContentLength };
}

// The photo upload limit for the Food Journal and Travel; a bigger object is never read in.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const tooLarge = () => Object.assign(new Error('That photo is too large.'), { tooLarge: true });
// Reads a stored photo, refusing one over the limit before and after reading.
export async function readStoredPhoto(env, key, { getObject, headObject, maxBytes = MAX_PHOTO_BYTES } = {}) {
  const head = await knowledgeHeadObject(env, { key, headObject });
  if (Number(head?.size) > maxBytes) throw tooLarge();
  const bytes = await knowledgeGetObject(env, { key, getObject });
  if (bytes.length > maxBytes) throw tooLarge();
  return bytes;
}

export async function knowledgePresignGet(env, { key, signGet, expiresIn = 300 } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof signGet === 'function') return signGet({ ...config, key, expiresIn });
  const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client(knowledgeR2ClientOptions(config));
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn }
  );
}
