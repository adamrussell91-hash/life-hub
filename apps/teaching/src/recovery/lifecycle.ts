export type EntityStatus = 'active' | 'archived' | 'trashed';

export type LifecycleFields = {
  status: EntityStatus;
  trashed_at?: string;
  previous_status?: Exclude<EntityStatus, 'trashed'>;
  trash_reason?: string;
};

type ClearedTrashFields = {
  trashed_at?: undefined;
  previous_status?: undefined;
  trash_reason?: undefined;
};

export function applyArchive<T extends { status: EntityStatus }>(
  obj: T
): Omit<T, 'status' | 'trashed_at' | 'previous_status' | 'trash_reason'> & {
  status: 'archived';
} & ClearedTrashFields {
  const {
    trashed_at: _t,
    previous_status: _p,
    trash_reason: _r,
    ...rest
  } = obj as T & LifecycleFields;
  return { ...rest, status: 'archived' } as Omit<
    T,
    'status' | 'trashed_at' | 'previous_status' | 'trash_reason'
  > & { status: 'archived' } & ClearedTrashFields;
}

export function applyTrash<T extends LifecycleFields>(
  obj: T,
  trashedAt: string,
  reason?: string
): Omit<T, 'status' | 'trashed_at' | 'previous_status' | 'trash_reason'> & {
  status: 'trashed';
  previous_status: Exclude<EntityStatus, 'trashed'>;
  trashed_at: string;
  trash_reason?: string;
} {
  const previous =
    obj.status === 'trashed' ? obj.previous_status ?? 'active' : (obj.status as 'active' | 'archived');
  const { trash_reason: _oldReason, ...withoutReason } = obj;
  return {
    ...withoutReason,
    previous_status: previous,
    trashed_at: trashedAt,
    status: 'trashed',
    ...(reason ? { trash_reason: reason } : {})
  } as Omit<T, 'status' | 'trashed_at' | 'previous_status' | 'trash_reason'> & {
    status: 'trashed';
    previous_status: Exclude<EntityStatus, 'trashed'>;
    trashed_at: string;
    trash_reason?: string;
  };
}

export function applyRestoreFromTrash<T extends LifecycleFields>(
  obj: T
): Omit<T, 'status' | 'trashed_at' | 'previous_status' | 'trash_reason'> & {
  status: Exclude<EntityStatus, 'trashed'>;
} & ClearedTrashFields {
  const nextStatus = obj.previous_status ?? 'active';
  const { trashed_at: _t, previous_status: _p, trash_reason: _r, ...rest } = obj;
  return { ...rest, status: nextStatus } as Omit<
    T,
    'status' | 'trashed_at' | 'previous_status' | 'trash_reason'
  > & { status: Exclude<EntityStatus, 'trashed'> } & ClearedTrashFields;
}
