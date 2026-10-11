import {describe,it,expect,vi,afterEach} from 'vitest';
// Let the test worker flush progress between CPU-bound annual fixtures.
afterEach(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
import {AnnualWorldClient,type WorldWorkerPort} from '@/domain/grove/world-client';
import {generateAnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {buildWorldMeshes} from '@/domain/grove/world-meshes';
import {buildWorldResponse,worldTransferBuffers} from '@/domain/grove/world-protocol';
// Full annual terrain, regions and receipt validation run for these transport fixtures.
vi.setConfig({testTimeout:30000});

class Transport implements WorldWorkerPort {
 onmessage:WorldWorkerPort['onmessage']=null;onerror:WorldWorkerPort['onerror']=null;onmessageerror:WorldWorkerPort['onmessageerror']=null;
 request:any;terminated=false;autoValidate=true;
 postMessage(value:any){this.request=value;if(value.type==='validate'&&this.autoValidate)this.reply(buildWorldResponse(value).message);}
 terminate(){this.terminated=true;}
 reply(value:unknown){this.onmessage?.({data:value} as MessageEvent);}
 success(){const world=generateAnnualWorld(this.request.key);this.reply({type:'success',id:this.request.id,world,meshes:buildWorldMeshes(world),generationMs:12});}
}
function setup(){const ports:Transport[]=[];const client=new AnnualWorldClient(()=>{const port=new Transport();ports.push(port);return port;});return {client,ports};}

describe('annual worker protocol',()=>{
 it('generates the real field and transfers exclusive buffer ownership',()=>{
  const result=buildWorldResponse({type:'generate',id:1,key:worldKeyForYear(2026)});
  expect(result.message.type).toBe('success');expect(result.transfer.length).toBeGreaterThan(7);
  if(result.message.type==='success'){
   expect(result.transfer[0]).toBe(result.message.world.bed.buffer);
   expect(new Set(result.transfer).size).toBe(result.transfer.length);
   const meshOwnership=result.message.meshes.terrain[0]!.positions.buffer;expect(result.transfer.filter(b=>b===meshOwnership)).toHaveLength(1);
   const ownership=result.message.world.regions!.owner.buffer;expect(result.transfer.filter(b=>b===ownership)).toHaveLength(1);
   const received=structuredClone(result.message,{transfer:result.transfer});
   expect(result.message.world.regions!.owner.byteLength).toBe(0);expect(received.world.regions!.owner.length).toBe(66049);
   expect(result.message.meshes.terrain[0]!.positions.byteLength).toBe(0);expect(received.meshes.terrain[0]!.positions.length).toBe(32*32*18);
   expect(result.message.world.bed.byteLength).toBe(0);expect(received.world.bed.byteLength).toBe(264196);
   const buffers=worldTransferBuffers(received.world,received.meshes);expect(new Set(buffers).size).toBe(buffers.length);
   const request=structuredClone({type:'validate' as const,id:1,key:worldKeyForYear(2026),world:received.world,meshes:received.meshes,generationMs:received.generationMs},{transfer:buffers});
   expect(received.world.hydrology.bed.byteLength).toBe(0);expect(received.world.regions!.owner.byteLength).toBe(0);expect(received.meshes.water[0]!.positions.byteLength).toBe(0);
   const validated=buildWorldResponse(request);expect(validated.message.type).toBe('validated');
   if(validated.message.type==='validated'){const returned=structuredClone(validated.message,{transfer:validated.transfer});expect(validated.message.world.hydrology.bed.byteLength).toBe(0);expect(returned.world.hydrology.bed.length).toBe(66049);expect(returned.world.regions!.owner.length).toBe(66049);expect(returned.meshes.terrain[0]!.positions.length).toBe(32*32*18);expect(returned.meshes.water[0]!.positions.byteLength).toBeGreaterThan(0);}

  }
 });
 it('serialises invalid generation errors',()=>{
  const r=buildWorldResponse({type:'generate',id:9,key:{year:2026,generatorVersion:2}});
  expect(r.message).toMatchObject({type:'failure',id:9});expect(r.transfer).toEqual([]);
 });
});

describe('annual generation lifecycle',()=>{
 it('accepts and freezes a matching result, then releases the worker',async()=>{
  const {client,ports}=setup(),pending=client.generate(2026);ports[0]!.success();
  const delivery=await pending;expect(delivery.world.key.year).toBe(2026);expect(delivery.generationMs).toBe(12);expect(delivery.meshes.identity).toBe(delivery.world.identity);
  expect(Object.isFrozen(delivery.world)).toBe(true);expect(ports[0]!.terminated).toBe(true);client.dispose();
 });
 it('terminates superseded work and ignores already queued stale callbacks',async()=>{
  const {client,ports}=setup(),first=client.generate(2026);const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
  const stale=ports[0]!.onmessage!,second=client.generate(2027);
  expect(ports[0]!.terminated).toBe(true);
  stale({data:{type:'success',id:1,world:generateAnnualWorld(worldKeyForYear(2026)),generationMs:1}} as MessageEvent);
  ports[1]!.success();expect((await second).world.key.year).toBe(2027);await rejected;client.dispose();
 });
 it('ignores messages for a different request number',async()=>{
  const {client,ports}=setup(),pending=client.generate(2026);
  ports[0]!.reply({type:'failure',id:999,error:'stale'});ports[0]!.success();expect((await pending).world.key.year).toBe(2026);client.dispose();
 });
 it.each(['wrong-key','invalid-bed','invalid-summary','invalid-hydrology','cyclic-hydrology','invalid-channel-height','missing-regions','invalid-region-owner','invalid-region-capacity','invalid-region-site','missing-meshes','corrupt-mesh','unknown-type'])('rejects malformed %s output and releases resources',async(kind)=>{
  const {client,ports}=setup(),pending=client.generate(2026),world=generateAnnualWorld(worldKeyForYear(kind==='wrong-key'?2027:2026));
  let response:any={type:'success',id:ports[0]!.request.id,world:structuredClone(world),meshes:buildWorldMeshes(world),generationMs:1};
  if(kind==='invalid-bed')response.world.bed[0]=NaN;
  if(kind==='invalid-summary')response.world.summary.bedBytes=0;
  if(kind==='invalid-hydrology')response.world.hydrology.level[0]=NaN;
  if(kind==='cyclic-hydrology')response.world.hydrology.receiver[258]=258;
  if(kind==='invalid-channel-height')response.world.hydrology.channels.find((c:any)=>c.triangles.length>=9).triangles[1]=999;
  if(kind==='missing-regions')delete response.world.regions;
  if(kind==='invalid-region-owner')response.world.regions.owner[0]=32767;
  if(kind==='invalid-region-capacity')response.world.regions.weeks[0].sites.length=199;
  if(kind==='invalid-region-site')response.world.regions.weeks[0].sites[0].height+=1;
  if(kind==='missing-meshes')delete response.meshes;
  if(kind==='corrupt-mesh')response.meshes.terrain[0].positions[0]=NaN;
  if(kind==='unknown-type')response.type='surprise';
  ports[0]!.reply(response);await expect(pending).rejects.toThrow(/invalid/i);expect(ports[0]!.terminated).toBe(true);client.dispose();
 });
 it.each(['lake','channel'])('rejects missing %s triangles',async(kind)=>{
  const {client,ports}=setup(),pending=client.generate(2026),world=structuredClone(generateAnnualWorld(worldKeyForYear(2026)));
  const descriptors=kind==='lake'?world.hydrology.lakes:world.hydrology.channels;
  descriptors.find(c=>c.triangles.length>=9)!.triangles=new Float32Array();
  ports[0]!.reply({type:'success',id:ports[0]!.request.id,world,generationMs:1});
  expect(await pending.then(()=> 'accepted',()=> 'rejected')).toBe('rejected');client.dispose();
 });
 it.each(['failure','error','messageerror'])('rejects %s and terminates',async(kind)=>{
  const {client,ports}=setup(),pending=client.generate(2026),p=ports[0]!;
  if(kind==='failure')p.reply({type:'failure',id:p.request.id,error:'generation failed'});
  if(kind==='error')p.onerror?.({message:'runtime failed',preventDefault(){}} as ErrorEvent);
  if(kind==='messageerror')p.onmessageerror?.({} as MessageEvent);
  await expect(pending).rejects.toThrow();expect(p.terminated).toBe(true);client.dispose();
 });
 it('rejects setup and posting failures, and can recover on the next request',async()=>{
  let attempts=0;const port=new Transport();const client=new AnnualWorldClient(()=>{if(attempts++===0)throw Error('worker unavailable');return port;});
  await expect(client.generate(2026)).rejects.toThrow('worker unavailable');
  port.postMessage=()=>{throw Error('post failed');};await expect(client.generate(2026)).rejects.toThrow('post failed');expect(port.terminated).toBe(true);client.dispose();
 });
 it('rejects pending work on idempotent disposal and forbids later requests',async()=>{
  const {client,ports}=setup(),pending=client.generate(2026);client.dispose();client.dispose();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(ports[0]!.terminated).toBe(true);
  await expect(client.generate(2027)).rejects.toThrow(/disposed/i);
 });
 it('rejects invalid year before allocating a worker',async()=>{
  const factory=vi.fn(),client=new AnnualWorldClient(factory);await expect(client.generate(NaN)).rejects.toThrow(/year/i);expect(factory).not.toHaveBeenCalled();client.dispose();
 });
});


describe('off-thread receipt validation',()=>{
 it('hands received buffers back to the worker and does not mount before validation',async()=>{
  const port=new Transport();port.autoValidate=false;const client=new AnnualWorldClient(()=>port),pending=client.generate(2026);
  let delivered=false;void pending.then(()=>{delivered=true;},()=>{});
  port.success();
  expect(port.request.type).toBe('validate');
  await Promise.resolve();expect(delivered).toBe(false);
  client.dispose();await expect(pending).rejects.toMatchObject({name:'AbortError'});
 });
 it('rejects an unsolicited validated result before generation has delivered a field',async()=>{
  const {client,ports}=setup(),pending=client.generate(2026);
  ports[0]!.reply({type:'validated',id:ports[0]!.request.id,world:{},meshes:{},generationMs:1});
  await expect(pending).rejects.toThrow(/invalid/i);client.dispose();
 });
});
