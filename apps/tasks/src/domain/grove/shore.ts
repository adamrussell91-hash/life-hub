/** Sparse shoreline dressing from the fixed water mask, independent of completion counts. */
import {sampleTerrain,terrainTile,TERRAIN_ROW} from './terrain';
import {hashString} from './random';
export type ShoreProp={file:string;x:number;z:number;y:number;scale:number;rotation:number};
export function shoreProps(bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):ShoreProp[] {
  const result:ShoreProp[]=[];
  for(let row=Math.floor((bounds.minZ+13)/TERRAIN_ROW);row<=Math.floor((bounds.maxZ+13)/TERRAIN_ROW);row++) {
    const tile=terrainTile(row),counts=new Map<number,{reeds:number; lilies:number}>();
    for(let id=0;id<tile.bed.length;id++) {
      const x=tile.x0+id%tile.width,z=tile.z0+Math.floor(id/tile.width);
      const cell=Math.floor((x+13)/TERRAIN_ROW),count=counts.get(cell)??{reeds:0,lilies:0};
      counts.set(cell,count);
      const visible=x>=bounds.minX && x<=bounds.maxX && z>=bounds.minZ && z<=bounds.maxZ;
      const hash=hashString(`shore:${x}:${z}`),t=sampleTerrain(x,z);
      if(t.wet && !t.stream && hash%19===0 && count.lilies<2) {
        if(visible) result.push({file:`models/ground/lily-${1+hash%2}.glb`,x,z,y:t.waterHeight!+.035,scale:.75,rotation:hash/4294967295*Math.PI*2});count.lilies++;
      } else if(!t.wet && hash%13===0 && count.reeds<4 && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>sampleTerrain(x+dx!,z+dz!).wet)) {
        if(visible) result.push({file:`models/ground/reed-${1+hash%2}.glb`,x,z,y:t.height,scale:.7,rotation:hash/4294967295*Math.PI*2});count.reeds++;
      }
    }
  }
  return result;
}
