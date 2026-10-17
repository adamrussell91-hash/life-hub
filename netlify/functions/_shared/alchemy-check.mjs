import { getKnowledgePage } from './knowledge-data.mjs';
import { createHash } from 'node:crypto';
import { isDeletedRecord } from './record-liveness.mjs';
import { createAlchemyBudget, alchemyError } from './alchemy-budget.mjs';
import { boundedJson, buildAlchemyPrompt, completeAlchemy, parseAlchemyProposals, parseUnitNotes, alchemyQueryText } from './alchemy-analysis.mjs';
import { unitAwareSources, addUnitNotes, contextQueryText } from './alchemy-unit-notes.mjs';
import { canonical, contextSnapshot, findAlchemyBlock, blockRevision } from '../../../packages/alchemy/revisions.js';

/** Returned instead of a result when a cache miss should go to the background runner. */
export const DEFER = Symbol('alchemy-defer');
const jobKey = id => 'alchemy/v1/jobs/' + id;

export function validAlchemyBody(body) {
  return Boolean(body && ['lesson','unit'].includes(body.kind) && typeof body.id==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(body.id) && ['passive','manual'].includes(body.mode) && Array.isArray(body.blocks) && body.blocks.length>=1 && body.blocks.length<=4 && new Set(body.blocks).size===body.blocks.length && !body.blocks.some(id=>typeof id!=='string') && (body.instruction===undefined || (typeof body.instruction==='string' && body.instruction.length<=2000)));
}

/**
 * One Alchemy block check: validation, cache, then retrieval and Ann. Runs
 * inside a deadline; a failure releases the budget lease before it throws.
 */
export async function runAlchemyCheck({ body, env, store, deps = {}, deadlineMs, deferOnMiss = false }) {
  const controller=new AbortController(); let timer;
  const started=Date.now();
  const model=env.ALCHEMY_PASSIVE_MODEL||'claude-haiku-4-5-20251001';
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(alchemyError(504,'alchemy_timeout','Ann’s check took too long. Try again in a minute.',60000));},deadlineMs-15);});
  let budget,ticket;
  async function run() {
    const signal=controller.signal;
    const entity=await store.get((body.kind==='lesson'?'lessons/':'units/')+body.id,{type:'json',consistency:'strong'});
    if(!entity || isDeletedRecord(entity))throw alchemyError(404,'not_found','This lesson or unit is unavailable.');
    const unit=body.kind==='lesson'&&entity.unit_id?await store.get('units/'+entity.unit_id,{type:'json',consistency:'strong'}):null;
    if(body.kind==='lesson'&&entity.unit_id&&(!unit||isDeletedRecord(unit)))throw alchemyError(404,'not_found','This unit is unavailable.');
    let blocks=body.blocks.map(id=>findAlchemyBlock(entity.blocks,id));
    if(blocks.some(b=>!b))throw alchemyError(409,'alchemy_stale','A selected block changed. Open it again.');
    const context={entity:contextSnapshot(entity),unit:unit?contextSnapshot(unit):null};
    const contextRevision=createHash('sha256').update(canonical(context)).digest('hex');
    if (body.validateOnly === true) {
      if (!Array.isArray(body.sourceIds) || body.sourceIds.length > 6 || body.sourceIds.some(id=>typeof id!=='string')) throw alchemyError(400,'alchemy_input','Invalid source selection.');
      let valid=body.contextRevision===contextRevision;
      for(const id of body.sourceIds){signal.throwIfAborted();const source=await (deps.getSource??getKnowledgePage)(id,{env,fetchImpl:async(url,options={})=>(deps.fetchImpl??fetch)(url,{...options,signal})});if(!source||isDeletedRecord(source))valid=false;}
      return {valid};
    }
    const key=createHash('sha256').update(canonical({v:2,kind:body.kind,id:body.id,model,context,blocks,instruction:body.instruction||'',previous:body.previous||null})).digest('hex');
    budget=createAlchemyBudget(store,{now:deps.now,configuration:createHash('sha256').update(String(env.ANTHROPIC_API_KEY||'')+model).digest('hex')});
    const individualKey=b=>canonical({v:2,kind:body.kind,id:body.id,model,contextRevision,block:blockRevision(b)});
    // A background scan with no Knowledge match never asked Ann, so it cannot answer a teacher's click.
    const usable=r=>r&&(body.mode!=='manual'||r.mode!=='empty')?r:null;
    let cached=usable(await budget.cached(key));
    if(!cached && !body.instruction && !body.previous){
      const entries=(await Promise.all(blocks.map(b=>budget.cached(individualKey(b))))).map(usable);
      if(entries.every(Boolean))cached={proposals:entries.flatMap(r=>r.proposals),assessed:blocks.map(b=>b.id),contextRevision,mode:entries.some(r=>r.mode==='synthesis')?'synthesis':'empty'};
    }
    if(cached){
      const proposals=[];
      for(const proposal of cached.proposals){
        let live=true;
        for(const source of proposal.sources){signal.throwIfAborted();const page=await (deps.getSource??getKnowledgePage)(source.id,{env,fetchImpl:async(url,options={})=>(deps.fetchImpl??fetch)(url,{...options,signal})});if(!page||isDeletedRecord(page)){live=false;break;}}
        if(live)proposals.push(proposal);
      }
      return {...cached,proposals};
    }
    // The quick endpoint hands a cache miss to the background runner: the live 10s limit cannot fit retrieval and Ann.
    if(deferOnMiss)return DEFER;
    if(!env.ANTHROPIC_API_KEY)throw alchemyError(503,'alchemy_unconfigured','Alchemy Lab is not configured.');
    // Reserve before retrieval as well: an outage cannot cause unbounded archive requests.
    signal.throwIfAborted(); ticket=await budget.reserve({key,mode:body.mode}); signal.throwIfAborted();
    // The cache may have completed while this request waited for its lease.
    const completed=usable(await budget.cached(key));
    if(completed){await budget.finish(ticket,{usage:{input:0,output:0}});ticket=null;return completed;}
    const fetchImpl=async(url,options={})=>{
      signal.throwIfAborted(); const response=await (deps.fetchImpl??fetch)(url,{...options,signal});
      if(String(url).startsWith('https://api.github.com/'))return new Response(JSON.stringify(await boundedJson(response,2000000)),{status:response.status,headers:response.headers});
      return response;
    };
    const unitId=body.kind==='lesson'?entity.unit_id:entity.id;
    // Rank candidates against what the block is for (its lesson and unit), not only the words it shares.
    const query=alchemyQueryText(blocks)+' '+contextQueryText(entity,unit);
    const retrieve=deps.retrieve??unitAwareSources;
    let sources;
    if(body.mode==='manual'){
      // Knowledge search gets a slice of the window; Ann answers without it rather than not at all.
      const retrieval=new AbortController();const stop=()=>retrieval.abort();signal.addEventListener('abort',stop);let retrievalTimer;
      try {
        sources=await Promise.race([
          retrieve({store,env,fetchImpl,query,unitId,signal:retrieval.signal}),
          new Promise(resolve=>{retrievalTimer=setTimeout(()=>{retrieval.abort();resolve([]);},deps.retrievalMs??Math.min(6000,Math.floor(deadlineMs*0.35)));})
        ]);
      }catch{sources=[];}
      finally{clearTimeout(retrievalTimer);signal.removeEventListener('abort',stop);}
    }else sources=await retrieve({store,env,fetchImpl,query,unitId,signal});
    signal.throwIfAborted();
    let raw={proposals:[]},mode='empty';
    if(sources.length||body.mode==='manual'){
      // Full context is cached by revision; a deterministic compact view bounds prompts.
      const compact=e=>({title:e.title,description:String(e.description||'').slice(0,400),outcome_ids:e.outcome_ids??e.syllabus_outcomes,pedagogical_mode:e.pedagogical_mode,outline:(e.blocks||[]).slice(0,12).map(b=>({id:b.id,type:b.block_type,text:JSON.stringify(b.content).slice(0,60)}))});
      const prompt=buildAlchemyPrompt({context:{entity:compact(entity),unit:unit?compact(unit):null},blocks,sources:sources.slice(0,24),instruction:body.instruction,previous:body.previous,mode:body.mode});
      raw=await (deps.complete??completeAlchemy)({prompt,env:{...env,ALCHEMY_PASSIVE_MODEL:model},fetchImpl,signal}); signal.throwIfAborted(); mode='synthesis';
    }
    const parsed=parseAlchemyProposals(raw,blocks,sources,contextRevision,{allowUncited:body.mode==='manual'});
    // Candidates come from a 15-minute index: re-read each cited note so a just-deleted one never becomes a suggestion.
    const citedIds=[...new Set(parsed.flatMap(p=>p.sources.map(s=>s.id)))];
    const liveIds=new Set((await Promise.all(citedIds.map(async id=>{const page=await (deps.getSource??getKnowledgePage)(id,{env,fetchImpl});return page&&!isDeletedRecord(page)?id:null;}))).filter(Boolean));
    signal.throwIfAborted();
    const proposals=parsed.filter(p=>p.sources.every(s=>liveIds.has(s.id)));
    const result={proposals,assessed:blocks.map(b=>b.id),contextRevision,mode};
    if(unitId){
      const why=new Map(proposals.flatMap(p=>p.sources.map(s=>[s.id,p.rationale])));
      const keep=[...proposals.flatMap(p=>p.sources).map(s=>({...s,why:why.get(s.id)})),...parseUnitNotes(raw,sources)];
      await addUnitNotes(store,unitId,keep).catch(()=>{});
      signal.throwIfAborted();
    }
    if(!body.instruction && !body.previous)for(const block of blocks){
      await budget.remember(individualKey(block),{...result,proposals:result.proposals.filter(p=>p.blockId===block.id),assessed:[block.id]});
      signal.throwIfAborted();
    }
    await budget.finish(ticket,{result,usage:raw.usage}); ticket=null; return result;
  }
  try { return await Promise.race([run(),timeout]); }
  catch(error){
    controller.abort();
    if(ticket&&budget){
      let cleanupTimer;
      await Promise.race([budget.finish(ticket,{error}).catch(()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,Math.max(1,deadlineMs-(Date.now()-started)));})]);
      clearTimeout(cleanupTimer);
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export function createAlchemyJob(store, job) {
  const id = globalThis.crypto.randomUUID();
  return store.setJSON(jobKey(id), { ...job, id, status: 'working', created_at: new Date().toISOString() }).then(() => id);
}
export async function readAlchemyJob(store, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return store.get(jobKey(id), { type: 'json', consistency: 'strong' });
}
export function finishAlchemyJob(store, job, outcome) {
  return store.setJSON(jobKey(job.id), { ...job, ...outcome, updated_at: new Date().toISOString() });
}
/** The error a client can show: status, code and Ann's message, never a stack. */
export function alchemyJobError(error) {
  const status=error?.status===429?429:error?.status>=400&&error?.status<600?error.status:502;
  return { status, code: error?.code||'alchemy_upstream', message: error?.message||'Alchemy Lab could not complete this check.', retryAfterMs: error?.retryAfterMs||0 };
}

/** Starts the background runner with the caller's session; a 202 means it started. */
export async function invokeAlchemyRun(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/alchemy-blocks/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id: jobId }),
    signal: AbortSignal.timeout(5_000)
  });
  return response.status === 202 || response.ok;
}
