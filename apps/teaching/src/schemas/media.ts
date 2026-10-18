import { z } from 'zod';
import { CommonFields, TrashFields } from './common';

export const MediaProviderSchema = z.enum(['external', 'google_drive', 'direct']);
export const MediaTypeSchema = z.enum(['pdf', 'image', 'video', 'link', 'other']);
export const MediaSharingSchema = z.enum([
  'public_link',
  'restricted',
  'unknown',
  'unavailable'
]);

export const MediaSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('media'),
  provider: MediaProviderSchema,
  media_type: MediaTypeSchema,
  mime_type: z.string().min(1).optional(),
  file_name: z.string().min(1).optional(),
  preview_url: z.string().min(1).optional(),
  download_url: z.string().min(1).optional(),
  thumbnail_url: z.string().min(1).optional(),
  provider_file_id: z.string().min(1).optional(),
  sharing: MediaSharingSchema.optional(),
  /** Resource Library folder; missing or null means Unfiled. */
  folder_id: z.string().min(1).nullish()
});

export const MediaFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parent_id: z.string().min(1).nullable()
});

/** Where a resource is used, computed server-side from lessons, units and classes. */
export const MediaUsageSchema = z.object({
  lesson_ids: z.array(z.string()),
  unit_ids: z.array(z.string()),
  class_ids: z.array(z.string())
});

export type Media = z.infer<typeof MediaSchema>;
export type MediaSharing = z.infer<typeof MediaSharingSchema>;
export type MediaFolder = z.infer<typeof MediaFolderSchema>;
export type MediaUsage = z.infer<typeof MediaUsageSchema>;
