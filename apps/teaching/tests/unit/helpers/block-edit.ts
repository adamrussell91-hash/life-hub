function clickBlockMenu(root: ParentNode, selector: string, action: string): void {
  const row = root.querySelector<HTMLElement>(selector);
  if (!row) throw new Error(`missing block ${selector}`);
  row.querySelector<HTMLButtonElement>('.lesson-page__block-menu .hub-icon-btn')!.click();
  row.querySelector<HTMLButtonElement>(`[data-block-action="${action}"]`)!.click();
}

export function enterBlockEdit(root: ParentNode, selector = '.lesson-page__block'): HTMLElement {
  clickBlockMenu(root, selector, 'edit');
  return root.querySelector<HTMLElement>(selector)!;
}

export function clickBlockMenuAction(root: ParentNode, selector: string, action: string): void {
  clickBlockMenu(root, selector, action);
}

export function deleteBlockFromMenu(root: ParentNode, selector: string): void {
  clickBlockMenu(root, selector, 'delete');
}
