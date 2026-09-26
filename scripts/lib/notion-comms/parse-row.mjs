import { parseNotionDate } from './dates.mjs';
import { markdownToBlocks } from './markdown-to-blocks.mjs';
import { parseRelations } from './read-export.mjs';

export function parseRow(row, page = '', notionId = null) {
  const converted = markdownToBlocks(page);
  return { notionId, title: row['Meeting Title']?.trim() || row['Meeting Name']?.trim() || 'Untitled communication', meetingType: row['Meeting Type']?.trim() || 'Other', communicationMethod: row['Communication Method']?.trim() || '', date: parseNotionDate(row.Date), followUpDate: parseNotionDate(row['Follow-up Date'])?.start?.slice(0, 10) ?? null, followUpRequired: /^(true|yes|1)$/i.test(row['Follow-up Required']), attendees: parseRelations(row.Attendees), studentName: row['Student Name']?.trim() || '', location: row.Location?.trim() || '', notes: row['Notes and Follow Up']?.trim() || '', parent: parseRelations(row['Parent item'])[0] ?? null, todos: converted.todos, blocks: converted.blocks };
}
