import { z } from 'zod';
import { isHttpUrl } from '../blocks/url-safety';
import type { Media } from './media';

export const CoverSchema = z
  .object({
    url: z.string().min(1).optional(),
    media_id: z.string().min(1).optional(),
    alt_text: z.string().optional()
  })
  .superRefine((cover, ctx) => {
    if (!cover.url && !cover.media_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cover needs a url and/or media_id'
      });
    }
    if (cover.url !== undefined && !isHttpUrl(cover.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'Cover url must be http(s)'
      });
    }
  });

export type Cover = z.infer<typeof CoverSchema>;

/** Cover may be cleared with null on PATCH bodies. */
export const CoverPatchSchema = CoverSchema.nullable();

export function resolveCoverUrl(
  cover: Cover | null | undefined,
  mediaById?: ReadonlyMap<string, Media> | ReadonlyArray<Media>
): string | undefined {
  if (!cover) return undefined;

  if (cover.media_id && mediaById) {
    const media =
      'get' in mediaById
        ? mediaById.get(cover.media_id)
        : mediaById.find((entry) => entry.id === cover.media_id);
    const fromMedia =
      media?.preview_url ?? media?.thumbnail_url ?? media?.download_url;
    if (fromMedia && isHttpUrl(fromMedia)) return fromMedia;
  }

  if (cover.url && isHttpUrl(cover.url)) return cover.url;
  return undefined;
}

export function coverAltText(cover: Cover | null | undefined, fallback = ''): string {
  return cover?.alt_text?.trim() || fallback;
}
