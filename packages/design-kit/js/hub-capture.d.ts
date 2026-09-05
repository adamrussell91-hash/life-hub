export function createVoiceNote(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  startLabel?: string;
  stopLabel?: string;
  idleLabel?: string;
  recordingLabel?: string;
  onStart?: () => void;
  onStop?: () => void;
}): { el: HTMLElement; button: HTMLButtonElement; isRecording: () => boolean };

export function createQuickPaste(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  wrap?: HTMLElement;
  label?: string;
  clipboard?: { readText: () => Promise<string> };
  onPaste?: (text: string) => void;
}): { el: HTMLElement; button: HTMLButtonElement };

export function mountCaptures(scope?: ParentNode): Array<{ el: HTMLElement }>;
