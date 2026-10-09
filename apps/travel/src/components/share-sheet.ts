import { createShareLink, revokeShareLink } from '@/api/travel';

export interface ShareSheetOptions {
  tripId: string;
  existingUrl?: string | null;
  onChange?: (enabled: boolean) => void;
}

/** Public link sheet (TR-51): create/show the link, copy, and turn it off. */
export function renderShareSheet(host: HTMLElement, options: ShareSheetOptions): void {
  host.replaceChildren();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const title = document.createElement('h3');
  title.textContent = 'Public link';
  const info = document.createElement('p');
  info.textContent =
    'They see: titles, times, places, safe ticks (with the time you marked them) and any place photos you share. Hidden: prices, booking references, links and private items.';
  sheet.append(title, info);

  const linkBox = document.createElement('div');
  linkBox.className = 'linkbox';
  let currentUrl = options.existingUrl ?? '';
  linkBox.textContent = currentUrl || 'No link yet.';
  sheet.append(linkBox);

  const row = document.createElement('div');
  row.className = 'row';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn';
  createBtn.textContent = currentUrl ? 'Show link' : 'Create link';
  createBtn.addEventListener('click', async () => {
    const { url } = await createShareLink(options.tripId);
    currentUrl = url;
    linkBox.textContent = url;
    options.onChange?.(true);
  });

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn ghost';
  copyBtn.textContent = 'Copy link';
  copyBtn.addEventListener('click', () => {
    if (currentUrl) void navigator.clipboard?.writeText(currentUrl);
  });

  const offBtn = document.createElement('button');
  offBtn.type = 'button';
  offBtn.className = 'btn ghost danger';
  offBtn.textContent = 'Turn link off';
  offBtn.addEventListener('click', async () => {
    await revokeShareLink(options.tripId);
    currentUrl = '';
    linkBox.textContent = 'This link has been turned off.';
    options.onChange?.(false);
  });

  row.append(createBtn, copyBtn, offBtn);
  sheet.append(row);

  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) host.replaceChildren();
  });
  host.append(back);
}
