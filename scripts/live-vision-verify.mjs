#!/usr/bin/env node
/**
 * Opt-in live Anthropic vision verification.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/live-vision-verify.mjs
 *
 * Without a key, prints a blocked notice and exits 0 (does not fail CI).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || '';
const expected = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/vision/nutrition-label.expected.json'), 'utf8')
);
const png = readFileSync(join(root, 'tests/fixtures/vision/nutrition-label.png'));
const scene = readFileSync(join(root, 'tests/fixtures/vision/scene-shapes.png'));

if (!key) {
  console.log('LIVE VISION VERIFICATION BLOCKED: ANTHROPIC_API_KEY unavailable.');
  process.exit(0);
}

const model = process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-5';

async function ask(imageBuf, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBuf.toString('base64')
            }
          },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  return (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function mustInclude(text, needle, label) {
  if (!String(text).toLowerCase().includes(String(needle).toLowerCase())) {
    throw new Error(`Missing ${label}: expected to find ${needle}`);
  }
}

const labelText = await ask(
  png,
  [
    'You are Brisket inspecting a nutrition label image.',
    'Extract product name and Energy/Protein/Fat/Carbohydrate/Sodium/serving size exactly as printed.',
    'Reply with plain text including each value and unit.'
  ].join(' ')
);

mustInclude(labelText, expected.product, 'product');
mustInclude(labelText, String(expected.energy_kJ), 'energy_kJ');
mustInclude(labelText, String(expected.protein_g), 'protein_g');
mustInclude(labelText, String(expected.fat_g), 'fat_g');
mustInclude(labelText, String(expected.carbohydrate_g), 'carbohydrate_g');
mustInclude(labelText, String(expected.sodium_mg), 'sodium_mg');
mustInclude(labelText, String(expected.serving_size_g), 'serving_size_g');

const sceneText = await ask(
  scene,
  'Describe the main shapes and colours. Mention the red circle and blue rectangle if present.'
);
mustInclude(sceneText, 'red', 'scene red');
mustInclude(sceneText, 'blue', 'scene blue');
mustInclude(sceneText, 'circle', 'scene circle');

console.log('LIVE VISION VERIFICATION PASSED');
console.log('Label extraction excerpt:', labelText.slice(0, 500));
console.log('Scene excerpt:', sceneText.slice(0, 300));
