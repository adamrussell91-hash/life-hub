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

export async function knowledgePresignPut(env, { key, contentType, signPut, expiresIn = 300 } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof signPut === 'function') return signPut({ ...config, key, contentType, expiresIn });
  const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  });
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export async function knowledgePresignGet(env, { key, signGet, expiresIn = 300 } = {}) {
  const config = knowledgeR2Config(env);
  if (!config) throw knowledgeR2Unbound();
  if (typeof signGet === 'function') return signGet({ ...config, key, expiresIn });
  const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  });
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn }
  );
}
