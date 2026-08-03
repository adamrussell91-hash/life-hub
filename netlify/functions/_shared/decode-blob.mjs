export function decodeBlob(blob) {
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null;
  const content = blob.content.replace(/\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(content, 'base64'));
  } catch {
    return null;
  }
}
