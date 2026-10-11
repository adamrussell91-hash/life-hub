export type GroveHistoryArea = 'teaching'|'gifted'|'halt'|'university'|'career'|'professional'|'life'|'health'|'wedding'|'unclassified';
export type GroveHistory = {schema_version:1;years:{year:number;late_fraction:number;weeks:{starts_on:string;ends_on:string;counts:Record<GroveHistoryArea,number>}[];terms?:{term:1|2|3|4;starts_on:string;ends_on:string}[];books?:string[]}[]};
export const GROVE_HISTORY_MAX_BYTES:number;
export const GROVE_HISTORY_AREAS:GroveHistoryArea[];
export function validateGroveHistory(raw:unknown):GroveHistory;
export function parseGroveHistory(raw:unknown):GroveHistory|undefined;
