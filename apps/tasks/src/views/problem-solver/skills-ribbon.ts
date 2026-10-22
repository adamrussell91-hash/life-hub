// apps/tasks/src/views/problem-solver/skills-ribbon.ts
// The thinking skills ribbon both landing pages share: one tally of the twelve skills across
// Problem Solver and Decision Maker, each bar split between this tool (in its own colour) and
// the other (grey), with a legend naming the two.
import { el } from '@/views/hub-kit';
import { skillGlyph } from '../../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../../packages/problem-solver/skills.mjs';
import type { PsSummary } from '../../../../../packages/problem-solver/types';

export type RibbonSide = { name: string; sessions: PsSummary[] };

/** Skill id → times seen, summed over the sessions' turns. */
export function skillTotals(sessions: PsSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
  return totals;
}

/**
 * The ribbon and its legend. `here` is the page's own tool; `colour(i)` is the colour of its
 * share of skill `i`'s bar. `other` is the other tool, drawn grey.
 */
export function skillsRibbon(here: RibbonSide, other: RibbonSide, colour: (i: number) => string): HTMLElement {
  const own = skillTotals(here.sessions);
  const theirs = skillTotals(other.sessions);
  const max = Math.max(1, ...SKILLS.map((skill) => (own[skill.id] ?? 0) + (theirs[skill.id] ?? 0)));
  const wrap = el('div', 'ps-ribbon');
  const legend = el('p', 'ps-ribbon__legend');
  const key = (name: string, c: string) => {
    const item = el('span', 'ps-ribbon__key', name);
    item.style.setProperty('--c', c);
    return item;
  };
  legend.append(key(here.name, colour(0)), key(other.name, 'var(--ps-other, #a9aa9f)'));
  const grid = el('ul', 'ps-skills');
  SKILLS.forEach((skill, i) => {
    const mine = own[skill.id] ?? 0;
    const elsewhere = theirs[skill.id] ?? 0;
    const n = mine + elsewhere;
    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
    item.title = `${skill.description} ${here.name}: ${mine}. ${other.name}: ${elsewhere}.`;
    const text = el('span', 'ps-skills__text');
    const bar = el('span', 'ps-skills__bar ps-skills__bar--split');
    const ownBar = el('i', 'ps-skills__own');
    ownBar.style.setProperty('--w', `${(mine / max) * 100}%`);
    ownBar.style.setProperty('--c', colour(i));
    const otherBar = el('i', 'ps-skills__other');
    otherBar.style.setProperty('--w', `${(elsewhere / max) * 100}%`);
    bar.append(ownBar, otherBar);
    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
    item.append(skillGlyph(skill.id), text);
    grid.append(item);
  });
  wrap.append(legend, grid);
  return wrap;
}
