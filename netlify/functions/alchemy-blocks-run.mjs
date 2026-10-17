/**
 * Background runner for Alchemy Lab jobs: Ann's block checks and unit-note
 * gathering. The quick endpoints enqueue a job and start this; it has minutes
 * rather than the 10s live limit, and writes the result or error onto the job
 * for the page to poll.
 */
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { readAlchemyJob, finishAlchemyJob, runAlchemyCheck, alchemyJobError } from './_shared/alchemy-check.mjs';
import { gatherUnitNotes } from './_shared/alchemy-gather.mjs';

export const config={path:'/api/alchemy-blocks/run',background:true};
/** Long enough for retrieval and a full answer from Ann; short enough that a stuck call ends. */
export const ALCHEMY_RUN_DEADLINE_MS=60_000;

export function createAlchemyBlocksRunHandler(deps={}) {
  return createOperatorHandler(async(request,{env,store})=>{
    if(request.method!=='POST')return withCors(methodNotAllowed('POST, OPTIONS'),request,env);
    const body=await request.json().catch(()=>({}));
    const job=await readAlchemyJob(store,body?.id);
    if(!job)return withCors(errorResponse(404,'not_found','Job not found',false),request,env);
    if(job.status!=='working')return withCors(okResponse(200,{job:job.id,status:job.status}),request,env);
    const deadlineMs=deps.deadlineMs??ALCHEMY_RUN_DEADLINE_MS;
    let outcome;
    try {
      const result=job.type==='gather'
        ?await (deps.gather??gatherUnitNotes)({unitId:job.unit,env,store,deps,deadlineMs})
        :await runAlchemyCheck({body:job.body,env,store,deps,deadlineMs});
      outcome={status:'done',result};
    }catch(error){
      outcome={status:'error',error:alchemyJobError(error)};
      // The page only shows Ann's message; the log keeps the cause so a failure can be traced.
      console.error('alchemy job failed',job.type,outcome.error.status,outcome.error.code,error?.message);
    }
    await finishAlchemyJob(store,job,outcome);
    return withCors(okResponse(200,{job:job.id,status:outcome.status}),request,env);
  },deps);
}
export default createAlchemyBlocksRunHandler();
