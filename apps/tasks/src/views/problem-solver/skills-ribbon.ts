// apps/tasks/src/views/problem-solver/skills-ribbon.ts
// The thinking skills ribbon the landing pages share: one tally of the twelve skills across the
// coached tools, each bar split between this tool (in its own colour) and the others (grey, or
// each in its own colour when it names one), with a legend naming them all.
import { el } from '@/views/hub-kit';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../../packages/problem-solver/skills.mjs';
import type { PsSummary } from '../../../../../packages/problem-solver/types';

/** One tool's sessions. `colour` draws an other tool's share; without it the share is grey. */
export type RibbonSide = { name: string; sessions: PsSummary[]; colour?: string };

/** Skill id → times seen, summed over the sessions' turns. */
export function skillTotals(sessions: PsSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
  return totals;
}

/**
 * The ribbon and its legend. `here` is the page's own tool; `colour(i)` is the colour of its
 * share of skill `i`'s bar. `other` is the other tool, or the other tools in bar order.
 */
export function skillsRibbon(here: RibbonSide, other: RibbonSide | RibbonSide[], colour: (i: number) => string): HTMLElement {
  const others = Array.isArray(other) ? other : [other];
  const own = skillTotals(here.sessions);
  const theirs = others.map((side) => skillTotals(side.sessions));
  const count = (totals: Record<string, number>, id: string) => totals[id] ?? 0;
  const max = Math.max(1, ...SKILLS.map((skill) => count(own, skill.id) + theirs.reduce((sum, t) => sum + count(t, skill.id), 0)));
  const wrap = el('div', 'ps-ribbon');
  const legend = el('p', 'ps-ribbon__legend');
  const key = (name: string, c: string) => {
    const item = el('span', 'ps-ribbon__key', name);
    item.style.setProperty('--c', c);
    return item;
  };
  legend.append(key(here.name, colour(0)), ...others.map((side) => key(side.name, side.colour ?? 'var(--ps-other, #a9aa9f)')));
  const grid = el('ul', 'ps-skills');
  SKILLS.forEach((skill, i) => {
    const mine = count(own, skill.id);
    const elsewhere = theirs.map((t) => count(t, skill.id));
    const n = mine + elsewhere.reduce((sum, k) => sum + k, 0);
    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
    item.title = `${skill.description} ${here.name}: ${mine}.${others.map((side, k) => ` ${side.name}: ${elsewhere[k]}.`).join('')}`;
    const text = el('span', 'ps-skills__text');
    const bar = el('span', 'ps-skills__bar ps-skills__bar--split');
    const ownBar = el('i', 'ps-skills__own');
    ownBar.style.setProperty('--w', `${(mine / max) * 100}%`);
    ownBar.style.setProperty('--c', colour(i));
    bar.append(ownBar, ...others.map((side, k) => {
      const otherBar = el('i', 'ps-skills__other');
      otherBar.style.setProperty('--w', `${(elsewhere[k] / max) * 100}%`);
      if (side.colour) otherBar.style.setProperty('--c', side.colour);
      return otherBar;
    }));
    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
    item.append(skillGlyph(skill.id), text);
    grid.append(item);
  });
  wrap.append(legend, grid);
  return wrap;
}
