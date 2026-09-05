export type HubMediaItem = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
};

export function openHubMediaViewer(
  items: HubMediaItem[],
  opts?: { index?: number; onClose?: () => void }
): Promise<{ close: () => void } | null>;
