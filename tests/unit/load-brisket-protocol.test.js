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

test('protocol coaches eating psychology and environmental habit stacking, not just macros', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Psychology (&|and) behaviour/i);
  assert.match(text, /habit stacking/i);
  assert.match(text, /pre-made.{0,20}fridge|zero.effort|zero decision.making/i);
  assert.match(text, /capable of more/i);
});

test('protocol anticipates the Vyvanse eating baseline rather than treating it as news', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Known baseline/i);
  assert.match(text, /skipped breakfast\/lunch on a workday is the expected pattern/i);
});

test('protocol owns weekly challenge trackers instead of refusing a counter', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Weekly \/ challenge goals are yours|Weekly challenge trackers/i);
  assert.match(text, /upsert_nutrition_challenge/);
  assert.match(text, /mark_nutrition_challenge_day/);
  assert.match(text, /Never say you don't have a persistent counter|never say you don't have a persistent counter/i);
});

test('protocol defers longitudinal patterns to Hammond via Cross-Agent rather than self-computing trends', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Patterns are Hammond's job/i);
  assert.match(text, /Hammond→Brisket/);
  assert.match(text, /do not (guess at trends|fabricate a pattern)/i);
});

test('protocol requires iterative restaurant nutrition resolution instead of one-shot guessing', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Nutrition data resolution/i);
  assert.match(text, /retrieval pipeline|progressive fallback/i);
  assert.match(text, /official menu/i);
  assert.match(text, /venue and location/i);
  assert.match(text, /comparable/);
  assert.match(text, /Ask only for missing variables that materially affect/i);
  assert.match(text, /One miss is not permission to guess/i);
  assert.match(text, /Divide8|Butcher's Cut/);
  assert.doesNotMatch(text, /One solid Australian source is enough/);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadBrisketProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
