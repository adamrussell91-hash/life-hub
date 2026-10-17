import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { linkScheduledLesson } from './_shared/teaching-lesson-link.mjs';

export const config={path:'/api/scheduled-lessons/:id/link'};
export function createScheduledLessonLinkHandler(deps={}) {
  return createOperatorHandler(async(request,context)=>{
    const {env,store}=context;
    if(request.method!=='POST') return withCors(methodNotAllowed('POST, OPTIONS'),request,env);
    const parsed=await readJsonObject(request);
    if(parsed.error) return withCors(parsed.error,request,env);
    const id=context.params?.id ?? new URL(request.url).pathname.match(/\/scheduled-lessons\/([^/]+)\/link$/)?.[1];
    try {
      return withCors(okResponse(200,await linkScheduledLesson(store,decodeURIComponent(id ?? ''),parsed.value)),request,env);
    } catch(error) {
      return withCors(errorResponse(error.status ?? 500,error.code ?? 'link_failed',error.status ? error.message : 'Could not link this slot. Try again.',!error.status),request,env);
    }
  },deps);
}
export default createScheduledLessonLinkHandler();
