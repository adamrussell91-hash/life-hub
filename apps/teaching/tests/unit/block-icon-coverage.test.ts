import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEW_BLOCK_TYPES, EMBED_INSERT_PRESETS } from '@/blocks/create-block';
import { blockIconSrc } from '@/blocks/block-meta';

const publicDir = resolve(process.cwd(), 'public');
const offered = [...NEW_BLOCK_TYPES, ...EMBED_INSERT_PRESETS.map(p => p.value)];

describe('block icon coverage', () => {
  it('serves a real asset for every Teaching block and provider', () => {
    for (const type of offered) {
      expect(existsSync(resolve(publicDir, `.${blockIconSrc(type)}`)), type).toBe(true);
    }
    expect(existsSync(resolve(publicDir, 'assets/blocks/composition.svg'))).toBe(true);
  });

  it('serves every Tasks and Professional palette icon under each app base', () => {
    const source = readFileSync(resolve(process.cwd(), '../tasks/src/views/block-insert.ts'), 'utf8');
    const list = source.split('new Set([')[1].split(']);')[0];
    const types = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    for (const hub of ['tasks', 'professional']) {
      for (const type of offered.filter(t => types.includes(t) || t.startsWith('embed:'))) {
        expect(existsSync(resolve(process.cwd(), `../${hub}/public`, `.${blockIconSrc(type)}`)), `${hub}: ${type}`).toBe(true);
      }
    }
  });
});
