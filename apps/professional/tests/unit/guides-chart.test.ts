import { describe, expect, it, vi } from 'vitest';
import { createContinuumChart } from '@/guides/continuum-chart';
import { motivationSdt as g } from '@/guides/motivation-sdt';

const values = { amotivation: 1, external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 };

describe('continuum chart', () => {
  it('draws a bar per scale at its value, inside its zone', () => {
    const chart = createContinuumChart(document, { scales: g.scales, values, lean: g.lean });
    const bars = [...chart.el.querySelectorAll<HTMLElement>('.guide-chart__bar')];
    expect(bars.map((b) => b.style.height)).toEqual(['10%', '30%', '70%', '50%', '20%', '20%']);
    expect(chart.el.querySelector('[data-scale="introjected"]')?.getAttribute('data-zone')).toBe('controlled');
    expect(chart.el.querySelectorAll('[role="slider"]').length).toBe(0);
  });

  it('places the lean pin from the guide’s lean', () => {
    const chart = createContinuumChart(document, { scales: g.scales, values: {}, lean: g.lean });
    expect((chart.el.querySelector('.guide-lean__pin') as HTMLElement).style.left).toBe('50%');
  });

  it('overlays history as dashed ghosts and a dated legend', () => {
    const chart = createContinuumChart(document, {
      scales: g.scales, values, lean: g.lean,
      history: [{ at: '2026-08-04T00:00:00.000Z', values: { external: 6 } }]
    });
    expect(chart.el.querySelectorAll('.guide-chart__ghost').length).toBe(6);
    expect(chart.el.querySelector('[data-scale="external"] .guide-chart__ghost')?.getAttribute('style')).toContain('60%');
    expect(chart.el.querySelector('.guide-legend')?.textContent).toContain('4 Aug');
  });

  it('editable: sliders move with keys and pointer, and report every change', () => {
    const onChange = vi.fn();
    const chart = createContinuumChart(document, { scales: g.scales, values, suggested: values, lean: g.lean, editable: true, onChange });
    const col = chart.el.querySelector<HTMLElement>('[data-scale="identified"]')!;
    expect(col.getAttribute('role')).toBe('slider');
    expect(col.getAttribute('aria-orientation')).toBe('vertical');
    col.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(chart.values().identified).toBe(6);
    expect(col.getAttribute('aria-valuenow')).toBe('6');
    expect(col.getAttribute('aria-valuetext')).toBe('6 of 10');
    col.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(chart.values().identified).toBe(10);
    col.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100, left: 0, right: 40, width: 40, x: 0, y: 0, toJSON: () => ({}) });
    col.dispatchEvent(new PointerEvent('pointerdown', { clientY: 80, bubbles: true }));
    expect(chart.values().identified).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ identified: 2 }));
    expect(chart.el.querySelectorAll('.guide-chart__sugg').length).toBe(6);
  });
});
