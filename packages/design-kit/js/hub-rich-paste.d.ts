export type PasteKind = 'image' | 'file' | 'url' | 'html' | 'text' | 'empty';

export type PastePayload = {
  kind: PasteKind;
  subtype?: 'youtube' | 'vimeo' | 'maps' | 'pdf' | 'article' | 'plain';
  text?: string;
  html?: string;
  files?: File[];
  url?: string;
};

export type IngestSuggestion = {
  hub: string;
  action: string;
  reason: string;
};

export function classifyClipboardData(data: DataTransfer | null | undefined): PastePayload;
export function classifyPasteEvent(event: ClipboardEvent): PastePayload;
export function classifyDropEvent(event: DragEvent): PastePayload;
export function suggestIngestTarget(
  payload: PastePayload,
  opts?: { currentHub?: string }
): IngestSuggestion | null;
