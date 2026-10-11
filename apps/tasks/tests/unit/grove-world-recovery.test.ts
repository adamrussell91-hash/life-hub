import {it,expect,vi,afterEach} from 'vitest';
import * as heightfield from '@/domain/grove/heightfield';
import {generateAnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
// Recovery exercises several complete annual generation attempts.
vi.setConfig({testTimeout:30000});
const original=heightfield.generateHeightfield;
const flat=(key:Parameters<typeof original>[0])=>{const f=original(key);return {...f,bed:new Float32Array(f.bed.length).fill(8)};};
afterEach(()=>vi.restoreAllMocks());
it('uses a deterministic second attempt when the first has no lake',()=>{
 vi.spyOn(heightfield,'generateHeightfield').mockImplementation((key,attempt=0)=>attempt===0?flat(key):original(key,attempt));
 const w=generateAnnualWorld(worldKeyForYear(2027));expect(w.generation).toEqual({attempt:1,fallback:false,hydrologyVersion:1});expect(w.hydrology.quality.substantialLakes).toBeGreaterThan(0);
 expect(w.bed).toEqual(original(worldKeyForYear(2027),1).bed);
});
it('uses the verified fallback after bounded unsuitable attempts, retaining the requested identity',()=>{
 vi.spyOn(heightfield,'generateHeightfield').mockImplementation((key,attempt=0)=>key.year===2026?original(key,attempt):flat(key));
 const w=generateAnnualWorld(worldKeyForYear(2027));expect(w.key.year).toBe(2027);expect(w.identity).toBe('grove-world:2027:v1');expect(w.generation).toEqual({attempt:3,fallback:true,hydrologyVersion:1});expect(w.bed).toEqual(original(worldKeyForYear(2026)).bed);
});
it('fails explicitly if the verified fallback can no longer satisfy quality',()=>{
 vi.spyOn(heightfield,'generateHeightfield').mockImplementation(key=>flat(key));expect(()=>generateAnnualWorld(worldKeyForYear(2027))).toThrow(/fallback failed/i);
});
