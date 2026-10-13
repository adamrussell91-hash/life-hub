export function canonical(value: unknown): string;
export function blockRevision(block: {id:string;block_type:string;content:unknown}): string;
export function contextSnapshot(entity: {title:string;blocks?:unknown[];[key:string]:unknown}): unknown;
export function findAlchemyBlock<T extends {id:string}>(blocks:T[],id:string):T|null;
export function protectedContentUnchanged(before:unknown,after:unknown):boolean;
