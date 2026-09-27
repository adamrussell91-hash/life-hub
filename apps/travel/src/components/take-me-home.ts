import type { IsoDate, StayItem } from '@/types';

export interface TakeMeHomeOptions {
  home: StayItem | null;
  date: IsoDate;
  onAddStay?: () => void;
}

function directionsUrl(home: StayItem): string {
  if (!home.place) return '#';
  return `https://www.google.com/maps/dir/?api=1&destination=${home.place.lat},${home.place.lon}`;
}

/** "Take me home" sheet (TR-28): home base name, address, driver phrase, and
 * a Directions link — or a prompt to add a stay when there's no bed booked. */
export function renderTakeMeHome(host: HTMLElement, options: TakeMeHomeOptions, driverPhrase?: { local: string; english: string }): void {
  host.replaceChildren();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  if (!options.home) {
    const title = document.createElement('h3');
    title.textContent = `No bed booked for ${options.date} yet`;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn';
    addBtn.textContent = 'Add a stay';
    addBtn.addEventListener('click', () => options.onAddStay?.());
    sheet.append(title, addBtn);
  } else {
    const home = options.home;
    const driver = document.createElement('div');
    driver.className = 'driver';
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = home.title;
    driver.append(big);
    if (home.place?.address) {
      const addr = document.createElement('div');
      addr.className = 'addr';
      addr.textContent = home.place.address;
      driver.append(addr);
    }
    if (driverPhrase) {
      const phrase = document.createElement('div');
      phrase.className = 'phrase';
      phrase.textContent = driverPhrase.local;
      const small = document.createElement('small');
      small.textContent = driverPhrase.english;
      phrase.append(small);
      driver.append(phrase);
    }
    sheet.append(driver);

    const row = document.createElement('div');
    row.className = 'row';
    const dirLink = document.createElement('a');
    dirLink.className = 'btn';
    dirLink.href = directionsUrl(home);
    dirLink.target = '_blank';
    dirLink.rel = 'noopener';
    dirLink.textContent = 'Directions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn ghost';
    copyBtn.textContent = 'Copy address';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(home.place?.address ?? home.title);
    });
    row.append(dirLink, copyBtn);
    sheet.append(row);
  }

  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) host.replaceChildren();
  });
  document.addEventListener(
    'keydown',
    function onKey(e) {
      if (e.key === 'Escape') {
        host.replaceChildren();
        document.removeEventListener('keydown', onKey);
      }
    },
    { once: true }
  );
  host.append(back);
}
