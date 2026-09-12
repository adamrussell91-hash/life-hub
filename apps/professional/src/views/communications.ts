/**
 * Communications is not built in Slice 4. This view makes exactly one
 * honest statement of that, calls no Communication API (none exists yet),
 * and exposes no create control. Communication storage, APIs, the editor,
 * and the shared `@` picker are Slice 5's scope.
 */
export function renderCommunicationsView(canvas: HTMLElement): void {
  canvas.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = 'Communications are not available in this slice.';
  canvas.append(empty);
}
