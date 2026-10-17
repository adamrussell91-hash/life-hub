/** Shared annual fixtures. Vitest gives each test file its own module registry,
 * so a world is generated at most once per file and never leaks between files.
 * Worlds are frozen; tests that corrupt one must structuredClone it first. */
import {generateAnnualGeography,generateAnnualWorld,type AnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';

const worlds=new Map<number,AnnualWorld>(),geographies=new Map<number,AnnualWorld>();

/** Complete world: terrain, solved water and weekly regions. */
export function annualWorld(year:number):AnnualWorld{
 let world=worlds.get(year);
 if(!world){world=generateAnnualWorld(worldKeyForYear(year));worlds.set(year,world);}
 return world;
}

/** Terrain and solved water without the weekly regions, which cost most of a full world.
 * Reuses a complete world when this file already built one for the year. */
export function annualGeography(year:number):AnnualWorld{
 let world=worlds.get(year)??geographies.get(year);
 if(!world){world=generateAnnualGeography(worldKeyForYear(year));geographies.set(year,world);}
 return world;
}
