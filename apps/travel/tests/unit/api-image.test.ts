import { describe, expect, it } from 'vitest';
import { setApiImageSrc } from '@/api/config';

describe('setApiImageSrc', () => {
  it('asks for a credentialed CORS load before the request starts', () => {
    const img = document.createElement('img');
    let crossOriginWhenSrcSet: string | null | undefined;
    const proto = Object.getPrototypeOf(img) as HTMLImageElement;
    const srcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src')
      ?? Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(img, 'src', {
      configurable: true,
      get() {
        return srcDescriptor?.get?.call(img);
      },
      set(value: string) {
        // The API only serves requests that name their origin; a plain <img> names none.
        crossOriginWhenSrcSet = img.crossOrigin;
        srcDescriptor?.set?.call(img, value);
      },
    });

    setApiImageSrc(img, 'https://api.example/api/travel-photo?id=tph_x');

    expect(crossOriginWhenSrcSet).toBe('use-credentials');
    expect(img.getAttribute('src')).toBe('https://api.example/api/travel-photo?id=tph_x');
  });
});
