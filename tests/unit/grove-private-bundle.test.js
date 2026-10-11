import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sealBundle,openBundle} from '../../scripts/lib/grove-private-bundle.mjs';
test('licensed bundle is authenticated, private and round trips without a source archive',()=>{
  const key=randomBytes(32).toString('hex'),source=Buffer.from('licensed animal model');
  const sealed=sealBundle(source,key);
  assert.equal(sealed.includes(source),false);
  assert.deepEqual(openBundle(sealed,key),source);
  assert.throws(()=>openBundle(sealed,randomBytes(32).toString('hex')));
  sealed[sealed.length-1]^=1;
  assert.throws(()=>openBundle(sealed,key));
});
