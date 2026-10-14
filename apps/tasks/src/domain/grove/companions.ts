import { WILDLIFE_MODEL, type WildlifeMilestone, type WildlifeSpecies } from './wildlife';
import type { AnnualGrovePlan } from './annual-plan';
import type { RoamingEncounter } from './annual-roaming';
/** Companions inherit exact earned dates and use the matching species habitat. */
export const COMPANION_MODELS: Partial<Record<WildlifeSpecies, string[]>> = { fox: ['animal-forest-bear', 'animal-forest-boar', 'animal-forest-wolf'], deer: ['animal-deer-stag', 'animal-forest-moose'], hare: ['animal-skunk'], squirrel: ['animal-chipmunk'], robin: ['animal-raccoon'], mallard: ['animal-river-otter'] };
const ALTERNATES: Partial<Record<WildlifeSpecies, string[]>> = { deer: ['animal-forest-deer', 'animal-forest-stag'], fox: ['animal-forest-fox'], hare: ['animal-forest-rabbit'] };
const dateIndex = (day: string) => Math.floor(Date.parse(day + 'T12:00:00Z') / 86400000);
const positiveModulo = (index: number, length: number) => ((index % length) + length) % length;
export function companionEncounters(earned: readonly WildlifeMilestone[], day: string) {
    const candidates = earned.filter(m => m.earnedOn <= day).flatMap(m => (COMPANION_MODELS[m.species] ?? []).map(id => ({ id, species: id === 'animal-raccoon' ? 'squirrel' as const : m.species, swimming: id === 'animal-river-otter', earnedOn: m.earnedOn, reason: m.reason, baby: false })));
    if (!candidates.length)
        return [];
    const start = positiveModulo(dateIndex(day), candidates.length);
    return [candidates[start]!, ...(candidates.length > 1 ? [candidates[positiveModulo(start + 1, candidates.length)]!] : [])];
}
export function annualEncounters(plan: AnnualGrovePlan, focusKey?: string): (RoamingEncounter & {
    companion: boolean;
})[] {
    const wide = plan.view === 'year' || plan.view === 'term', day = wide ? (plan.to < plan.today ? plan.to : plan.today) : (plan.days.find(d => d.key === focusKey) ?? plan.days.find(d => d.today) ?? plan.days[0])?.key;
    if (!day || !wide && plan.days.find(d => d.key === day)?.future)
        return [];
    const earned = (plan.wildlifeAt?.(day) ?? plan.wildlife).filter(m => m.earnedOn <= day), index = dateIndex(day);
    const parents = earned.map(m => { const models = [WILDLIFE_MODEL[m.species], ...(wide ? ALTERNATES[m.species] ?? [] : [])]; return { ...m, id: models[positiveModulo(index, models.length)]!, swimming: m.species === 'mallard', companion: false }; });
    return [...parents, ...companionEncounters(earned, day).map(e => ({ ...e, companion: true }))];
}
