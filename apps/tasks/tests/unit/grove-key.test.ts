import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { animalGlyph, groveKey } from '@/views/grove/forest/key';
import { COMPANION_MODELS } from '@/domain/grove/companions';
import { WILDLIFE_MODEL, WILDLIFE_REASON, type WildlifeSpecies } from '@/domain/grove/wildlife';

const section = (title: string) => groveKey().find((s) => s.title === title)!;

describe('Grove key', () => {
  it('says how every earned animal is won, in the words the forest uses', () => {
    const animals = section('Animals').entries;
    const species = Object.keys(WILDLIFE_REASON) as WildlifeSpecies[];
    expect(animals).toHaveLength(species.length);
    for (const s of species) expect(animals.some((e) => e.meaning.startsWith(WILDLIFE_REASON[s]))).toBe(true);
    expect(animals.find((e) => e.name === 'Hare')!.meaning).toMatch(/young one/);
    expect(animals.find((e) => e.name === 'Fox')!.meaning).not.toMatch(/young one/);
  });

  it('says how often each animal comes again', () => {
    const animals = section('Animals').entries;
    expect(animals.find((e) => e.name === 'Hare')!.meaning).toContain('Another comes every 10th such day.');
    expect(animals.find((e) => e.name === 'Squirrel')!.meaning).toContain('Another comes with every 150 more.');
    expect(animals.find((e) => e.name === 'Fox')!.meaning).toContain('Another comes every term.');
  });

  it('names every companion and the animal it stays with', () => {
    const companions = section('Companions').entries;
    const models = Object.values(COMPANION_MODELS).flat();
    expect(companions.map((v) => v.name).join(' ')).toContain('Bear, Boar and Wolf');
    expect(companions.find((v) => v.name === 'Otter')!.meaning).toBe('Joins you for good with your first Mallard.');
    expect(models.every((m) => animalGlyph(m) !== '🐾')).toBe(true);
  });

  it('gives every animal model a picture', () => {
    for (const model of Object.values(WILDLIFE_MODEL)) expect(animalGlyph(model)).not.toBe('🐾');
    expect(animalGlyph('animal-unknown', 'owl')).toBe('🦉');
  });

  it('only points at preview pictures that ship', () => {
    const root = path.resolve(__dirname, '../../../life/assets/grove');
    const previews = groveKey().flatMap((s) => s.entries).flatMap((e) => (e.preview ? [e.preview] : []));
    expect(previews.length).toBeGreaterThan(6);
    for (const file of previews) expect(existsSync(path.join(root, file)), file).toBe(true);
  });
});
