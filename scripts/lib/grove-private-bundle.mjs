import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const MAGIC=Buffer.from('GROVE1');
function keyBytes(key) {
  if(!/^[a-f0-9]{64}$/i.test(key??'')) throw Error('GROVE_ASSET_KEY must be a 32-byte hex key');
  return Buffer.from(key,'hex');
}
export function sealBundle(source,key) {
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),nonce);
  cipher.setAAD(MAGIC);
  const encrypted=Buffer.concat([cipher.update(source),cipher.final()]);
  return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),encrypted]);
}
export function openBundle(sealed,key) {
  if(sealed.length<34 || !sealed.subarray(0,6).equals(MAGIC)) throw Error('Invalid Grove bundle');
  const cipher=createDecipheriv('aes-256-gcm',keyBytes(key),sealed.subarray(6,18));
  cipher.setAAD(MAGIC);cipher.setAuthTag(sealed.subarray(18,34));
  return Buffer.concat([cipher.update(sealed.subarray(34)),cipher.final()]);
}
