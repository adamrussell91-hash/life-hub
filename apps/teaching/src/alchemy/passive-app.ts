import { apiGet, apiPost } from '@/api/client';
import { peekCurriculum } from '@/app/curriculum-state';
import { visitBlocks } from '@/blocks/walk-blocks';
import { blockRevision, type AlchemyEntity, type AlchemyResult } from './block-revision';

// Editors renew this on interaction. Due-soon work waits for the active editor.
const activeEditors=new Map<string,number>();
export function alchemyEditorActivity(key:string,active:boolean):void {if(active)activeEditors.set(key,Date.now()+300000);else activeEditors.delete(key);}
export function dueSoonAlchemyIds(entries:Array<{date:string;lesson_id:string}>,now=new Date(),timeZone='Australia/Sydney'):string[] {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=new Date(day+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+3);const last=end.toISOString().slice(0,10);
  return [...new Set(entries.filter(e=>e.date>=day&&e.date<=last).map(e=>e.lesson_id))];
}

/** One bounded visible-app queue; durable API limits remain authoritative across tabs. */
export function startPassiveAlchemyApp(authenticated:()=>boolean):()=>void {
  const assessed=new Map<string,Set<string>>();let nextAt=0,busy=false,disposed=false;let abort:AbortController|null=null;
  async function tick(){
    if(disposed||busy||!authenticated()||document.visibilityState!=='visible'||!navigator.onLine||Date.now()<nextAt||[...activeEditors.values()].some(until=>until>Date.now()))return;
    const curriculum=peekCurriculum();if(!curriculum)return;
    const ids=dueSoonAlchemyIds(curriculum.scheduled_lessons);
    const candidates=curriculum.lessons.filter(l=>ids.includes(l.id)&&l.status!=='trashed').slice(0,24);
    for(const lesson of candidates){
      const unit=curriculum.units.find(u=>u.id===lesson.unit_id);if(!unit||unit.status==='trashed')continue;
      const version=lesson.id+':'+lesson.updated_at+':'+unit.updated_at;
      const seen=assessed.get(version)??new Set<string>();if(seen.has('*'))continue;
      busy=true;abort=new AbortController();const timeout=setTimeout(()=>abort?.abort(),23000);
      try {
        const entity=await apiGet<AlchemyEntity>('/api/lessons/'+lesson.id,{signal:abort.signal});
        const blocks:string[]=[];let bytes=0;
        visitBlocks(entity.blocks||[],b=>{const n=new TextEncoder().encode(blockRevision(b)).length;if(!seen.has(b.id)&&n<=3500&&blocks.length<4&&bytes+n<=3500){blocks.push(b.id);bytes+=n;}});
        if(!blocks.length){seen.add('*');assessed.set(version,seen);continue;}
        if(document.visibilityState!=='visible'||disposed)return;
        const result=await apiPost<AlchemyResult>('/api/alchemy-blocks',{kind:'lesson',id:lesson.id,blocks,mode:'passive'},{signal:abort.signal});
        for(const id of result.assessed)seen.add(id);assessed.set(version,seen);
        // Store only the latest lesson result for the editor to consume. Bound storage.
        try {sessionStorage.setItem('alchemy-due:'+lesson.id,JSON.stringify({version,result}));}catch{/* Storage pressure must not trigger retries. */}
        if(assessed.size>128)assessed.delete(assessed.keys().next().value!);
        nextAt=Date.now()+180000;break;
      }catch(error){const e=error as {code?:string;details?:{retryAfterMs?:number}};nextAt=Date.now()+Math.max(e.details?.retryAfterMs||0,['unauthenticated','alchemy_unconfigured'].includes(e.code||'')?86400000:300000);break;}
      finally{clearTimeout(timeout);abort=null;busy=false;}
    }
  }
  const timer=setInterval(()=>{void tick();},30000);
  const visibility=()=>{if(document.visibilityState!=='visible')abort?.abort();};document.addEventListener('visibilitychange',visibility);
  return ()=>{disposed=true;clearInterval(timer);abort?.abort();document.removeEventListener('visibilitychange',visibility);};
}
