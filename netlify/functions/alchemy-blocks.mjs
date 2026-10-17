import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { alchemyError } from './_shared/alchemy-budget.mjs';
import { boundedJson } from './_shared/alchemy-analysis.mjs';
import { DEFER, validAlchemyBody, runAlchemyCheck, createAlchemyJob, readAlchemyJob, alchemyJobError, invokeAlchemyRun } from './_shared/alchemy-check.mjs';

export const config={path:'/api/alchemy-blocks',timeout:26};

function alchemyErrorResponse(error,request,env){
  const e=alchemyJobError(error);
  const response=errorResponse(e.status,e.code,e.message,e.status>=500||e.status===429,{retryAfterMs:e.retryAfterMs||300000});
  if(e.retryAfterMs)response.headers.set('retry-after',String(Math.ceil(e.retryAfterMs/1000)));
  return withCors(response,request,env);
}

/**
 * Quick front door for Ann's block checks. Validation, acceptance checks and
 * cached answers return at once; a cache miss becomes a job for the
 * background runner (`/api/alchemy-blocks/run`) because live functions stop
 * at 10s, and the page polls `GET ?job=` for Ann's answer.
 */
export function createAlchemyBlocksHandler(deps={}) {
  return createOperatorHandler(async(request,{env,store})=>{
    if(request.method==='GET'){
      const job=await readAlchemyJob(store,new URL(request.url).searchParams.get('job'));
      if(!job)return withCors(errorResponse(404,'not_found','That check is no longer available.',false),request,env);
      return withCors(okResponse(200,{job:job.id,type:job.type,status:job.status,result:job.result,error:job.error}),request,env);
    }
    if(request.method!=='POST')return withCors(methodNotAllowed('GET, POST, OPTIONS'),request,env);
    const configuredLimit=Number(env.ALCHEMY_FUNCTION_LIMIT_MS)||10000;
    const deadlineMs=deps.deadlineMs??Math.max(1000,Math.min(20000,configuredLimit-2000));
    try {
      let body; try { body=await boundedJson(new Response(request.body,{headers:request.headers}),16000); }catch{throw alchemyError(400,'alchemy_input','Choose up to four blocks for this check.');}
      if(!validAlchemyBody(body))throw alchemyError(400,'alchemy_input','Choose up to four blocks and a shorter instruction.');
      // deps.inline runs everything in this request (tests, local tools).
      const deferOnMiss=!deps.inline&&body.validateOnly!==true;
      let data=await runAlchemyCheck({body,env,store,deps,deadlineMs,deferOnMiss});
      if(data===DEFER){
        const id=await createAlchemyJob(store,{type:'block',body});
        const started=await (deps.invokeRun??invokeAlchemyRun)(request,id).catch(()=>false);
        if(started)return withCors(okResponse(202,{job:id,status:'working'}),request,env);
        // The runner could not start: try within this request rather than leave the teacher waiting on nothing.
        data=await runAlchemyCheck({body,env,store,deps,deadlineMs});
      }
      return withCors(okResponse(200,data),request,env);
    }catch(error){return alchemyErrorResponse(error,request,env);}
  },deps);
}
export default createAlchemyBlocksHandler();
