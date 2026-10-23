/**
 * A class-page section that folds shut. Whether it is open is kept per
 * class and section in localStorage, so the page opens the way it was left.
 */
export type ClassFold = { details: HTMLDetailsElement; summary: HTMLElement };

function storageKey(classId: string, name: string): string {
  return `th:class:${classId}:fold:${name}`;
}

function readOpen(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
}

export function createClassFold(classId: string, name: string, options: { className?: string; openByDefault?: boolean } = {}): ClassFold {
  const key = storageKey(classId, name);
  const details = document.createElement('details');
  details.className = `class-fold${options.className ? ` ${options.className}` : ''}`;
  details.dataset.fold = name;
  details.open = readOpen(key) ?? Boolean(options.openByDefault);
  const summary = document.createElement('summary');
  summary.className = 'class-fold__summary';
  details.append(summary);
  details.addEventListener('toggle', () => {
    try {
      localStorage.setItem(key, details.open ? '1' : '0');
    } catch {
      // localStorage may be unavailable (private mode, quota).
    }
  });
  return { details, summary };
}
