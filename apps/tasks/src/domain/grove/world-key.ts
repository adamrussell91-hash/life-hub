/** Recipe changes require a new version and an explicit year-policy decision. */
export type WorldKey = Readonly<{year:number; generatorVersion:number}>;
export const WORLD_RECIPE_V1 = Object.freeze({extent:896,size:257,x0:-448,z0:-448});
const DEFAULT_GENERATOR_VERSION = 1;
const PINNED_YEAR_VERSIONS:Readonly<Record<number,number>> = Object.freeze({2026:1});

export function makeWorldKey(year:number,generatorVersion:number):WorldKey {
  if(!Number.isInteger(year)||year<1900||year>9999)throw new Error('World year must be an integer from 1900 to 9999');
  if(generatorVersion!==1)throw new Error('Unsupported annual world generator version');
  return Object.freeze({year,generatorVersion});
}
export function worldKeyForYear(year:number):WorldKey {
  return makeWorldKey(year,PINNED_YEAR_VERSIONS[year]??DEFAULT_GENERATOR_VERSION);
}
export function worldIdentity(key:WorldKey):string {
  const valid=makeWorldKey(key.year,key.generatorVersion);
  return `grove-world:${valid.year}:v${valid.generatorVersion}`;
}
