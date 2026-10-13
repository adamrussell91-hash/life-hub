type Options={snapshot:()=>Record<string,string>;eligible:()=>boolean;run:(ids:string[])=>Promise<void>};
export class PassiveScheduler {
  private assessed=new Map<string,string>();
  private timer:ReturnType<typeof setTimeout>|null=null;
  private changedAt=Date.now();
  private nextAt=0;
  private failures=0;
  private busy=false;
  private disposed=false;
  constructor(private options:Options){}
  changed():void { this.changedAt=Date.now(); this.schedule(); }
  suppress(ids:string[]):void {const snapshot=this.options.snapshot();for(const id of ids)if(snapshot[id])this.assessed.set(id,snapshot[id]);}
  private schedule():void {
    if(this.disposed || this.timer!==null)return;
    this.timer=setTimeout(()=>{this.timer=null;void this.tick();},Math.max(1,Math.min(30000,Math.max(this.changedAt+30000,this.nextAt)-Date.now())));
  }
  private async tick():Promise<void> {
    if(this.disposed)return;
    if(this.busy || !this.options.eligible() || Date.now()<Math.max(this.changedAt+30000,this.nextAt)){this.schedule();return;}
    const snapshot=this.options.snapshot();
    const dirty=Object.keys(snapshot).filter(id=>this.assessed.get(id)!==snapshot[id]);
    let size=0; const ids:string[]=[];
    for(const id of dirty) {
      // Keep the batch small enough for the server's conservative prompt ceiling.
      const bytes=new TextEncoder().encode(snapshot[id]).length;
      if(bytes>3500){this.assessed.set(id,snapshot[id]);continue;}
      if(ids.length && size+bytes>3500)break;
      size+=bytes;ids.push(id);if(ids.length===4)break;
    }
    if(!ids.length)return;
    this.busy=true;this.nextAt=Date.now()+180000;
    try {await this.options.run(ids);if(!this.disposed){for(const id of ids)this.assessed.set(id,snapshot[id]);this.failures=0;}}
    catch(error){
      this.failures++;
      const e=error as {code?:string;details?:{retryAfterMs?:number}};
      const permanent=['unauthenticated','alchemy_unconfigured','alchemy_input_limit'].includes(e.code||'');
      this.nextAt=Date.now()+Math.max(e.details?.retryAfterMs||0,permanent?86400000:this.failures>=3?1800000:Math.min(3600000,300000*2**(this.failures-1)));
    } finally {this.busy=false;this.schedule();}
  }
  dispose():void {this.disposed=true;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}
