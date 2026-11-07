import { describe, expect, it } from 'vitest';
import { renderScene, sceneForName } from '@/scenes';

const accent = { color: '#9fc5e8', soft: '#e8f1f8', ink: '#2b4a63' };

describe('sceneForName', () => {
  it('matches hand-drawn cities by name', () => {
    expect(sceneForName('Busan')).toBe('bus');
    expect(sceneForName('Jeju City')).toBe('jej');
    expect(sceneForName('Gyeongju')).toBe('gyj');
    expect(sceneForName('Sokcho')).toBe('sok');
    expect(sceneForName('Gangneung')).toBe('gng');
    expect(sceneForName('Incheon')).toBe('icn');
    expect(sceneForName('Somewhere Else')).toBe('generic');
    expect(sceneForName(undefined)).toBe('generic');
  });

  it('a city saved as generic still gets its drawn scene', () => {
    expect(renderScene('generic', accent, 'Busan')).toBe(renderScene('bus', accent));
    expect(renderScene('generic', accent, 'Nowhere')).toContain('gSky');
  });
});
