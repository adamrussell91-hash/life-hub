/** Screen-space fallback keeps subpixel overview silhouettes tappable. */
export function nearestProjectedItem<T>(points:Iterable<{item:T;x:number;y:number;depth:number}>,x:number,y:number,radius:number):T|undefined {
 let closest:T|undefined,best=radius*radius;
 for(const point of points){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.depth)||point.depth < -1||point.depth > 1)continue;
  const distance=(point.x-x)**2+(point.y-y)**2;
  if(distance<=best&&(closest===undefined||distance<best)){best=distance;closest=point.item;}
 }
 return closest;
}
