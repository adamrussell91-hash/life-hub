import type { WorkSession, WorkMode } from '@/schemas/work-session';
import type { WorkBlock } from '@/schemas/work-block';
import type { Task } from '@/schemas/task';

export type ThreefoldAudit = {
  period_start: string;
  period_end: string;
  total_sessions: number;
  classified_sessions: number;
  coverage_label: string;
  proportions: {
    predefined: { minutes: number; count: number; pct: number | null };
    reactive: { minutes: number; count: number; pct: number | null };
    defining: { minutes: number; count: number; pct: number | null };
  };
  sparse: boolean;
  sessions: Array<{
    id: string;
    work_mode: WorkMode | null;
    confidence: string;
    minutes: number;
  }>;
};

export function threefoldWorkAudit(
  sessions: WorkSession[],
  period: { start: string; end: string }
): ThreefoldAudit {
  const inPeriod = sessions.filter((s) => {
    const day = (s.started_at ?? '').slice(0, 10);
    return day >= period.start && day <= period.end;
  });
  const classified = inPeriod.filter(
    (s) => s.work_mode && s.work_mode_confidence !== 'unknown'
  );
  const sparse = classified.length < 3;

  const buckets: Record<WorkMode, { minutes: number; count: number }> = {
    predefined: { minutes: 0, count: 0 },
    reactive: { minutes: 0, count: 0 },
    defining: { minutes: 0, count: 0 }
  };
  let totalMins = 0;
  for (const s of classified) {
    const mins = s.actual_duration_minutes ?? 0;
    buckets[s.work_mode!]!.minutes += mins;
    buckets[s.work_mode!]!.count += 1;
    totalMins += mins;
  }

  const pct = (mins: number) =>
    totalMins > 0 ? Math.round((mins / totalMins) * 100) : null;

  return {
    period_start: period.start,
    period_end: period.end,
    total_sessions: inPeriod.length,
    classified_sessions: classified.length,
    coverage_label: `${classified.length} of ${inPeriod.length} recorded work sessions classified`,
    proportions: {
      predefined: {
        ...buckets.predefined,
        pct: pct(buckets.predefined.minutes)
      },
      reactive: { ...buckets.reactive, pct: pct(buckets.reactive.minutes) },
      defining: { ...buckets.defining, pct: pct(buckets.defining.minutes) }
    },
    sparse,
    sessions: inPeriod.map((s) => ({
      id: s.id,
      work_mode: s.work_mode,
      confidence: s.work_mode_confidence,
      minutes: s.actual_duration_minutes ?? 0
    }))
  };
}

/** Low-confidence inference only — never high confidence from a vague title. */
export function inferWorkMode(input: {
  explicit?: WorkMode | null;
  from_planning_workflow?: boolean;
  created_midday_interrupt?: boolean;
  title?: string;
}): { work_mode: WorkMode | null; confidence: 'explicit' | 'inferred' | 'unknown' } {
  if (input.explicit) return { work_mode: input.explicit, confidence: 'explicit' };
  if (input.from_planning_workflow) {
    return { work_mode: 'defining', confidence: 'inferred' };
  }
  if (input.created_midday_interrupt) {
    return { work_mode: 'reactive', confidence: 'inferred' };
  }
  void input.title;
  return { work_mode: null, confidence: 'unknown' };
}

export type PaceWeek = {
  week_start: string;
  planned_minutes: number;
  actual_minutes: number;
  deadline_count: number;
  deadline_dense: boolean;
  carry_forward: number;
};

export type NaturalPaceResult = {
  weeks: PaceWeek[];
  sparse: boolean;
  signals: string[];
  note: string;
};

export function naturalPaceAudit(input: {
  weeks: Array<{ start: string; end: string }>;
  blocks: WorkBlock[];
  sessions: WorkSession[];
  tasks: Task[];
  baseline_planned_minutes?: number | null;
}): NaturalPaceResult {
  if (input.weeks.length < 3) {
    return {
      weeks: [],
      sparse: true,
      signals: [],
      note: 'Insufficient weeks of evidence for pace analysis.'
    };
  }

  const weeks: PaceWeek[] = input.weeks.map((w) => {
    const planned = input.blocks
      .filter((b) => b.date >= w.start && b.date <= w.end && b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.duration_minutes, 0);
    const actual = input.sessions
      .filter((s) => {
        const day = (s.started_at ?? '').slice(0, 10);
        return day >= w.start && day <= w.end;
      })
      .reduce((sum, s) => sum + (s.actual_duration_minutes ?? 0), 0);
    const deadline_count = input.tasks.filter(
      (t) => t.due_date && t.due_date >= w.start && t.due_date <= w.end
    ).length;
    return {
      week_start: w.start,
      planned_minutes: planned,
      actual_minutes: actual,
      deadline_count,
      deadline_dense: deadline_count >= 5,
      carry_forward: 0
    };
  });

  const evidenceWeeks = weeks.filter((w) => w.planned_minutes + w.actual_minutes > 0);
  if (evidenceWeeks.length < 3) {
    return {
      weeks,
      sparse: true,
      signals: [],
      note: 'Sparse session and block data — no capacity threshold invented.'
    };
  }

  const baseline =
    input.baseline_planned_minutes ??
    Math.round(
      evidenceWeeks.reduce((s, w) => s + w.planned_minutes, 0) / evidenceWeeks.length
    );
  const signals: string[] = [];
  const highPlanned = evidenceWeeks.filter((w) => w.planned_minutes > baseline * 1.25);
  if (highPlanned.length >= 3) signals.push('sustained high planned load');
  const highActual = evidenceWeeks.filter((w) => w.actual_minutes > baseline * 1.25);
  if (highActual.length >= 3) signals.push('sustained high actual load');
  if (weeks.filter((w) => w.deadline_dense).length >= 2) {
    signals.push('deadline clusters');
  }
  const lowWeeks = evidenceWeeks.filter((w) => w.planned_minutes < baseline * 0.6);
  if (lowWeeks.length === 0 && evidenceWeeks.length >= 4) {
    signals.push('absence of lower intensity periods');
  }

  return {
    weeks,
    sparse: false,
    signals,
    note: signals.length
      ? `Pace signals: ${signals.join('; ')}.`
      : 'No sustained overload pattern against recent baseline.'
  };
}

export type AttentionPattern = {
  id: string;
  pattern: string;
  evidence_count: number;
  estimated_minutes: number | null;
  proposed_protocol: string;
};

export function attentionAudit(input: {
  sessions: WorkSession[];
  tasks: Task[];
  period: { start: string; end: string };
}): { patterns: AttentionPattern[]; insufficient: boolean; note: string } {
  const reactive = input.sessions.filter(
    (s) =>
      s.work_mode === 'reactive' &&
      (s.started_at ?? '').slice(0, 10) >= input.period.start &&
      (s.started_at ?? '').slice(0, 10) <= input.period.end
  );
  const comms = input.tasks.filter(
    (t) =>
      Array.isArray(t.tags) &&
      t.tags.includes('comms') &&
      (t.updated_at ?? '').slice(0, 10) >= input.period.start
  );
  const followUps = input.tasks.filter(
    (t) => t.follow_up_at && t.follow_up_at >= input.period.start && t.follow_up_at <= input.period.end
  );

  const patterns: AttentionPattern[] = [];
  if (reactive.length >= 3) {
    patterns.push({
      id: 'reactive_sessions',
      pattern: 'Repeated reactive work sessions',
      evidence_count: reactive.length,
      estimated_minutes: reactive.reduce((s, x) => s + (x.actual_duration_minutes ?? 0), 0),
      proposed_protocol: 'Batch reactive intake into one response window'
    });
  }
  if (comms.length >= 3) {
    patterns.push({
      id: 'comms_loop',
      pattern: 'Recurring communication tasks',
      evidence_count: comms.length,
      estimated_minutes: comms.reduce((s, t) => s + (t.estimated_duration ?? 15), 0),
      proposed_protocol: 'Establish a recurring follow-up sweep'
    });
  }
  if (followUps.length >= 3) {
    patterns.push({
      id: 'follow_up_churn',
      pattern: 'Repeated follow-up cycle',
      evidence_count: followUps.length,
      estimated_minutes: null,
      proposed_protocol: 'Create a single waiting sweep instead of ad-hoc pings'
    });
  }

  if (!patterns.length) {
    return {
      patterns: [],
      insufficient: true,
      note: 'Insufficient evidence for an attention protocol claim.'
    };
  }
  return {
    patterns,
    insufficient: false,
    note: `${patterns.length} attention pattern(s) with evidence.`
  };
}
