import { ProgramSchema, type Program } from '@/schemas/program';
import catalog from '../../fixtures/competitions.json';

/** Git source of truth for the Programs catalogue. Never Notion. */
export function catalogPrograms(): Program[] {
  return (catalog as Program[]).map((item) => ProgramSchema.parse(item));
}
