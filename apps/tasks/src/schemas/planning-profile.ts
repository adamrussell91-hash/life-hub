import { z } from 'zod';
import { schemaVersion } from './task';

/** HH:mm window. Not a calendar event — a capacity constraint. */
export const TimeWindowSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  label: z.string().optional()
});

export const WeekdayWindowsSchema = z.object({
  mon: z.array(TimeWindowSchema).default([]),
  tue: z.array(TimeWindowSchema).default([]),
  wed: z.array(TimeWindowSchema).default([]),
  thu: z.array(TimeWindowSchema).default([]),
  fri: z.array(TimeWindowSchema).default([]),
  sat: z.array(TimeWindowSchema).default([]),
  sun: z.array(TimeWindowSchema).default([])
});

/**
 * Optional planning profile. Unset fields are not preferences.
 * Clare's 08:00–16:30 remains a labelled fallback, never silently saved here.
 */
export const PlanningProfileSchema = z.object({
  schema_version: schemaVersion,
  id: z.literal('default'),
  active_project_limit: z.number().int().positive().nullable().default(null),
  work_windows: WeekdayWindowsSchema.default({
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: []
  }),
  protected_windows: WeekdayWindowsSchema.default({
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: []
  }),
  deep_work_preference: z
    .object({
      target_blocks_per_week: z.number().int().nonnegative().nullable().default(null),
      min_block_minutes: z.number().int().positive().default(90)
    })
    .default({ target_blocks_per_week: null, min_block_minutes: 90 }),
  shutdown_preference: z
    .object({
      preferred_time: z.string().nullable().default(null),
      require_tomorrow_block: z.boolean().default(false)
    })
    .default({ preferred_time: null, require_tomorrow_block: false }),
  runway_buffer_minutes: z.number().int().nonnegative().nullable().default(null),
  updated_at: z.string().nullable().default(null)
});

export type PlanningProfile = z.infer<typeof PlanningProfileSchema>;
export type TimeWindow = z.infer<typeof TimeWindowSchema>;
export type WeekdayWindows = z.infer<typeof WeekdayWindowsSchema>;

export const DEFAULT_PLANNING_PROFILE: PlanningProfile = {
  schema_version: 1,
  id: 'default',
  active_project_limit: null,
  work_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  protected_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  deep_work_preference: { target_blocks_per_week: null, min_block_minutes: 90 },
  shutdown_preference: { preferred_time: null, require_tomorrow_block: false },
  runway_buffer_minutes: null,
  updated_at: null
};

export const PlanningProfileUpdateSchema = PlanningProfileSchema.partial().omit({
  schema_version: true,
  id: true
});
