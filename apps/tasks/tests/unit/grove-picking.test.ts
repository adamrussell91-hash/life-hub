import {describe,it,expect} from 'vitest';
import {nearestProjectedItem} from '@/views/grove/picking';
describe('overview tree tap tolerance',()=>{
 it('selects the nearest subpixel silhouette while keeping its task identity',()=>{const points=[{item:'neighbour',x:63,y:627,depth:0},{item:'original-task',x:61.3,y:626.5,depth:0}];expect(nearestProjectedItem(points,61,627,22)).toBe('original-task');});
 it('does not turn empty landscape outside the tap radius into a tree',()=>expect(nearestProjectedItem([{item:'far',x:23,y:0,depth:0}],0,0,22)).toBeUndefined());
 it('accepts the radius boundary and resolves equal distances stably',()=>expect(nearestProjectedItem([{item:'first',x:22,y:0,depth:0},{item:'second',x:-22,y:0,depth:0}],0,0,22)).toBe('first'));
 it('excludes clipped and nonfinite projections',()=>expect(nearestProjectedItem([{item:'behind',x:0,y:0,depth:2},{item:'invalid',x:NaN,y:0,depth:0},{item:'visible',x:1,y:0,depth:0}],0,0,22)).toBe('visible'));
});
