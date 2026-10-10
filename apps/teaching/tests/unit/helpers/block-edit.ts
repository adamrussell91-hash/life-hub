import { closeHubMenu } from '../../../design-kit/js/hub-list.js';
import { hold } from './hub-list';

function clickBlockMenu(root: ParentNode, selector: string, action: string): void {
  const row = root.querySelector<HTMLElement>(selector);
  if (!row) throw new Error(`missing block ${selector}`);
  closeHubMenu();
  row.querySelector<HTMLButtonElement>('.lesson-page__block-menu')!.click();
  const item = document.querySelector<HTMLButtonElement>(
    `.hub-action-menu [data-block-action="${action}"]`
  );
  if (!item) throw new Error(`missing block action ${action}`);
  // Delete is press-and-hold; every other action is a click.
  if (action === 'delete') hold(item);
  else item.click();
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
