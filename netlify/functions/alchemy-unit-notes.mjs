import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { boundedJson } from './_shared/alchemy-analysis.mjs';
import { readUnitNotes, removeUnitNote, isSafeUnitId } from './_shared/alchemy-unit-notes.mjs';
import { gatherUnitNotes } from './_shared/alchemy-gather.mjs';
import { createAlchemyJob, invokeAlchemyRun, alchemyJobError } from './_shared/alchemy-check.mjs';

export const config={path:'/api/alchemy-unit-notes',timeout:26};
export { buildGatherPrompt } from './_shared/alchemy-gather.mjs';

/** List and prune a unit's notes; gathering runs as a background job the page polls via `GET /api/alchemy-blocks?job=`. */
export function createAlchemyUnitNotesHandler(deps={}) {
  return createOperatorHandler(async(request,{env,store})=>{
    const url=new URL(request.url);
    if(request.method==='GET'){
      const unitId=url.searchParams.get('unit');
      if(!isSafeUnitId(unitId))return withCors(errorResponse(400,'validation_error','Choose a unit.',false),request,env);
      return withCors(okResponse(200,{notes:(await readUnitNotes(store,unitId)).notes}),request,env);
    }
    if(request.method!=='POST')return withCors(methodNotAllowed('GET, POST, OPTIONS'),request,env);
    let body;try{body=await boundedJson(new Response(request.body,{headers:request.headers}),4000);}catch{body=null;}
    if(!body||!isSafeUnitId(body.unit))return withCors(errorResponse(400,'validation_error','Choose a unit.',false),request,env);
    if(typeof body.remove==='string'){
      const next=await removeUnitNote(store,body.unit,body.remove);
      return withCors(okResponse(200,{notes:next.notes}),request,env);
    }
    if(body.action!=='gather')return withCors(errorResponse(400,'validation_error','Unknown unit notes action.',false),request,env);
    const configuredLimit=Number(env.ALCHEMY_FUNCTION_LIMIT_MS)||10000;
    const deadlineMs=deps.deadlineMs??Math.max(1000,Math.min(20000,configuredLimit-2000));
    try{
      if(!deps.inline){
        const id=await createAlchemyJob(store,{type:'gather',unit:body.unit});
        if(await (deps.invokeRun??invokeAlchemyRun)(request,id).catch(()=>false))return withCors(okResponse(202,{job:id,status:'working'}),request,env);
      }
      return withCors(okResponse(200,await (deps.gather??gatherUnitNotes)({unitId:body.unit,env,store,deps,deadlineMs})),request,env);
    }catch(error){
      const e=alchemyJobError(error);
      return withCors(errorResponse(e.status,e.code,e.message,e.status>=500||e.status===429,{retryAfterMs:e.retryAfterMs}),request,env);
    }
  },deps);
}
export default createAlchemyUnitNotesHandler();
