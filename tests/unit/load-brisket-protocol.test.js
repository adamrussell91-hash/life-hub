import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrisketProtocol } from '../../netlify/functions/_shared/load-brisket-protocol.mjs';

test('loads the checked-in Brisket protocol markdown', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Operating Manual|flare-up|Food Library/i);
  assert.match(text, /Logging protocol|Central Node after meal/i);
  assert.match(text, /compact verdict|on track/i);
  assert.match(text, /Corrections \(same slot\)|replace/i);
  assert.match(text, /Confirm card|awaiting confirm|not logged until/i);
  assert.match(text, /do not (say|claim).{0,40}logged/i);
  assert.match(text, /partial (panel|NIP|nutrition)|re-search|ask.{0,20}(label|wrapper)/i);
  assert.match(text, /do not (save|cache).{0,40}estimate/i);
  assert.match(text, /calcium_mg,? polyphenol_score,? and omega3 are all mandatory/i);
  assert.match(text, /category density estimate/i);
  assert.match(text, /high.{0,10}1,500 mg\+/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadBrisketProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
