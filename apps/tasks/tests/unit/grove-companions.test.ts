import {describe,it,expect} from 'vitest';
import {companionEncounters} from '@/domain/grove/companions';
describe('earned companion encounters',()=>{
 it('never grants companions before the exact milestone date',()=>expect(companionEncounters([{species:'hare',earnedOn:'2026-10-12',baby:false,reason:''}],'2026-10-11')).toEqual([]));
 it('rotates at most two deterministic encounters and uses real water for otter',()=>{
 const earned=['fox','deer','hare','squirrel','robin','mallard'].map(species=>({species,earnedOn:'2026-01-01',baby:false,reason:''})) as any;
 const first=companionEncounters(earned,'2026-10-11');expect(first).toEqual(companionEncounters(earned,'2026-10-11'));expect(first).toHaveLength(2);
 const seen=new Set<string>();for(let i=1;i<=28;i++)for(const encounter of companionEncounters(earned,'2026-10-'+String(i).padStart(2,'0'))){seen.add(encounter.id);if(encounter.id==='animal-river-otter')expect(encounter.swimming).toBe(true);}
 expect(seen.size).toBe(8);
 });
});
