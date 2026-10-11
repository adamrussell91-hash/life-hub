import {it,expect} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {buildWaterPrototype} from '@/domain/grove/water-prototype';
import {createAnnualWater} from '@/views/grove/waterRenderer';
it('initializes newly exposed spray at frozen time when quality changes',()=>{const effect=createAnnualWater(buildWaterPrototype());effect.update(12);effect.setQuality('high');const spray=effect.root.children.find((m:any)=>m.isInstancedMesh),matrix=new Matrix4(),point=new Vector3();expect(spray.count).toBe(24);spray.getMatrixAt(23,matrix);point.setFromMatrixPosition(matrix);expect(point.length()).toBeGreaterThan(1);const before=Array.from(spray.instanceMatrix.array);effect.setQuality('low');expect(spray.count).toBe(0);effect.setQuality('high');expect(Array.from(spray.instanceMatrix.array)).toEqual(before);effect.dispose();});
