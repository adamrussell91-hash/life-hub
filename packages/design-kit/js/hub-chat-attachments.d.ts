export type HubChatAttachment = {
  id: string;
  kind: 'image' | 'file';
  mime: string;
  name: string;
  dataUrl?: string;
  textExcerpt?: string;
};

export function parseChatAttachment(raw: unknown): HubChatAttachment | null;
export function normalizeChatAttachments(list: unknown): HubChatAttachment[];
export function formatAttachmentProvenance(attachments: HubChatAttachment[]): string;
export function buildUserContent(
  message: string,
  attachments?: HubChatAttachment[]
): string | Array<{ type: string; text?: string; source?: Record<string, string> }>;
export function fileToChatAttachment(file: File): Promise<HubChatAttachment>;
