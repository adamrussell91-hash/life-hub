/** Fixed world tiles, coherent noise hills, Priority-Flood lakes and downhill drainage.
 * Original bed is never overwritten. Flat lakes use spill height, not an artificial slope.
 */
import {hashString, seededRandom} from './random';
export const TERRAIN_ROW = 26;
const X0 = -40, X1 = 220, STEP = 1;
type Entry = {id: number; height: number};
class MinHeap {
  items: Entry[] = [];
  push(item: Entry) {
    let i=this.items.length; this.items.push(item);
    while(i>0) {const p=(i-1)>>1; if(this.items[p]!.height<=item.height) break; this.items[i]=this.items[p]!; i=p;}
    this.items[i]=item;
  }
  pop(): Entry {
    const root=this.items[0]!, last=this.items.pop()!;
    if(this.items.length) {
      let i=0;
      while(i*2+1<this.items.length) {
        let child=i*2+1;
        if(child+1<this.items.length && this.items[child+1]!.height<this.items[child]!.height) child++;
        if(this.items[child]!.height>=last.height) break;
        this.items[i]=this.items[child]!; i=child;
      }
      this.items[i]=last;
    }
    return root;
  }
}
/** Boundary cells are outlets. Parents are assigned once to already visited cells, so no cycles. */
export function fillBasins(bed: readonly number[], width: number, height: number) {
  if(width<2 || height<2 || bed.length!==width*height || bed.some(h=>!Number.isFinite(h))) throw new Error('Invalid terrain grid');
  const level=[...bed], downstream=Array<number>(bed.length).fill(-1), flow=Array<number>(bed.length).fill(1);
  const visited=new Uint8Array(bed.length), heap=new MinHeap(), order:number[]=[];
  const add=(id:number) => {if(!visited[id]) {visited[id]=1; heap.push({id,height:bed[id]!});}};
  for(let x=0;x<width;x++) {add(x);add((height-1)*width+x);}
  for(let z=0;z<height;z++) {add(z*width);add(z*width+width-1);}
  while(heap.items.length) {
    const current=heap.pop(), x=current.id%width,z=Math.floor(current.id/width); order.push(current.id);
    for(const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]) {
      if(nx!<0 || nz!<0 || nx!>=width || nz!>=height) continue;
      const id=nz!*width+nx!; if(visited[id]) continue;
      visited[id]=1; downstream[id]=current.id; level[id]=Math.max(bed[id]!,current.height);
      heap.push({id,height:level[id]!});
    }
  }
  for(let i=order.length-1;i>=0;i--) {const id=order[i]!, to=downstream[id]!;if(to>=0) flow[to]!+=flow[id]!;}
  return {level,downstream,flow};
}
const smooth=(t:number)=>t*t*(3-2*t);
function noise(x:number,z:number) {
  const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);
  const value=(a:number,b:number)=>(hashString(`grove-ground:${a}:${b}`)/4294967295)*2-1;
  const a=value(ix,iz)*(1-fx)+value(ix+1,iz)*fx;
  const b=value(ix,iz+1)*(1-fx)+value(ix+1,iz+1)*fx;
  return a*(1-fz)+b*fz;
}
export function streamCentre(x:number,row:number):number {return row*TERRAIN_ROW+10.8+Math.sin(x/21+row*.7)*1.1;}
export function terrainBed(x:number,z:number):number {
  const row=Math.floor((z+13)/TERRAIN_ROW), local=z-row*TERRAIN_ROW;
  const rand=seededRandom(`watershed:${row}`), lakeX=20+rand()*130;
  const streamZ=streamCentre(x,row)-row*TERRAIN_ROW;
  const distance=Math.abs(local-streamZ);
  const hills=1.1+noise(x/24,z/30)*1.5+noise(x/9,z/11)*.38;
  const bank=Math.min(hills, -0.35+x*.001+distance*distance*.34);
  const bowl=Math.hypot((x-lakeX)/5.5,(local-7)/3.8);
  return Math.min(bank, bowl<1.5 ? -.8+bowl*bowl*1.3 : hills);
}
export type TerrainTile = ReturnType<typeof makeTile>;
function makeTile(row:number) {
  const width=X1-X0+1,height=TERRAIN_ROW+1,z0=row*TERRAIN_ROW-13;
  const bed=Array.from({length:width*height},(_,i)=>terrainBed(X0+i%width,z0+Math.floor(i/width)));
  const flood=fillBasins(bed,width,height);
  const wet=bed.map((h,i)=>flood.level[i]!-h>.12);
  const stream=bed.map((h,i)=>!wet[i] && h<.2 && flood.flow[i]!>=8);
  return {row,width,height,x0:X0,z0,step:STEP,bed,...flood,wet,stream};
}
const tiles=new Map<number,TerrainTile>();
export function terrainTile(row:number):TerrainTile {
  let tile=tiles.get(row);
  if(!tile) {tile=makeTile(row);tiles.set(row,tile);if(tiles.size>64) tiles.delete(tiles.keys().next().value!);}
  return tile;
}
/** Shared planting/motion/render sampling. Nearest water mask with bilinear ground height. */
export function sampleTerrain(x:number,z:number) {
  const row=Math.floor((z+13)/TERRAIN_ROW),t=terrainTile(row);
  if(x<X0 || x>X1) return {height:terrainBed(x,z),wet:false,waterHeight:null as number|null,stream:false};
  const fx=x-X0,fz=Math.min(t.height-1,Math.max(0,z-t.z0));
  const ax=Math.floor(fx),az=Math.floor(fz),bx=Math.min(t.width-1,ax+1),bz=Math.min(t.height-1,az+1);
  const tx=fx-ax,tz=fz-az;
  const a=t.bed[az*t.width+ax]!*(1-tx)+t.bed[az*t.width+bx]!*tx;
  const b=t.bed[bz*t.width+ax]!*(1-tx)+t.bed[bz*t.width+bx]!*tx;
  const id=Math.round(fz)*t.width+Math.round(fx),lake=t.wet[id]!;
  const stream=Math.abs(z-streamCentre(x,row))<.5;
  const height=a*(1-tz)+b*tz;
  return {height,wet:lake || stream,waterHeight:lake ? t.level[id]! : stream ? height+.1 : null,stream};
}
