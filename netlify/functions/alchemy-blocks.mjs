import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { readAlchemyJob } from './_shared/alchemy-check.mjs';

export const config={path:'/api/alchemy-blocks',timeout:26};

/**
 * Polling for Alchemy Lab's unit-notes scans (`GET ?job=`). Ann's block and
 * lesson reviews moved to `/api/alchemy-agent`.
 */
export function createAlchemyBlocksHandler(deps={}) {
  return createOperatorHandler(async(request,{env,store})=>{
    if(request.method!=='GET')return withCors(methodNotAllowed('GET, OPTIONS'),request,env);
    const job=await readAlchemyJob(store,new URL(request.url).searchParams.get('job'));
    if(!job)return withCors(errorResponse(404,'not_found','That check is no longer available.',false),request,env);
    return withCors(okResponse(200,{job:job.id,type:job.type,status:job.status,result:job.result,error:job.error}),request,env);
  },deps);
}
export default createAlchemyBlocksHandler();
