/**
 * Resolves when `promise` settles or `ms` pass, whichever is first. Lets a
 * quick request go ahead of a slow one without a hung quick request ever
 * holding the slow one back for good.
 */
export function headStart(promise: Promise<unknown>, ms = 1500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); }
    );
  });
}
