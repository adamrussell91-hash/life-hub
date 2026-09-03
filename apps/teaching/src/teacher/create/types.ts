import type { Class, Lesson, ScopeSequence, Subject, Unit } from '@/schemas';

export type CreateKind = 'class' | 'subject' | 'unit' | 'lesson' | 'scope_sequence';

export type CreatedRecord = Class | Unit | Lesson | Subject | ScopeSequence;

export type EntityCreatedHandler = (
  kind: CreateKind,
  id: string,
  entity?: CreatedRecord
) => void | Promise<void>;

export type CreateContext =
  | 'home'
  | 'classes'
  | 'scope-sequences'
  | 'units'
  | 'lessons';
