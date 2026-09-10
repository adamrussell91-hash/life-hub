export function yearKey(id: string): string {
  return `years/${id}`;
}

export function subjectKey(id: string): string {
  return `subjects/${id}`;
}

export function outcomeKey(id: string): string {
  return `outcomes/${id}`;
}

export function scopeSequenceKey(id: string): string {
  return `scope_sequences/${id}`;
}

export function unitKey(id: string): string {
  return `units/${id}`;
}

export function draftLessonKey(id: string): string {
  return `lessons/${id}`;
}

export function publishedLessonKey(id: string): string {
  return `published/lessons/${id}`;
}

export function classKey(id: string): string {
  return `classes/${id}`;
}

export function scheduledLessonKey(id: string): string {
  return `scheduled_lessons/${id}`;
}

export function scheduleAnchorKey(): string {
  return 'meta/schedule_anchor_date';
}

export function mediaKey(id: string): string {
  return `media/${id}`;
}

export function mediaFileKey(id: string): string {
  return `media_files/${id}`;
}

export function compositionKey(id: string): string {
  return `templates/compositions/${id}`;
}

export function lessonTemplateKey(id: string): string {
  return `templates/lessons/${id}`;
}

export function unitTemplateKey(id: string): string {
  return `templates/units/${id}`;
}

export function versionKey(kind: string, parentId: string, revision: number): string {
  return `versions/${kind}/${parentId}/${revision}`;
}

export function versionIndexKey(kind: string, parentId: string): string {
  return `versions/${kind}/${parentId}/_index`;
}

export function versionsPrefix(kind: string, parentId: string): string {
  return `versions/${kind}/${parentId}/`;
}

export function aiUsageLogKey(day: string): string {
  return `ai_usage/${day}`;
}

export function aiJobKey(id: string): string {
  return `ai_jobs/${id}`;
}

export function aiJobsInboxKey(): string {
  return 'ai_jobs/_inbox';
}

export function aiTranscriptKey(lessonId: string, agent: string): string {
  return `ai_transcripts/${lessonId}/${agent}`;
}
