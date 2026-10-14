import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { animalGlyph, groveKey } from '@/views/grove/forest/key';
import { FOREST_WILDLIFE } from '@/domain/grove/forest-wildlife';

const section = (title: string) => groveKey().find((s) => s.title === title)!;

describe('Grove key', () => {
  const animals = () => ['Small animals', 'Medium animals', 'Large animals'].flatMap((t) => section(t).entries);

  it('lists every animal with the milestone that brings it, in the words the forest uses', () => {
    expect(animals()).toHaveLength(FOREST_WILDLIFE.length);
    for (const rule of FOREST_WILDLIFE) expect(animals().find((e) => e.name === rule.name)!.meaning.startsWith(rule.reason)).toBe(true);
    expect(animals().find((e) => e.name === 'Hare')!.meaning).toBe('A day with five finished tasks: one for every 4. Earn two and a young one follows the first.');
    expect(animals().find((e) => e.name === 'Raccoon')!.meaning).toBe('A completed competition brings one.');
    expect(animals().find((e) => e.name === 'Fox')!.meaning).not.toMatch(/young one/);
  });

  it('gives every animal a picture, and no section names a visitor or companion', () => {
    expect(FOREST_WILDLIFE.every((r) => animalGlyph(r.model) !== '🐾')).toBe(true);
    expect(groveKey().map((s) => s.title).join(' ')).not.toMatch(/Visitors|Companions/);
  });

  it('gives every animal model a picture', () => {
    expect(animalGlyph('animal-unknown', 'owl')).toBe('🦉');
  });

  it('only points at preview pictures that ship', () => {
    const root = path.resolve(__dirname, '../../../life/assets/grove');
    const previews = groveKey().flatMap((s) => s.entries).flatMap((e) => (e.preview ? [e.preview] : []));
    expect(previews.length).toBeGreaterThan(6);
    for (const file of previews) expect(existsSync(path.join(root, file)), file).toBe(true);
  });
});
