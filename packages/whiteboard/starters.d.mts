export type WhiteboardStarterId = 'sort_groups' | 'venn' | 'same_different';

export type WhiteboardStarter = {
  id: WhiteboardStarterId;
  label: string;
  description: string;
};

export type WhiteboardStarterScene = {
  format: 'excalidraw';
  version: 1;
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor?: string };
  files: Record<string, unknown>;
};

export const WHITEBOARD_STARTERS: WhiteboardStarter[];
export const WHITEBOARD_STARTER_IDS: WhiteboardStarterId[];
export function isWhiteboardStarterId(value: unknown): value is WhiteboardStarterId;
export function whiteboardStarterScene(starterId: WhiteboardStarterId): WhiteboardStarterScene;
export function whiteboardStarterScene(starterId: unknown): WhiteboardStarterScene | null;
