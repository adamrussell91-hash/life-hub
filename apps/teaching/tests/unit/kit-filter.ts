/** Choose `value` from a kit filter pill (hub-filter) the way a teacher does: open, then click. */
export function pickKitOption(control: Element | null, value: string): void {
  if (!(control instanceof HTMLButtonElement)) throw new Error('expected a kit filter button');
  control.click();
  const option = document.querySelector<HTMLButtonElement>(`.hub-menu [data-hub-option="${value}"]`);
  if (!option) throw new Error(`no kit option ${value}`);
  option.click();
}

/** The label a kit filter pill shows for its current value. */
export function kitLabel(control: Element | null): string {
  return control?.querySelector('[data-hub-value]')?.textContent ?? '';
}

/** The value a kit filter pill holds. */
export function kitValue(control: Element | null): string | undefined {
  return (control as HTMLElement | null)?.dataset.hubValue;
}
