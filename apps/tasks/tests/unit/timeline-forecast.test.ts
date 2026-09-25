import { describe, expect, it } from 'vitest';
import {
  domainP85,
  forecastReady,
  forecastSamples,
  milestoneTailDays,
  overrunDays,
  type ForecastTask
} from '@/domain/timeline-forecast';

const TEACHING = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.85, 1.95, 2.2];
const PROFESSIONAL = [1.05, 1.15, 1.25, 1.35, 1.45, 1.6, 1.8, 2.1];
const LIFE = [1.0, 1.1, 1.2, 1.3, 1.4, 1.7];

function history(): ForecastTask[] {
  const rows: ForecastTask[] = [];
  const push = (domain: string, ratios: number[]) => {
    ratios.forEach((ratio, index) => {
      rows.push({
        id: `${domain}-${index}`,
        domain,
        status: 'done',
        estimated_duration: 100,
        actual_duration: ratio * 100
      });
    });
  };
  push('teaching', TEACHING);
  push('professional', PROFESSIONAL);
  push('life', LIFE);
  return rows;
}

describe('forecast tails', () => {
  it('needs 20 finished tasks with both an estimate and an actual', () => {
    const samples = forecastSamples(history());
    expect(samples).toHaveLength(24);
    expect(forecastReady(samples)).toBe(true);
    expect(forecastReady(samples.slice(0, 19))).toBe(false);
  });

  it('ignores open tasks and finished tasks that have no actual', () => {
    const samples = forecastSamples([
      { id: 'a', domain: 'teaching', status: 'done', estimated_duration: 60, actual_duration: null },
      { id: 'b', domain: 'teaching', status: 'open', estimated_duration: 60, actual_duration: 90 },
      { id: 'c', domain: 'teaching', status: 'done', estimated_duration: 60, actual_duration: 120 }
    ]);
    expect(samples).toEqual([{ domain: 'teaching', ratio: 2 }]);
  });

  it('uses work-session minutes when the task has no actual_duration', () => {
    const samples = forecastSamples(
      [{ id: 'a', domain: 'life', status: 'done', estimated_duration: 40, actual_duration: null }],
      [
        { task_id: 'a', actual_duration_minutes: 30 },
        { task_id: 'a', actual_duration_minutes: 50 }
      ]
    );
    expect(samples).toEqual([{ domain: 'life', ratio: 2 }]);
  });

  it('takes the nearest-rank P85 by domain', () => {
    const samples = forecastSamples(history());
    expect(domainP85(samples, 'teaching')).toBe(1.95);
    expect(domainP85(samples, 'professional')).toBe(1.8);
    expect(domainP85(samples, 'life')).toBe(1.7);
    expect(domainP85(samples, 'missing')).toBeNull();
  });

  it('keeps a short overrun fractional and scales a milestone by one school week', () => {
    expect(overrunDays(90, 1.95)).toBeCloseTo(0.7125, 5);
    expect(milestoneTailDays(1.95)).toBeCloseTo(4.75, 5);
  });
});
