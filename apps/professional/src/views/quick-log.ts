import { fetchPeopleDirectory } from '@/api/people-directory';
import { createCommunication } from '@/api/communications';
import { createLedgerItem } from '@/api/ledger';
import { guessChannel, quickLogBody } from '@/lib/walk-in';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHANNELS: Array<[string, string, string]> = [
  ['in_person', '☺', 'In person'],
  ['email', '✉', 'Email'],
  ['phone', '☏', 'Call'],
  ['message', '✆', 'Text']
];

/** Phone · the 10-second log (Plan 4, Task 11): a person, a channel and one line. */
export async function renderQuickLog(
  canvas: HTMLElement,
  options: { now?: () => Date; navigate?: (hash: string) => void } = {}
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const navigate = options.navigate ?? ((hash: string) => { location.hash = hash; });
  const { people } = await fetchPeopleDirectory();
  const recent = [...people].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  let personRef = recent[0]?.ref ?? null;
  let channel: string = guessChannel(now());

  const sheet = el('section', 'quick-log');
  sheet.append(el('h2', 'quick-log__title', 'Log a comm'));

  const who = el('div', 'quick-log__people');
  who.setAttribute('role', 'group');
  who.setAttribute('aria-label', 'Who');
  const paintWho = () => {
    for (const button of who.querySelectorAll<HTMLButtonElement>('[data-person]')) {
      button.setAttribute('aria-pressed', String(button.dataset.person === personRef));
    }
  };
  for (const person of recent) {
    const button = el('button', 'quick-log__person') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.person = person.ref;
    button.append(el('span', 'quick-log__initials', person.initials), el('span', undefined, person.display_name));
    button.addEventListener('click', () => {
      personRef = person.ref;
      paintWho();
    });
    who.append(button);
  }
  const anyone = el('a', 'quick-log__person', '＋ Anyone') as HTMLAnchorElement;
  anyone.href = '#/communication/new';
  who.append(anyone);

  const channels = el('div', 'quick-log__channels');
  channels.setAttribute('role', 'group');
  channels.setAttribute('aria-label', 'Channel');
  const paintChannels = () => {
    for (const button of channels.querySelectorAll<HTMLButtonElement>('[data-channel]')) {
      button.setAttribute('aria-pressed', String(button.dataset.channel === channel));
    }
  };
  for (const [value, icon, label] of CHANNELS) {
    const button = el('button', 'quick-log__channel') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.channel = value;
    button.append(el('span', undefined, icon), el('span', undefined, label));
    button.addEventListener('click', () => {
      channel = value;
      paintChannels();
    });
    channels.append(button);
  }

  const field = el('textarea', 'quick-log__line') as HTMLTextAreaElement;
  field.rows = 3;
  field.placeholder = 'One line. »me … makes it a promise.';
  field.setAttribute('aria-label', 'What happened');

  const status = el('p', 'muted quick-log__status');
  const logIt = el('button', 'btn btn--primary quick-log__go', 'Log it') as HTMLButtonElement;
  logIt.type = 'button';
  logIt.dataset.part = 'log-it';
  logIt.addEventListener('click', () => {
    if (!personRef || !field.value.trim()) {
      status.textContent = 'Pick a person and write one line.';
      return;
    }
    logIt.disabled = true;
    void (async () => {
      try {
        const body = quickLogBody({ personRef: personRef!, channel, line: field.value, at: now() });
        const { communication } = await createCommunication(body.communication);
        for (const promise of body.promises) {
          await createLedgerItem({ ...promise, comm_ref: `professional:communication:${communication.id}` });
        }
        navigate(`#/communication/${encodeURIComponent(communication.id)}`);
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not log that. Try again.';
        logIt.disabled = false;
      }
    })();
  });

  sheet.append(who, channels, field, logIt, status);
  canvas.replaceChildren(sheet);
  paintWho();
  paintChannels();
  field.focus();
}
