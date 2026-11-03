import { CLASS_SITE_ORIGIN } from '@teaching/app/class-site';
import { renderSharedSheet, type SharedSheet } from '@teaching/student/sheet-render';
import {
  loadSheetState,
  previewSheet,
  publishSheet,
  stopSheet,
  type SheetLeftOff,
  type SheetOptions,
  type SheetPicks,
  type SheetShare
} from '@/api/meeting-sheets';
import { fetchSelfPerson } from '@/api/network-ecology';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, part: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.part = part;
  return node;
}

export function sheetUrl(token: string): string {
  return `${CLASS_SITE_ORIGIN}/s/sheets/${token}`;
}

/** Two sheets match when only the moment they were built differs. */
export function sameSheet(a: SharedSheet | null | undefined, b: SharedSheet | null | undefined): boolean {
  if (!a || !b) return false;
  const strip = (sheet: SharedSheet) => JSON.stringify({ ...sheet, shared_at: null });
  return strip(a) === strip(b);
}

export function leftOffLine(left: SheetLeftOff): string {
  const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const parts = [
    count(left.blocks, 'block that is private or takes answers', 'blocks that are private or take answers'),
    count(left.promise_lines, 'promise line', 'promise lines'),
    count(left.minutes_sections, 'minutes section on attendees or tasks', 'minutes sections on attendees or tasks'),
    count(left.voice_unpublished, 'voice note you haven’t published', 'voice notes you haven’t published')
  ].filter(Boolean);
  return parts.length ? `Also left off: ${parts.join(', ')}.` : '';
}

const LEAVES_OUT = ['Attendees', 'Tasks', 'Actions', 'Who said what', 'Open promises', 'Guides', 'Linked records'];

/** The sender's side: tick what goes on the sheet, watch it change, and turn the link on or off. */
export function openShareSheet(meetingId: string, onClose: () => void = () => {}): { el: HTMLElement; close(): void } {
  const root = el('div', 'share-sheet');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Share sheet');
  const inner = el('div', 'share-sheet__inner');
  const head = el('header', 'share-sheet__head');
  const close = button('Close', 'btn btn--secondary', 'share-close');
  head.append(el('h2', undefined, 'Share sheet'), close);
  const controls = el('form', 'share-sheet__controls');
  controls.addEventListener('submit', (event) => event.preventDefault());
  const previewCol = el('div', 'share-sheet__preview');
  const previewCap = el('p', 'share-sheet__cap', 'Exactly what they’ll see');
  const previewHost = el('div');
  const leftOff = el('p', 'share-sheet__hint');
  leftOff.dataset.part = 'share-left-off';
  previewCol.append(previewCap, previewHost, leftOff);
  const body = el('div', 'share-sheet__body');
  body.append(controls, previewCol);
  inner.append(head, body);
  root.append(inner);
  document.body.append(root);

  let picks: SheetPicks | null = null;
  let options: SheetOptions | null = null;
  let share: SheetShare | null = null;
  let previewed: SharedSheet | null = null;
  let previewHandle: ReturnType<typeof renderSharedSheet> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let closed = false;
  const shareBox = el('div', 'share-sheet__share');
  shareBox.dataset.part = 'share-box';

  function shut(): void {
    if (closed) return;
    closed = true;
    if (timer !== null) clearTimeout(timer);
    previewHandle?.dispose();
    document.removeEventListener('keydown', onKey);
    root.remove();
    onClose();
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') shut();
  }
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey);

  function showError(message: string): void {
    const status = shareBox.querySelector<HTMLElement>('[data-part="share-error"]') ?? el('p', 'share-sheet__error');
    status.dataset.part = 'share-error';
    status.setAttribute('role', 'alert');
    status.textContent = message;
    shareBox.append(status);
  }

  async function refreshPreview(): Promise<void> {
    if (!picks) return;
    const mine = ++seq;
    try {
      const result = await previewSheet(meetingId, picks);
      if (closed || mine !== seq) return;
      previewed = result.sheet;
      previewHandle?.dispose();
      previewHandle = renderSharedSheet(result.sheet);
      previewHost.replaceChildren(previewHandle.el);
      leftOff.textContent = leftOffLine(result.left_off);
      paintShare();
    } catch {
      if (!closed && mine === seq) showError('The sheet preview could not load. Change a tick to try again.');
    }
  }

  function changed(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void refreshPreview(), 250);
  }

  function tick(label: string, checked: boolean, onChange: (value: boolean) => void, hint?: string): HTMLLabelElement {
    const row = el('label', 'share-sheet__tick');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => {
      onChange(input.checked);
      changed();
    });
    const text = el('span', undefined, label);
    if (hint) text.append(el('small', undefined, hint));
    row.append(input, text);
    return row;
  }

  function paintControls(): void {
    if (!picks || !options) return;
    const current = picks;
    const available = options;
    controls.replaceChildren();

    const fields = el('div', 'share-sheet__group');
    const titleLabel = el('label', 'share-sheet__label', 'Title they see');
    const title = el('input', 'share-sheet__field');
    title.value = current.title;
    title.id = titleLabel.htmlFor = 'share-sheet-title';
    title.addEventListener('input', () => {
      current.title = title.value;
      changed();
    });
    const messageLabel = el('label', 'share-sheet__label', 'A line from you (optional)');
    const message = el('textarea', 'share-sheet__field');
    message.value = current.message;
    message.id = messageLabel.htmlFor = 'share-sheet-message';
    message.addEventListener('input', () => {
      current.message = message.value;
      changed();
    });
    fields.append(titleLabel, title, messageLabel, message);

    const parts = el('div', 'share-sheet__group');
    parts.append(el('p', 'share-sheet__label', 'Put on the sheet'));
    if (available.summary) parts.append(tick('Summary', current.summary, (v) => { current.summary = v; }));
    if (available.notes) parts.append(tick('Notes', current.notes, (v) => { current.notes = v; }));
    if (available.annotations) {
      const layers = el('div', 'share-sheet__sub');
      layers.hidden = !current.annotations;
      parts.append(tick('Annotations', current.annotations, (v) => {
        current.annotations = v;
        layers.hidden = !v;
      }, available.layers.length ? 'Tick which layers go on' : undefined));
      for (const layer of available.layers) {
        layers.append(tick(layer.name, !current.off_layers.includes(layer.id), (on) => {
          current.off_layers = on ? current.off_layers.filter((id) => id !== layer.id) : [...current.off_layers, layer.id];
        }, layer.private ? 'Private: off to begin with' : undefined));
      }
      parts.append(layers);
    }
    if (available.voice) parts.append(tick('Voice notes', current.voice, (v) => { current.voice = v; }, 'They can play them'));
    if (available.minutes) parts.append(tick('Minutes', current.minutes, (v) => { current.minutes = v; }));
    if (available.coaching) parts.append(tick('Coaching sheet', current.coaching, (v) => { current.coaching = v; }));

    const stays = el('div', 'share-sheet__group');
    stays.append(el('p', 'share-sheet__label', 'Stays on your meeting page'));
    const chips = el('div', 'share-sheet__chips');
    for (const name of LEAVES_OUT) chips.append(el('span', undefined, name));
    stays.append(chips, el('p', 'share-sheet__hint', 'Any name you typed into your notes or annotations stays in them, so check the sheet.'));

    controls.append(fields, parts, stays, shareBox);
  }

  function paintShare(): void {
    if (!picks) return;
    const current = picks;
    shareBox.replaceChildren();
    if (!share) {
      const make = button('Create read-only link', 'btn btn--primary', 'share-create');
      make.addEventListener('click', () => void run(make, async () => {
        const result = await publishSheet(meetingId, current);
        share = result.share;
      }));
      shareBox.append(make, el('p', 'share-sheet__hint', 'Anyone with the link can read the sheet, with no sign-in. They can open notes and play voice, and that is all.'));
      return;
    }
    const url = sheetUrl(share.token);
    const stale = !sameSheet(previewed, share.sheet);
    const status = el('p', stale ? 'share-sheet__status share-sheet__status--changed' : 'share-sheet__status', stale ? 'You have changes they can’t see yet' : 'Link is on');
    status.dataset.part = 'share-status';
    const row = el('div', 'share-sheet__link');
    const link = el('code', undefined, url);
    const copy = button('Copy', 'btn btn--secondary', 'share-copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(link);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        copy.textContent = 'Selected';
      }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
    row.append(link, copy);
    const buttons = el('div', 'share-sheet__row');
    const update = button('Update sheet', 'btn btn--primary', 'share-update');
    update.disabled = !stale;
    update.addEventListener('click', () => void run(update, async () => {
      const result = await publishSheet(meetingId, current);
      share = result.share;
    }));
    const open = el('a', 'btn btn--secondary', 'See their view');
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener';
    const stop = button('Stop sharing', 'btn btn--ghost share-sheet__stop', 'share-stop');
    stop.addEventListener('click', () => void run(stop, async () => {
      await stopSheet(meetingId);
      share = null;
    }));
    buttons.append(update, open, stop);
    shareBox.append(status, row, buttons, el('p', 'share-sheet__hint', 'They keep seeing this copy while you go on editing the meeting. Update sheet sends your changes to the same link. Stop sharing turns the link off.'));
  }

  async function run(trigger: HTMLButtonElement, work: () => Promise<void>): Promise<void> {
    trigger.disabled = true;
    try {
      await work();
      await refreshPreview();
      paintShare();
    } catch {
      trigger.disabled = false;
      showError('That didn’t save. Try again.');
    }
  }

  void (async () => {
    try {
      const [state, self] = await Promise.all([
        loadSheetState(meetingId),
        fetchSelfPerson().catch(() => null)
      ]);
      if (closed) return;
      options = state.options;
      share = state.share;
      picks = state.picks;
      // A sheet already shared keeps its byline. A new one takes yours.
      if (!picks.from) picks.from = self?.self?.display_name ?? '';
      paintControls();
      paintShare();
      await refreshPreview();
    } catch {
      if (!closed) controls.replaceChildren(el('p', 'share-sheet__error', 'The share sheet could not load. Close it and try again.'));
    }
  })();

  return { el: root, close: shut };
}
