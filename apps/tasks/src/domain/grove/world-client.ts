import {validateWorldMeshes,type WorldMeshes} from './world-meshes';
import {acceptWorldResponse,type WorldRequest} from './world-protocol';
import {worldKeyForYear,type WorldKey} from './world-key';
import type {AnnualWorld} from './world';

export type WorldWorkerPort={
  onmessage:((event:MessageEvent<unknown>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  onmessageerror:((event:MessageEvent)=>void)|null;
  postMessage(value:WorldRequest):void;
  terminate():void;
};
export type WorldGeneration=Readonly<{world:AnnualWorld;meshes:WorldMeshes;generationMs:number}>;
type Pending={id:number;worker:WorldWorkerPort;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
const abort=()=>new DOMException('Annual world request cancelled','AbortError');
const nativeWorker=():WorldWorkerPort=>{
  if(typeof Worker==='undefined')throw new Error('Annual geography requires browser worker support');
  return new Worker(new URL('./world-worker.ts',import.meta.url),{type:'module'});
};

/** One active computation; terminated workers cannot deliver a later scene selection. */
export class AnnualWorldClient {
  private pending:Pending|null=null;
  private sequence=0;
  private disposed=false;
  constructor(private readonly createWorker:()=>WorldWorkerPort=nativeWorker){}

  generate(year:number):Promise<WorldGeneration> {
    let key:WorldKey;
    try {
      if(this.disposed)throw new Error('Annual world client is disposed');
      key=worldKeyForYear(year);
    } catch(error){return Promise.reject(error);}
    this.cancel();
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      let worker:WorldWorkerPort;
      try{worker=this.createWorker();}catch(error){reject(error);return;}
      const cleanup=()=>{
        if(this.pending?.id!==id)return;
        clearTimeout(this.pending.timer);
        worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
        worker.terminate();this.pending=null;
      };
      const fail=(error:Error)=>{if(this.pending?.id!==id)return;cleanup();reject(error);};
      const timer=setTimeout(()=>fail(new Error('Annual world generation timed out')),30000);
      this.pending={id,worker,reject,timer};
      worker.onmessage=event=>{
        if(this.pending?.id!==id)return;
        const data=event.data as {id?:number;type?:string;error?:unknown;world?:unknown;meshes?:unknown;generationMs?:unknown}|null;
        if(!data||typeof data!=='object'){fail(new Error('Invalid annual worker message'));return;}
        if(data.id!==id)return;
        if(data.type==='failure'){fail(new Error(typeof data.error==='string'?data.error:'Annual generation failed'));return;}
        try {
          if(data.type!=='success'||typeof data.generationMs!=='number'||!Number.isFinite(data.generationMs)||data.generationMs<0)throw new Error('Invalid annual worker result');
          const world=acceptWorldResponse(data.world,key),meshes=validateWorldMeshes(data.meshes,world);
          cleanup();resolve(Object.freeze({world,meshes,generationMs:data.generationMs}));
        }catch(error){fail(error instanceof Error?error:new Error('Invalid annual worker result'));}
      };
      worker.onerror=event=>{event.preventDefault?.();fail(new Error(event.message||'Annual world worker failed'));};
      worker.onmessageerror=()=>fail(new Error('Annual world worker message could not be read'));
      try{worker.postMessage({type:'generate',id,key});}catch(error){fail(error instanceof Error?error:new Error('Annual worker request failed'));}
    });
  }
  private cancel():void {
    const pending=this.pending;if(!pending)return;
    this.pending=null;clearTimeout(pending.timer);
    pending.worker.onmessage=null;pending.worker.onerror=null;pending.worker.onmessageerror=null;
    pending.worker.terminate();pending.reject(abort());
  }
  dispose():void {if(this.disposed)return;this.disposed=true;this.cancel();}
}
