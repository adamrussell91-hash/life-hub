export type HubPdfHighlight = {
  page: number;
  quote: string;
  attachmentId?: string;
  title?: string;
};

export type OpenHubPdfViewerOptions = {
  src: string;
  title?: string;
  attachmentId?: string;
  initialPage?: number;
  onHighlight?: (highlight: HubPdfHighlight) => void | Promise<void>;
  onClose?: () => void;
};

export function parsePdfHighlight(raw: unknown): HubPdfHighlight | null;
export function formatPdfHighlightMarkdown(highlight: HubPdfHighlight): string;
export function openHubPdfViewer(
  opts: OpenHubPdfViewerOptions
): Promise<{ close: () => void; goToPage: (page: number) => Promise<void> } | null>;
