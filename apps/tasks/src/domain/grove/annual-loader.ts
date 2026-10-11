/** Read-only, cancellable annual scene loading; history allocation survives selection changes. */
import {AnnualWorldClient,type WorldGeneration} from './world-client';
import {buildAnnualGrovePlan} from './annual-plan';
import {AnnualPlantingSession} from './planting';
import {groveDateKeys} from './calendar';
type Input=Omit<Parameters<typeof buildAnnualGrovePlan>[0],'worlds'|'session'>;
export class AnnualGroveLoader {
 private cache=new Map<number,WorldGeneration>();private clients:AnnualWorldClient[]=[];private revision=0;private session=new AnnualPlantingSession();private disposed=false;
 constructor(private createClient=()=>new AnnualWorldClient()){}
 cancel(){this.revision++;for(const c of this.clients)c.dispose();this.clients=[];}
 async load(input:Input){
  if(this.disposed)throw Error('Annual Grove loader disposed');this.cancel();const revision=this.revision;
  const years=[...new Set(groveDateKeys(input.view,input.anchor,input.terms).map(k=>Number(k.slice(0,4))))].sort();
  try{const deliveries=await Promise.all(years.map(async year=>{const cached=this.cache.get(year);if(cached)return cached;const client=this.createClient();this.clients.push(client);const result=await client.generate(year);if(this.disposed||revision!==this.revision)throw new DOMException('Obsolete annual selection','AbortError');this.cache.set(year,result);return result;}));
   if(this.disposed||revision!==this.revision)throw new DOMException('Obsolete annual selection','AbortError');
   for(const year of this.cache.keys())if(this.cache.size>4&&!years.includes(year))this.cache.delete(year);
   const worlds=deliveries.map(d=>d.world),meshes=deliveries.map(d=>d.meshes),plan=buildAnnualGrovePlan({...input,worlds,session:this.session});return {worlds,meshes,plan};
  }finally{if(revision===this.revision){for(const c of this.clients)c.dispose();this.clients=[];}}
 }
 dispose(){this.disposed=true;this.cancel();this.cache.clear();}
}
