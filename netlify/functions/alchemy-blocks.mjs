import { getKnowledgePage } from './_shared/knowledge-data.mjs';
import { createHash } from 'node:crypto';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import { createAlchemyBudget, alchemyError } from './_shared/alchemy-budget.mjs';
import { boundedJson, retrieveAlchemySources, buildAlchemyPrompt, completeAlchemy, parseAlchemyProposals } from './_shared/alchemy-analysis.mjs';
import { canonical, contextSnapshot, findAlchemyBlock, blockRevision } from '../../packages/alchemy/revisions.js';

export const config={path:'/api/alchemy-blocks',timeout:26};
export function createAlchemyBlocksHandler(deps={}) {
  return createOperatorHandler(async(request,{env,store})=>{
    if(request.method!=='POST')return withCors(methodNotAllowed('POST, OPTIONS'),request,env);
    const controller=new AbortController(); let timer;
    const started=Date.now();
    const model=env.ALCHEMY_PASSIVE_MODEL||'claude-haiku-4-5-20251001';
    const configuredLimit=Number(env.ALCHEMY_FUNCTION_LIMIT_MS)||10000;
    const deadlineMs=deps.deadlineMs??Math.max(1000,Math.min(20000,configuredLimit-2000));
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(alchemyError(504,'alchemy_timeout','Ann’s check took too long. Try again later.',300000));},deadlineMs-15);});
    let budget,ticket;
    async function run() {
      const signal=controller.signal;
      let body; try { body=await boundedJson(new Response(request.body,{headers:request.headers}),16000); }catch{throw alchemyError(400,'alchemy_input','Choose up to four blocks for this check.');}
      if(!body || !['lesson','unit'].includes(body.kind) || typeof body.id!=='string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.id) || !['passive','manual'].includes(body.mode) || !Array.isArray(body.blocks) || body.blocks.length<1 || body.blocks.length>4 || new Set(body.blocks).size!==body.blocks.length || body.blocks.some(id=>typeof id!=='string') || (body.instruction!==undefined && (typeof body.instruction!=='string' || body.instruction.length>2000))) throw alchemyError(400,'alchemy_input','Choose up to four blocks and a shorter instruction.');
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
      const key=createHash('sha256').update(canonical({v:1,kind:body.kind,id:body.id,model,context,blocks,instruction:body.instruction||'',previous:body.previous||null})).digest('hex');
      budget=createAlchemyBudget(store,{now:deps.now,configuration:createHash('sha256').update(String(env.ANTHROPIC_API_KEY||'')+model).digest('hex')});
      const individualKey=b=>canonical({v:1,kind:body.kind,id:body.id,model,contextRevision,block:blockRevision(b)});
      let cached=await budget.cached(key);
      if(!cached && !body.instruction && !body.previous){
        const entries=await Promise.all(blocks.map(b=>budget.cached(individualKey(b))));
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
      if(!env.ANTHROPIC_API_KEY)throw alchemyError(503,'alchemy_unconfigured','Alchemy Lab is not configured.');
      // Reserve before retrieval as well: an outage cannot cause unbounded archive requests.
      signal.throwIfAborted(); ticket=await budget.reserve({key,mode:body.mode}); signal.throwIfAborted();
      // The cache may have completed while this request waited for its lease.
      const completed=await budget.cached(key);
      if(completed){await budget.finish(ticket,{usage:{input:0,output:0}});ticket=null;return completed;}
      const fetchImpl=async(url,options={})=>{
        signal.throwIfAborted(); const response=await (deps.fetchImpl??fetch)(url,{...options,signal});
        if(String(url).startsWith('https://api.github.com/'))return new Response(JSON.stringify(await boundedJson(response,2000000)),{status:response.status,headers:response.headers});
        return response;
      };
      const sources=await (deps.retrieve??retrieveAlchemySources)({store,env,fetchImpl,query:JSON.stringify(blocks)+' scaffolding differentiation learning outcomes',signal});
      signal.throwIfAborted();
      let raw={proposals:[]},mode='empty';
      if(sources.length){
        // Full context is cached by revision; a deterministic compact view bounds prompts.
        const compact=e=>({title:e.title,description:String(e.description||'').slice(0,400),outcome_ids:e.outcome_ids??e.syllabus_outcomes,pedagogical_mode:e.pedagogical_mode,outline:(e.blocks||[]).slice(0,12).map(b=>({id:b.id,type:b.block_type,text:JSON.stringify(b.content).slice(0,60)}))});
        const prompt=buildAlchemyPrompt({context:{entity:compact(entity),unit:unit?compact(unit):null},blocks,sources:sources.slice(0,6),instruction:body.instruction,previous:body.previous});
        raw=await (deps.complete??completeAlchemy)({prompt,env:{...env,ALCHEMY_PASSIVE_MODEL:model},fetchImpl,signal}); signal.throwIfAborted(); mode='synthesis';
      }
      const result={proposals:parseAlchemyProposals(raw,blocks,sources,contextRevision),assessed:blocks.map(b=>b.id),contextRevision,mode};
      signal.throwIfAborted();
      if(!body.instruction && !body.previous)for(const block of blocks){
        await budget.remember(individualKey(block),{...result,proposals:result.proposals.filter(p=>p.blockId===block.id),assessed:[block.id]});
        signal.throwIfAborted();
      }
      await budget.finish(ticket,{result,usage:raw.usage}); ticket=null; return result;
    }
    try { const data=await Promise.race([run(),timeout]);return withCors(okResponse(200,data),request,env); }
    catch(error){
      controller.abort();
      if(ticket&&budget){
        let cleanupTimer;
        await Promise.race([budget.finish(ticket,{error}).catch(()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,Math.max(1,deadlineMs-(Date.now()-started)));})]);
        clearTimeout(cleanupTimer);
      }
      const status=error.status===429?429:error.status>=400&&error.status<600?error.status:502;
      const response=errorResponse(status,error.code||'alchemy_upstream',error.message||'Alchemy Lab could not complete this check.',status>=500||status===429,{retryAfterMs:error.retryAfterMs||300000});
      if(error.retryAfterMs)response.headers.set('retry-after',String(Math.ceil(error.retryAfterMs/1000)));
      return withCors(response,request,env);
    } finally { clearTimeout(timer); }
  },deps);
}
export default createAlchemyBlocksHandler();
