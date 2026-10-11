import {describe, expect, it} from 'vitest';
import {fillBasins, sampleTerrain, terrainTile, streamCentre} from '@/domain/grove/terrain';
import {buildGrovePlan} from '@/domain/grove/plan';
describe('Grove terrain and hydrology', () => {
  it('fills a bowl to its lowest spill while preserving the original bed', () => {
    const bed = [5,5,3,5,5, 5,1,1,1,5, 5,1,-2,1,5, 5,1,1,1,5, 5,5,5,5,5];
    const result = fillBasins(bed,5,5);
    expect(result.level[12]).toBe(3);
    expect(result.level[6]).toBe(3);
    expect(bed[12]).toBe(-2);
    expect(result.downstream[12]).not.toBe(12);
  });
  it('has no drainage cycles, including perfectly flat land', () => {
    const result = fillBasins(Array(49).fill(0),7,7);
    for(let i=0;i<49;i++) {
      const seen = new Set<number>(); let next=i;
      while(next>=0) { expect(seen.has(next)).toBe(false); seen.add(next); next=result.downstream[next]!; }
    }
    expect(Math.max(...result.flow)).toBeGreaterThan(1);
  });
  it('the same world coordinate has the same terrain in every view', () => {
    expect(sampleTerrain(42,137.5)).toEqual(sampleTerrain(42,137.5));
    expect(terrainTile(5).bed).toEqual(terrainTile(5).bed);
  });
  it('has actual hills, wet depressions and flowing channels', () => {
    const tile=terrainTile(5);
    expect(Math.max(...tile.bed)-Math.min(...tile.bed)).toBeGreaterThan(2);
    expect(tile.wet.some(Boolean)).toBe(true);
    expect(tile.stream.some(Boolean)).toBe(true);
  });
  it('keeps the carved stream continuous between drainage cells', () => {
    for(let x=0;x<160;x+=.25) expect(sampleTerrain(x,streamCentre(x,5)).wet).toBe(true);
  });
  it('places tree trunks and ground cover above dry terrain', () => {
    const tasks=Array.from({length:60},(_,i)=>({id:String(i),status:'done',domain:['life','teaching','health'][i%3],completed_at:new Date(Date.UTC(2026,9,9,20, i*5)).toISOString()}));
    const p=buildGrovePlan({tasks,view:'week',anchor:'2026-10-10',now:new Date('2026-10-11T00:00:00Z')});
    for(const day of p.days) for(const item of [...day.trees,...day.props]) expect(sampleTerrain(day.cx+item.x,day.cz+item.z).wet).toBe(false);
  });
});
