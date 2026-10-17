import {describe,it,expect,afterEach} from 'vitest';
// Let the test worker flush progress between CPU-bound annual fixtures.
afterEach(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
import {calendarWeeks,regionForDate,validateRegions,type AnnualRegions} from '@/domain/grove/regions';
import {generateAnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {sampleGeography} from '@/domain/grove/geography';
import {annualWorld} from '../helpers/grove-annual';
// 2012 is the full-size world: 54 clipped weeks and a leap day ask the most of capacity.
const REAL_YEAR=2012;
describe('annual weekly geography',()=>{
 it('clips all Monday weeks, including the 54 portions in 2012',()=>{
  const weeks=calendarWeeks(2012);expect(weeks).toHaveLength(54);
  expect(weeks[0]).toMatchObject({monday:'2011-12-26',from:'2012-01-01',to:'2012-01-01'});
  expect(weeks[53]).toMatchObject({monday:'2012-12-31',from:'2012-12-31',to:'2012-12-31'});
  expect(new Set(weeks.map(w=>w.id)).size).toBe(54);
  expect(calendarWeeks(2013)[0]!.id).not.toBe(weeks[53]!.id);
  for(let t=Date.UTC(2012,0,1);t<=Date.UTC(2012,11,31);t+=86400000){const key=new Date(t).toISOString().slice(0,10);expect(weeks.filter(w=>key>=w.from&&key<=w.to)).toHaveLength(1);}
 });
 // Date lookup depends only on the calendar, so every boundary year is checked without a world.
 it.each([1900,2012,2024,2026,2027,2038,9999])('maps dates to clipped weeks for %i',year=>{
  const r={year,owner:new Int16Array(0),weeks:calendarWeeks(year)} as unknown as AnnualRegions;
  const week=regionForDate(r,`${year}-02-28`);expect(week).not.toBeNull();
  expect(regionForDate(r,`${year+1}-01-01`)).toBeNull();expect(regionForDate(r,`${year}-02-30`)).toBeNull();
  if(year===2012||year===2024)expect(regionForDate(r,`${year}-02-29`)).toBe(week);
 });
 it('makes safe connected capacity for a full-size world',()=>{
  const year=REAL_YEAR,world=annualWorld(year);validateRegions(world);
  const r=world.regions!;expect(r.year).toBe(year);expect(r.weeks).toHaveLength(calendarWeeks(year).length);
  expect(Math.min(...r.weeks.map(w=>w.sites.length))).toBeGreaterThanOrEqual(200);
  const adjacent=new Set<string>(),n=world.grid.size;for(let c=0;c<r.owner.length;c++)for(const j of [c%n<n-1?c+1:-1,c+n<r.owner.length?c+n:-1])if(j>=0&&r.owner[c]!>=0&&r.owner[j]!>=0&&r.owner[c]!==r.owner[j])adjacent.add([r.owner[c]!,r.owner[j]!].sort((a,b)=>a-b).join(':'));
  expect(r.weeks.slice(1).filter((_,i)=>adjacent.has(`${i}:${i+1}`)).length).toBeGreaterThanOrEqual(Math.ceil((r.weeks.length-1)*.8));
  expect(Math.max(...r.weeks.slice(1).map((b,i)=>Math.hypot(b.anchor.x-r.weeks[i]!.anchor.x,b.anchor.z-r.weeks[i]!.anchor.z)))).toBeLessThanOrEqual(world.grid.extent/2);
  const week=regionForDate(r,`${year}-02-28`);expect(week).toBeDefined();
  expect(regionForDate(r,`${year+1}-01-01`)).toBeNull();expect(regionForDate(r,`${year}-02-30`)).toBeNull();
  expect(regionForDate(r,`${year}-02-29`)).toBe(week);
  expect(r.weeks.flatMap(w=>w.sites.filter(s=>!(s.slope<=.5&&s.shoreDistance>=2&&r.owner[s.cell]===w.index)).map(s=>({week:w.index,...s})))).toEqual([]);
  const s=r.weeks[0]!.sites[0]!;expect(sampleGeography(world,s.x,s.z).regionId).toBe(r.weeks[0]!.id);
 },30000);
 it('reconstructs ownership and ordered sites deterministically',()=>{
  const a=annualWorld(REAL_YEAR),b=generateAnnualWorld(worldKeyForYear(REAL_YEAR));expect(a.regions).toEqual(b.regions);
  expect(a.bed.buffer).not.toBe(b.bed.buffer);expect(Object.isFrozen(a)).toBe(true);expect(Object.isFrozen(a.basins[0])).toBe(true);expect(Object.isFrozen(a.regions)).toBe(true);
  const invalid=structuredClone(a);invalid.regions!.owner[0]=99;expect(()=>validateRegions(invalid)).toThrow(/region/i);
 },30000);
});
