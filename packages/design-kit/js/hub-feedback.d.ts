export function showHubToast(
  message: string,
  options?: {
    root?: Document | ParentNode;
    tone?: 'neutral' | 'success' | 'danger';
    durationMs?: number;
    action?: { label: string; onClick: () => void } | null;
    onDismiss?: (reason: 'timeout' | 'action' | 'replace' | 'manual') => void;
  }
): { el: HTMLElement; dismiss: (reason?: string) => void } | null;

export function showCopyConfirm(
  trigger: HTMLElement | null | undefined,
  text: string,
  options?: {
    root?: Document | ParentNode;
    clipboard?: { writeText: (value: string) => Promise<void> };
    message?: string;
  }
): Promise<{ el: HTMLElement; dismiss: (reason?: string) => void } | null>;

export function offerTimedUndo(options: {
  message: string;
  durationMs?: number;
  undoLabel?: string;
  root?: Document | ParentNode;
  onUndo?: () => void;
  onCommit?: () => void;
}): { el: HTMLElement; dismiss: (reason?: string) => void } | null;

export function resetHubFeedbackForTests(): void;
