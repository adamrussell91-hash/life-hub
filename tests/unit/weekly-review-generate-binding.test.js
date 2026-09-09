/**
 * WR15 — Generate Confirm proposal must not reinterpret selection via the model.
 * LEVEL 2 wiring: onGenerateProposal calls clareWorkChat with exact ids; never streamChat.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const controllerPath = join(root, 'apps/tasks/src/chat/clare-controller.ts');
const chatApiPath = join(root, 'apps/tasks/src/services/chat-api.ts');

describe('WR15 Weekly Review Generate proposal model bypass', () => {
  it('controller generate path uses clareWorkChat with selected_changes, not streamChat prose', () => {
    const source = readFileSync(controllerPath, 'utf8');
    const generateIdx = source.indexOf('onGenerateProposal:');
    assert.ok(generateIdx > 0);
    const window = source.slice(generateIdx, generateIdx + 1800);

    assert.match(window, /clareWorkChat\s*\(/);
    assert.match(window, /selected_changes:\s*selected/);
    assert.match(window, /confirm:\s*true/);
    assert.match(window, /advance:\s*false/);
    assert.doesNotMatch(window, /\bsend\s*\(/);
    assert.doesNotMatch(window, /\bstreamChat\s*\(/);
    assert.doesNotMatch(window, /Generate the Weekly Review Confirm proposal/);
  });

  it('chat-api exposes /api/chat/clare-work structured invoke', () => {
    const source = readFileSync(chatApiPath, 'utf8');
    assert.match(source, /\/api\/chat\/clare-work/);
    assert.match(source, /async clareWork\(/);
    assert.match(source, /export function clareWorkChat/);
  });
});
