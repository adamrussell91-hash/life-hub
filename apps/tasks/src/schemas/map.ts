import { z } from 'zod';
import { schemaVersion } from './task';

export const LineStrokeSchema = z.enum(['solid', 'dotted']);
export const YearTrackSchema = z.enum(['junior', 'rozelle', 'senior']);
export const ExtraYearTrackSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1)
});
export const MapPlanningSchema = z.enum(['planned', 'active']);
export const MapColorTokenSchema = z.enum([
  'blue',
  'yellow',
  'green',
  'purple',
  'wave',
  'success',
  'lilac',
  'high-sea',
  'high-sea-ink',
  'marine',
  'navy',
  'depth'
]);

export const PointSchema = z.object({
  x: z.number(),
  y: z.number()
});

function isOrthogonal(points: Array<{ x: number; y: number }>): boolean {
  if (points.length < 2) return false;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

export const LineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  letter: z.string().min(1).max(4),
  color: MapColorTokenSchema,
  points: z
    .array(PointSchema)
    .min(2)
    .refine(isOrthogonal, { message: 'Line points must be orthogonal' }),
  /** Standard year lines on this strand (Junior / Rozelle / Senior). Defaults to all three. */
  year_tracks: z.array(YearTrackSchema).min(1).optional(),
  /** Extra year lines beyond the standard three, e.g. Middle or Prep. */
  extra_tracks: z.array(ExtraYearTrackSchema).optional()
});

export const MapLinkSchema = z
  .object({
    type: z.enum(['project', 'excursion']),
    id: z.string().min(1)
  })
  .nullable()
  .default(null);

export const StationSchema = z.object({
  id: z.string().min(1),
  line_id: z.string().min(1),
  label: z.string().min(1),
  y: z.number(),
  height: z.number().positive().default(88),
  tracks: z.array(z.string().min(1)).min(1).default(['junior', 'rozelle', 'senior']),
  in_stroke: LineStrokeSchema.default('solid'),
  out_stroke: LineStrokeSchema.default('solid'),
  starts_on: z.string().nullable().default(null),
  ends_on: z.string().nullable().default(null),
  link: MapLinkSchema,
  planning: MapPlanningSchema.default('planned')
});

export const TickAttachSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('line'),
    line_id: z.string().min(1),
    y: z.number(),
    track: z.string().min(1).optional()
  }),
  z.object({
    kind: z.literal('station'),
    station_id: z.string().min(1),
    side: z.enum(['left', 'right']),
    offset: z.number().min(0).max(1).default(0.5)
  }),
  z.object({
    kind: z.literal('event'),
    event_id: z.string().min(1),
    side: z.enum(['left', 'right', 'top', 'bottom']).default('right')
  })
]);

export const TickSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  attach: TickAttachSchema,
  stroke: LineStrokeSchema.default('solid'),
  connects_to: z.string().nullable().default(null),
  starts_on: z.string().nullable().default(null),
  ends_on: z.string().nullable().default(null),
  link: MapLinkSchema,
  planning: MapPlanningSchema.default('planned')
});

export const TransitMapSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable().default(null),
  lines: z.array(LineSchema).default([]),
  stations: z.array(StationSchema).default([]),
  ticks: z.array(TickSchema).default([]),
  created_at: z.string(),
  updated_at: z.string()
});

export const TransitMapCreateSchema = TransitMapSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  year: true,
  lines: true,
  stations: true,
  ticks: true
}).extend({
  title: z.string().min(1)
});

export const TransitMapUpdateSchema = TransitMapCreateSchema.partial();

export type LineStroke = z.infer<typeof LineStrokeSchema>;
export type YearTrack = z.infer<typeof YearTrackSchema>;
export type ExtraYearTrack = z.infer<typeof ExtraYearTrackSchema>;
export type MapPlanning = z.infer<typeof MapPlanningSchema>;
export type MapColorToken = z.infer<typeof MapColorTokenSchema>;
export type Point = z.infer<typeof PointSchema>;
export type MapLine = z.infer<typeof LineSchema>;
export type MapStation = z.infer<typeof StationSchema>;
export type TickAttach = z.infer<typeof TickAttachSchema>;
export type MapTick = z.infer<typeof TickSchema>;
export type TransitMap = z.infer<typeof TransitMapSchema>;
export type MapLink = z.infer<typeof MapLinkSchema>;
