import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { scheduleTimetable } from './_shared/teaching-timetable-write.mjs';

export const config={path:'/api/classes/:classId/schedule-timetable',timeout:60};
export function createScheduleTimetableHandler(deps={}) {
  return createOperatorHandler(async(request,context)=>{
    const {env,store}=context;
    if(request.method!=='POST') return withCors(methodNotAllowed('POST, OPTIONS'),request,env);
    const parsed=await readJsonObject(request);
    if(parsed.error) return withCors(parsed.error,request,env);
    const classId=context.params?.classId ?? new URL(request.url).pathname.match(/\/classes\/([^/]+)\/schedule-timetable$/)?.[1];
    try {
      const result=await scheduleTimetable(store,classId,parsed.value);
      return withCors(okResponse(200,result),request,env);
    } catch(error) {
      return withCors(errorResponse(error.status ?? 500,error.code ?? 'schedule_failed',error.status ? error.message : 'Unable to finish scheduling. Retry to resume safely.',!error.status),request,env);
    }
  },deps);
}
export default createScheduleTimetableHandler();
