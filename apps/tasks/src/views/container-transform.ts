type ViewTransition = { finished: Promise<void> };

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

/** View Transitions API wrapper from the Cotton Glass container-transform note. */
export function runContainerTransform(update: () => void, guard?: { current: boolean }): void {
  if (guard?.current) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as DocumentWithVT;
  // Call on the document — extracting the method loses `this` and throws Illegal invocation.
  if (doc.startViewTransition && !reduceMotion) {
    if (guard) guard.current = true;
    const transition = doc.startViewTransition(update);
    void transition.finished.finally(() => {
      if (guard) guard.current = false;
    });
    return;
  }
  update();
}

export function cardTransitionName(id: string): string {
  return `hub-card-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
