/// <reference lib="webworker" />
import {buildWorldResponse,type WorldRequest} from './world-protocol';

const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=(event:MessageEvent<WorldRequest>)=>{
  const response=buildWorldResponse(event.data);
  scope.postMessage(response.message,response.transfer);
};
