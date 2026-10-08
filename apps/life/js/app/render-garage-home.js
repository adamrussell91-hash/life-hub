/**
 * Life → Garage & Home. Cars, the home we rent, and investments, kept current
 * by the Mailroom: Gmail is read for anything about each place, and every
 * email waits for a one-tap approve, move or ignore (routine kinds can file
 * themselves). Investments hand off to the Property page for the money.
 */
import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';
import {
  AUTO_KINDS,
  KIND_LABELS,
  PLACE_TYPE_LABELS,
  buildGarageHomeModel,
  emptyGarageHomeRecord,
  emptyMailroomRecord,
  parseGarageHomeRecord,
  parseMailroomRecord,
  sydneyDateKey
} from './garage-home-model.js';

const TABS = [
  ['driveway', 'Driveway'],
  ['mailroom', 'Mailroom'],
  ['garage', 'Garage'],
  ['homes', 'Homes']
];
const FILTERS = [['waiting', 'Waiting'], ['filed', 'Filed'], ['ignored', 'Ignored'], ['all', 'All']];
const AUTO_LABELS = {
  rent: ['Rent receipts file themselves', 'Receipts from your agent go straight to the home'],
  statement: ['Statements go to the tax pack', 'Agent statements for an investment file themselves'],
  bill: ['Bills file themselves', 'Gas, power, water and internet for the home']
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function money(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `$${value.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

const km = value => (Number.isFinite(value) ? `${value.toLocaleString('en-AU')} km` : '');
const day = key => (key ? formatDisplayDate(key) : '');
const placeTone = type => (type === 'car' ? 'gold' : type === 'home' ? 'sage' : 'lilac');

function chip(place) {
  if (!place) return '<span class="gh-chip gh-chip--none">Not filed</span>';
  return `<span class="gh-chip gh-chip--${placeTone(place.type)}">${escapeHtml(place.name)}</span>`;
}

function statusPill(status) {
  const label = status === 'waiting' ? 'Waiting for you' : status === 'filed' ? 'Filed' : 'Ignored';
  return `<span class="gh-status gh-status--${status}">${label}</span>`;
}

const SHELL = `
<div class="gh-bar" role="toolbar" aria-label="Garage and Home view">
  <div class="gh-seg" role="tablist" aria-label="Section" data-gh="tabs"></div>
  <div class="gh-bar__actions">
    <button class="btn btn--ghost" type="button" data-gh-open="places">Places</button>
    <button class="btn btn--primary" type="button" data-gh-act="scan">Check mail</button>
  </div>
</div>
<p class="gh-status-line" data-gh="status" role="status" hidden></p>
<div data-gh="body"></div>

<dialog class="gh-sheet" data-gh="visit-sheet" aria-labelledby="gh-visit-title">
  <form class="gh-sheet__panel" method="dialog" data-gh="visit-form" novalidate>
    <header class="gh-sheet__head"><h2 id="gh-visit-title">Log a visit</h2><p>A service, tyres, a repair or a fill of the odometer.</p></header>
    <div class="gh-sheet__body">
      <div class="gh-fields">
        <div class="gh-field"><label for="gh-v-car">Car</label><select id="gh-v-car" name="placeId" data-gh="visit-car"></select></div>
        <div class="gh-field"><label for="gh-v-date">Date</label><input type="date" id="gh-v-date" name="date" required></div>
        <div class="gh-field gh-field--wide"><label for="gh-v-title">What was done</label><input type="text" id="gh-v-title" name="title" placeholder="Regular service" autocomplete="off" required></div>
        <div class="gh-field"><label for="gh-v-provider">Where</label><input type="text" id="gh-v-provider" name="provider" autocomplete="off"></div>
        <div class="gh-field"><label for="gh-v-km">Odometer (km)</label><input type="number" id="gh-v-km" name="km" inputmode="numeric" min="0" step="1"></div>
        <div class="gh-field"><label for="gh-v-cost">Cost ($)</label><input type="number" id="gh-v-cost" name="cost" inputmode="decimal" min="0" step="0.01"></div>
        <div class="gh-field gh-field--wide"><label for="gh-v-note">Note</label><input type="text" id="gh-v-note" name="note" autocomplete="off"></div>
      </div>
      <p class="gh-sheet__error" data-gh="visit-error" role="alert" hidden></p>
    </div>
    <footer class="gh-sheet__foot">
      <button class="btn btn--ghost" type="button" data-gh-close="visit">Cancel</button>
      <button class="btn btn--primary" type="submit">Save visit</button>
    </footer>
  </form>
</dialog>

<dialog class="gh-sheet" data-gh="places-sheet" aria-labelledby="gh-places-title">
  <form class="gh-sheet__panel" method="dialog" data-gh="place-form" novalidate>
    <header class="gh-sheet__head"><h2 id="gh-places-title">Places</h2><p>Each place catches mail through its match words: part of an address, a car name.</p></header>
    <div class="gh-sheet__body" data-gh="places-body"></div>
    <footer class="gh-sheet__foot">
      <button class="btn btn--ghost" type="button" data-gh-close="places">Close</button>
      <button class="btn btn--primary" type="submit" data-gh="place-save">Save place</button>
    </footer>
  </form>
</dialog>
`;

export function createGarageHomeView({ root, api, now = () => new Date(), openSection = () => {}, setTitle = () => {} }) {
  const host = () => root.querySelector('#garage-home-dashboard');
  const q = name => host()?.querySelector(`[data-gh="${name}"]`);
  const state = {
    home: emptyGarageHomeRecord(),
    mailroom: emptyMailroomRecord(),
    gmailConnected: false,
    loaded: false,
    busy: false,
    tab: 'driveway',
    filter: 'waiting',
    selectedMail: null,
    selectedCar: null,
    selectedVisit: null,
    remember: false,
    editingPlace: null,
    placeType: 'car'
  };
  let built = false;
  let model = null;
  const today = () => sydneyDateKey(now());
  const placeById = id => state.home.places.find(p => p.id === id) ?? null;

  function build() {
    const el = host();
    if (!el || built) return;
    el.innerHTML = SHELL;
    built = true;
    wire(el);
  }

  function setStatus(message, tone = 'info') {
    const line = q('status');
    if (!line) return;
    line.hidden = !message;
    line.textContent = message ?? '';
    line.dataset.tone = tone;
  }

  function accept(data) {
    if (!data) return;
    state.home = parseGarageHomeRecord(data.home) ?? emptyGarageHomeRecord();
    state.mailroom = parseMailroomRecord(data.mailroom) ?? emptyMailroomRecord();
    state.gmailConnected = data.gmailConnected === true;
    state.loaded = true;
  }

  async function run(task, { success } = {}) {
    if (state.busy) return null;
    state.busy = true;
    host()?.setAttribute('data-state', 'loading');
    try {
      const data = await task();
      accept(data);
      setStatus('');
      if (success) showHubToast(typeof success === 'function' ? success(data) : success, { tone: 'success' });
      return data;
    } catch (error) {
      if (error?.code === 'gmail_not_connected') setStatus('Gmail isn’t connected yet. Open Places to see how.', 'warn');
      else if (error?.code === 'gmail_reconnect') setStatus('Gmail needs reconnecting: mint a new refresh token (Places explains how).', 'warn');
      else setStatus(error?.message || 'Something went wrong. Please try again.', 'error');
      return null;
    } finally {
      state.busy = false;
      host()?.removeAttribute('data-state');
      update();
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  function wire(el) {
    el.addEventListener('click', event => {
      const t = event.target;
      const tab = t.closest('[data-gh-tab]');
      if (tab) return setTab(tab.dataset.ghTab);
      const filter = t.closest('[data-gh-filter]');
      if (filter) {
        state.filter = filter.dataset.ghFilter;
        state.selectedMail = null;
        return update();
      }
      const mail = t.closest('[data-gh-mail]');
      if (mail) {
        state.selectedMail = mail.dataset.ghMail;
        state.remember = false;
        update();
        host()?.querySelector('.gh-detail')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const act = t.closest('[data-gh-act]');
      if (act) return void onAction(act.dataset.ghAct, act.dataset);
      const go = t.closest('[data-gh-go]');
      if (go) return onGo(go.dataset.ghGo);
      const car = t.closest('[data-gh-car]');
      if (car) {
        state.selectedCar = car.dataset.ghCar;
        state.selectedVisit = null;
        return update();
      }
      const visit = t.closest('[data-gh-visit]');
      if (visit) {
        state.selectedVisit = visit.dataset.ghVisit;
        return update();
      }
      const open = t.closest('[data-gh-open]');
      if (open) return open.dataset.ghOpen === 'visit' ? openVisit() : openPlaces();
      const close = t.closest('[data-gh-close]');
      if (close) return closeSheet(close.dataset.ghClose);
      const editPlace = t.closest('[data-gh-edit-place]');
      if (editPlace) {
        state.editingPlace = editPlace.dataset.ghEditPlace || null;
        state.placeType = placeById(state.editingPlace)?.type ?? 'car';
        return paintPlaces();
      }
      const placeType = t.closest('[data-gh-place-type]');
      if (placeType) {
        state.placeType = placeType.dataset.ghPlaceType;
        return paintPlaces({ keepValues: true });
      }
      return undefined;
    });
    el.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const marker = event.target.closest?.('g[data-gh-visit]');
      if (!marker) return;
      event.preventDefault();
      state.selectedVisit = marker.dataset.ghVisit;
      update();
    });
    el.addEventListener('change', event => {
      if (event.target.matches?.('[data-gh="remember"]')) state.remember = event.target.checked;
    });
    q('visit-form')?.addEventListener('submit', event => {
      event.preventDefault();
      void saveVisit(event.target);
    });
    q('place-form')?.addEventListener('submit', event => {
      event.preventDefault();
      void savePlaceForm(event.target);
    });
  }

  function setTab(tab) {
    state.tab = TABS.some(([id]) => id === tab) ? tab : 'driveway';
    update();
  }

  function onGo(target) {
    if (target === 'mailroom' || target === 'garage' || target === 'homes' || target === 'driveway') return setTab(target);
    if (target === 'property') return openSection('property');
    const place = placeById(target);
    if (!place) return undefined;
    if (place.type === 'car') {
      state.selectedCar = place.id;
      return setTab('garage');
    }
    return setTab('homes');
  }

  async function onAction(action, data) {
    if (action === 'scan') {
      await run(() => api.scan(), {
        success: result => (result?.scan?.status === 'no_places' ? 'Add a place with match words first.' : result?.scan?.added ? `${result.scan.added} new email${result.scan.added === 1 ? '' : 's'} in the Mailroom` : 'Nothing new in the inbox')
      });
      return;
    }
    if (action === 'approve' || action === 'ignore' || action === 'undo') {
      const id = data.ghId;
      await run(() => api.mail({ action, id }), { success: action === 'approve' ? 'Filed' : action === 'ignore' ? 'Ignored' : 'Back in the Mailroom' });
      if (action !== 'undo') state.selectedMail = nextWaiting(id);
      update();
      return;
    }
    if (action === 'move') {
      await run(() => api.mail({ action: 'move', id: data.ghId, placeId: data.ghPlace, remember: state.remember }), {
        success: state.remember ? 'Moved, and that sender will go there from now on' : 'Moved'
      });
      return;
    }
    if (action === 'log-from-mail') {
      const item = state.mailroom.items.find(entry => entry.id === data.ghId);
      if (item) openVisit({ placeId: item.placeId, date: item.facts.eventDate ?? item.date, provider: item.from, title: KIND_LABELS[item.kind] === 'Booking' ? 'Service' : KIND_LABELS[item.kind] });
      return;
    }
    if (action === 'forget') {
      await run(() => api.forgetSender(data.ghFrom), { success: 'Sender rule removed' });
      paintPlaces();
      return;
    }
    if (action === 'prep') {
      await run(() => api.togglePrep(data.ghDate, data.ghItem));
      return;
    }
    if (action === 'needed') {
      await run(() => api.toggleNeeded(data.ghPlace, data.ghItem));
      return;
    }
    if (action === 'remove-visit') {
      await run(() => api.removeVisit(data.ghId), { success: 'Visit removed' });
      state.selectedVisit = null;
      update();
      return;
    }
    if (action === 'autofile') {
      const key = data.ghKey;
      await run(() => api.setAutoFile({ [key]: !state.home.settings.autoFile[key] }));
      paintPlaces();
      return;
    }
    if (action === 'remove-place') {
      const place = placeById(data.ghId);
      if (!place || !globalThis.confirm?.(`Remove ${place.name} and its logged visits?`)) return;
      await run(() => api.removePlace(place.id), { success: 'Place removed' });
      state.editingPlace = null;
      paintPlaces();
      return;
    }
    if (action === 'import') {
      const field = host()?.querySelector('#gh-import');
      let pack;
      try {
        pack = JSON.parse(field?.value ?? '');
      } catch {
        showHubToast('That isn’t valid JSON.', { tone: 'danger' });
        return;
      }
      const result = await run(() => api.importPack(pack), {
        success: res => `Imported ${res?.imported?.places ?? 0} place${res?.imported?.places === 1 ? '' : 's'} and ${res?.imported?.visits ?? 0} visit${res?.imported?.visits === 1 ? '' : 's'}`
      });
      if (result && field) field.value = '';
      paintPlaces();
    }
  }

  function nextWaiting(afterId) {
    const waiting = state.mailroom.items.filter(item => item.status === 'waiting' && item.id !== afterId);
    return waiting[0]?.id ?? null;
  }

  // ── Sheets ────────────────────────────────────────────────────────────────

  function closeSheet(name) {
    const sheet = q(`${name}-sheet`);
    if (sheet?.open) sheet.close();
  }

  function openVisit(prefill = {}) {
    const sheet = q('visit-sheet');
    const form = q('visit-form');
    if (!sheet || !form) return;
    const cars = state.home.places.filter(p => p.type === 'car');
    if (!cars.length) {
      showHubToast('Add a car in Places first.');
      return;
    }
    form.reset();
    q('visit-car').innerHTML = cars.map(car => `<option value="${escapeHtml(car.id)}">${escapeHtml(car.name)}</option>`).join('');
    form.elements.placeId.value = prefill.placeId ?? state.selectedCar ?? cars[0].id;
    form.elements.date.value = prefill.date ?? today();
    if (prefill.provider) form.elements.provider.value = prefill.provider;
    if (prefill.title) form.elements.title.value = prefill.title;
    q('visit-error').hidden = true;
    if (typeof sheet.showModal === 'function' && !sheet.open) sheet.showModal();
  }

  async function saveVisit(form) {
    const f = form.elements;
    const numberOrNull = value => (value === '' ? null : Number(value));
    const visit = {
      placeId: f.placeId.value,
      date: f.date.value,
      title: f.title.value.trim(),
      provider: f.provider.value.trim(),
      km: numberOrNull(f.km.value),
      cost: numberOrNull(f.cost.value),
      note: f.note.value.trim()
    };
    const error = q('visit-error');
    if (!visit.title || !visit.date) {
      error.textContent = 'Add the date and what was done.';
      error.hidden = false;
      return;
    }
    const result = await run(() => api.addVisit(visit), { success: 'Visit logged' });
    if (result) {
      state.selectedCar = visit.placeId;
      closeSheet('visit');
    }
  }

  function openPlaces() {
    const sheet = q('places-sheet');
    if (!sheet) return;
    state.editingPlace = null;
    state.placeType = 'car';
    paintPlaces();
    if (typeof sheet.showModal === 'function' && !sheet.open) sheet.showModal();
  }

  function placeFieldsFor(type, place) {
    const d = place?.details ?? {};
    const v = value => escapeHtml(value ?? '');
    if (type === 'car') {
      return `
        <div class="gh-field"><label for="gh-p-model">Model</label><input id="gh-p-model" name="model" value="${v(d.model)}" autocomplete="off"></div>
        <div class="gh-field"><label for="gh-p-bought">Bought on</label><input type="date" id="gh-p-bought" name="purchasedOn" value="${v(d.purchasedOn)}"></div>
        <div class="gh-field"><label for="gh-p-warranty">Warranty until</label><input type="date" id="gh-p-warranty" name="warrantyUntil" value="${v(d.warrantyUntil)}"></div>
        <div class="gh-field"><label for="gh-p-interval">Service every (km)</label><input type="number" id="gh-p-interval" name="serviceIntervalKm" inputmode="numeric" value="${v(d.serviceIntervalKm ?? 10000)}"></div>
        <label class="gh-check gh-field--wide"><input type="checkbox" name="retired" ${d.retired ? 'checked' : ''}> No longer ours (keep the history, stop catching mail)</label>`;
    }
    if (type === 'home') {
      return `
        <div class="gh-field gh-field--wide"><label for="gh-p-address">Address</label><input id="gh-p-address" name="address" value="${v(d.address)}" autocomplete="off"></div>
        <div class="gh-field"><label for="gh-p-agent">Agent</label><input id="gh-p-agent" name="agent" value="${v(d.agent)}" autocomplete="off"></div>
        <div class="gh-field"><label for="gh-p-rent">Rent a week ($)</label><input type="number" id="gh-p-rent" name="weeklyRent" inputmode="decimal" value="${v(d.weeklyRent)}"></div>
        <div class="gh-field"><label for="gh-p-lease">Lease ends</label><input type="date" id="gh-p-lease" name="leaseEnd" value="${v(d.leaseEnd)}"></div>
        <div class="gh-field"><label for="gh-p-bond">Bond ($)</label><input type="number" id="gh-p-bond" name="bond" inputmode="decimal" value="${v(d.bond)}"></div>
        <div class="gh-field gh-field--wide"><label for="gh-p-prep">Inspection prep list (one per line)</label><textarea id="gh-p-prep" name="prepChecklist" rows="4">${v((d.prepChecklist ?? []).join('\n'))}</textarea></div>`;
    }
    return `
      <div class="gh-field gh-field--wide"><label for="gh-p-address">Address</label><input id="gh-p-address" name="address" value="${v(d.address)}" autocomplete="off"></div>
      <div class="gh-field"><label for="gh-p-agent">Agent</label><input id="gh-p-agent" name="agent" value="${v(d.agent)}" autocomplete="off"></div>
      <div class="gh-field gh-field--wide"><label for="gh-p-needed">Still needed for tax time (one per line)</label><textarea id="gh-p-needed" name="stillNeeded" rows="4">${v((d.stillNeeded ?? []).join('\n'))}</textarea></div>`;
  }

  function paintPlaces({ keepValues = false } = {}) {
    const body = q('places-body');
    if (!body) return;
    const form = q('place-form');
    const kept = keepValues && form ? { name: form.elements.name?.value, match: form.elements.match?.value } : null;
    const editing = state.editingPlace ? placeById(state.editingPlace) : null;
    const type = editing?.type ?? state.placeType;
    const list = state.home.places.length
      ? `<ul class="gh-place-list">${state.home.places.map(p => `
          <li><span>${chip(p)} <small>${escapeHtml(PLACE_TYPE_LABELS[p.type])}${p.match.length ? ` · catches “${escapeHtml(p.match.join('”, “'))}”` : ' · no match words yet'}</small></span>
          <button class="btn btn--ghost" type="button" data-gh-edit-place="${escapeHtml(p.id)}">Edit</button></li>`).join('')}</ul>`
      : '<p class="gh-muted">No places yet. Add your car, the home you rent and any investment.</p>';
    const rules = state.mailroom.senderRules.length
      ? `<ul class="gh-place-list">${state.mailroom.senderRules.map(rule => `<li><span>${escapeHtml(rule.from)} <small>→ ${escapeHtml(placeById(rule.placeId)?.name ?? 'removed place')}</small></span><button class="btn btn--ghost" type="button" data-gh-act="forget" data-gh-from="${escapeHtml(rule.from)}">Forget</button></li>`).join('')}</ul>`
      : '<p class="gh-muted">None yet. Moving an email with “always send this sender here” adds one.</p>';
    body.innerHTML = `
      <section class="gh-sheet__section">${list}</section>
      <fieldset class="gh-fieldset">
        <legend>${editing ? `Edit ${escapeHtml(editing.name)}` : 'Add a place'}</legend>
        ${editing ? '' : `<div class="gh-chips gh-field--wide" role="group" aria-label="Type">${Object.entries(PLACE_TYPE_LABELS).map(([id, label]) => `<button type="button" class="gh-pick" data-gh-place-type="${id}" aria-pressed="${id === type}">${label}</button>`).join('')}</div>`}
        <div class="gh-field"><label for="gh-p-name">Name</label><input id="gh-p-name" name="name" value="${escapeHtml(kept?.name ?? editing?.name ?? '')}" autocomplete="off" required></div>
        <div class="gh-field"><label for="gh-p-match">Match words (comma separated)</label><input id="gh-p-match" name="match" value="${escapeHtml(kept?.match ?? (editing?.match ?? []).join(', '))}" placeholder="${type === 'car' ? 'Car name, rego' : 'Street name'}" autocomplete="off"></div>
        ${placeFieldsFor(type, editing)}
        ${editing ? `<div class="gh-field--wide gh-inline-actions"><button class="btn btn--ghost" type="button" data-gh-edit-place="">Add a new place instead</button><button class="btn btn--ghost gh-danger" type="button" data-gh-act="remove-place" data-gh-id="${escapeHtml(editing.id)}">Remove</button></div>` : ''}
      </fieldset>
      <section class="gh-sheet__section">
        <h3>Autopilot</h3>
        <div class="gh-switches">${AUTO_KINDS.map(key => `<button type="button" class="gh-switch" role="switch" aria-checked="${state.home.settings.autoFile[key] === true}" data-gh-act="autofile" data-gh-key="${key}"><span><b>${AUTO_LABELS[key][0]}</b><small>${AUTO_LABELS[key][1]}</small></span><i aria-hidden="true"></i></button>`).join('')}</div>
      </section>
      <section class="gh-sheet__section"><h3>Remembered senders</h3>${rules}</section>
      <section class="gh-sheet__section">
        <h3>Gmail</h3>
        <p class="gh-muted">${state.gmailConnected ? 'Connected (read-only). The inbox is checked every three hours; Check mail runs it now.' : 'Not connected yet. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in Netlify; docs/garage-home.md walks through it.'}</p>
      </section>
      <section class="gh-sheet__section">
        <h3>Import a setup pack</h3>
        <div class="gh-field"><label for="gh-import">Paste the JSON pack (places and car history)</label><textarea id="gh-import" rows="3" spellcheck="false"></textarea></div>
        <button class="btn btn--ghost" type="button" data-gh-act="import">Import</button>
      </section>`;
  }

  async function savePlaceForm(form) {
    const f = form.elements;
    const editing = state.editingPlace ? placeById(state.editingPlace) : null;
    const type = editing?.type ?? state.placeType;
    const val = name => (f[name] ? f[name].value.trim() : '');
    const numberOrNull = name => (val(name) === '' ? null : Number(val(name)));
    const lines = name => val(name).split('\n').map(x => x.trim()).filter(Boolean);
    const details = type === 'car'
      ? { model: val('model'), purchasedOn: val('purchasedOn') || null, warrantyUntil: val('warrantyUntil') || null, serviceIntervalKm: numberOrNull('serviceIntervalKm'), retired: f.retired?.checked === true }
      : type === 'home'
        ? { address: val('address'), agent: val('agent'), weeklyRent: numberOrNull('weeklyRent'), leaseEnd: val('leaseEnd') || null, bond: numberOrNull('bond'), prepChecklist: lines('prepChecklist') }
        : { address: val('address'), agent: val('agent'), stillNeeded: lines('stillNeeded'), neededDone: editing?.details.neededDone ?? [] };
    const place = { ...(editing ? { id: editing.id } : {}), type, name: val('name'), match: val('match').split(',').map(x => x.trim()).filter(Boolean), details };
    if (!place.name) {
      showHubToast('Give the place a name.', { tone: 'danger' });
      return;
    }
    const result = await run(() => api.savePlace(place), { success: editing ? 'Place saved' : 'Place added' });
    if (result) {
      state.editingPlace = null;
      paintPlaces();
    }
  }

  // ── Painting ──────────────────────────────────────────────────────────────

  function update() {
    build();
    model = buildGarageHomeModel(state.home, state.mailroom, { today: today() });
    paintTabs();
    const body = q('body');
    if (!body) return;
    if (!state.loaded) {
      body.innerHTML = '<p class="gh-muted">Loading…</p>';
      return;
    }
    if (model.isEmpty) {
      body.innerHTML = emptyState();
      return;
    }
    body.innerHTML = state.tab === 'mailroom' ? mailroomView() : state.tab === 'garage' ? garageView() : state.tab === 'homes' ? homesView() : drivewayView();
  }

  function paintTabs() {
    const tabs = q('tabs');
    if (!tabs) return;
    const waiting = model?.mail.waiting.length ?? 0;
    tabs.innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" data-gh-tab="${id}" aria-selected="${state.tab === id}">${label}${id === 'mailroom' && waiting ? ` <span class="gh-count">${waiting}</span>` : ''}</button>`).join('');
  }

  function emptyState() {
    return `<article class="gh-tile gh-empty">
      <p class="gh-kicker">Garage &amp; Home</p>
      <h2 class="gh-h">Add your places and the inbox starts filing for you</h2>
      <p class="gh-sub">A car, the home you rent and any investment. Give each a few match words (a street name, the car's model) and the Mailroom catches every email about it: bookings, rent receipts, agent statements, inspections.</p>
      <div class="gh-inline-actions"><button class="btn btn--primary" type="button" data-gh-open="places">Add places</button></div>
    </article>`;
  }

  // Driveway ──────────────────────────────────────────────────────────────────

  function drivewayView() {
    const m = model;
    const lastScan = m.mail.lastScanAt ? new Date(m.mail.lastScanAt) : null;
    const scanLine = !state.gmailConnected ? 'Gmail isn’t connected yet.' : lastScan ? `Last checked ${day(sydneyDateKey(lastScan))} at ${lastScan.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })}.` : 'Not checked yet.';
    const banner = `
      <button type="button" class="gh-tile gh-banner" data-gh-go="mailroom">
        <span class="gh-kicker">The Mailroom</span>
        <span class="gh-banner__line">${m.mail.waiting.length ? `<em>${m.mail.waiting.length}</em> waiting for a tap` : 'Nothing waiting'}${m.mail.autoFiledRecently ? ` · ${m.mail.autoFiledRecently} filed themselves this fortnight` : ''}</span>
        <span class="gh-sub">${escapeHtml(scanLine)}</span>
      </button>`;
    const needs = m.needsYou.length
      ? `<div class="gh-needs">${m.needsYou.map(n => `<button type="button" class="gh-tile gh-need gh-need--${n.tone}" data-gh-go="${escapeHtml(n.target)}"><span class="gh-need__title">${escapeHtml(n.title)}</span><span class="gh-sub">${escapeHtml(n.detail)}</span></button>`).join('')}</div>`
      : '<p class="gh-muted">Nothing needs you right now.</p>';
    const cards = [
      ...m.cars.filter(c => !c.place.details.retired).map(carCard),
      ...m.homes.map(homeCard),
      ...m.investments.map(investmentCard),
      ...m.cars.filter(c => c.place.details.retired).map(carCard)
    ].join('');
    return `${banner}
      <div class="gh-section-head"><h2>Needs you</h2><p>Raised by what arrived, not reminders you wrote</p></div>
      ${needs}
      <div class="gh-section-head"><h2>Places</h2></div>
      <div class="gh-cards">${cards}</div>`;
  }

  function odometerDigits(car) {
    if (!car.odometer) return '<p class="gh-muted">No odometer reading yet.</p>';
    const digits = String(car.odometer.estimate).split('');
    const ghost = car.odometer.isEstimate ? Math.min(2, digits.length) : 0;
    return `<p class="gh-odo" aria-label="${km(car.odometer.estimate)}${car.odometer.isEstimate ? ' estimated' : ''}">${digits.map((d, i) => `<span class="${i >= digits.length - ghost ? 'is-ghost' : ''}">${d}</span>`).join('')}<small>${car.odometer.isEstimate ? 'km est.' : 'km'}</small></p>`;
  }

  function carCard(car) {
    const p = car.place;
    const last = car.timeline[car.timeline.length - 1];
    return `<button type="button" class="gh-tile gh-card gh-card--car${p.details.retired ? ' is-retired' : ''}" data-gh-go="${escapeHtml(p.id)}">
      <span class="gh-kicker">${p.details.retired ? 'History' : 'Car'}</span>
      <span class="gh-card__title">${escapeHtml(p.name)}</span>
      ${odometerDigits(car)}
      <span class="gh-sub">${last ? `Last: ${escapeHtml(last.title)} · ${day(last.date)}` : 'No visits logged yet'}</span>
    </button>`;
  }

  function homeCard(h) {
    const p = h.place;
    return `<button type="button" class="gh-tile gh-card gh-card--home" data-gh-go="${escapeHtml(p.id)}">
      <span class="gh-kicker">${escapeHtml(PLACE_TYPE_LABELS.home)}</span>
      <span class="gh-card__title">${escapeHtml(p.name)}</span>
      <span class="gh-card__stats">
        ${p.details.weeklyRent ? `<span><b>${money(p.details.weeklyRent)}</b> a week</span>` : ''}
        ${h.nextInspection ? `<span><b>${h.daysToInspection}</b> day${h.daysToInspection === 1 ? '' : 's'} to inspection</span>` : ''}
        ${h.repairs.length ? `<span><b>${h.repairs.length}</b> repair thread${h.repairs.length === 1 ? '' : 's'}</span>` : ''}
      </span>
      <span class="gh-sub">${h.rent[0] ? `Last rent receipt ${day(h.rent[0].date)}` : 'Rent receipts will appear as they arrive'}</span>
    </button>`;
  }

  function investmentCard(inv) {
    const p = inv.place;
    return `<button type="button" class="gh-tile gh-card gh-card--inv" data-gh-go="${escapeHtml(p.id)}">
      <span class="gh-kicker">${escapeHtml(PLACE_TYPE_LABELS.investment)}</span>
      <span class="gh-card__title">${escapeHtml(p.name)}</span>
      <span class="gh-card__stats"><span><b>${inv.packCount}</b> in the FY ${escapeHtml(inv.fy.label)} pack</span>${inv.latestStatement ? `<span>Statement ${inv.latestStatement.facts.number ? `#${inv.latestStatement.facts.number}` : ''} · ${day(inv.latestStatement.date)}</span>` : ''}</span>
      <span class="gh-sub">Money, loan and tax year live on the Property page.</span>
    </button>`;
  }

  // Mailroom ──────────────────────────────────────────────────────────────────

  function mailroomView() {
    const m = model;
    const lists = { waiting: m.mail.waiting, filed: m.mail.filed, ignored: m.mail.ignored, all: state.mailroom.items };
    const items = lists[state.filter] ?? [];
    if (!state.selectedMail || !items.some(item => item.id === state.selectedMail)) state.selectedMail = items[0]?.id ?? null;
    const filters = `<div class="gh-seg gh-seg--small" role="group" aria-label="Show">${FILTERS.map(([id, label]) => `<button type="button" data-gh-filter="${id}" aria-pressed="${state.filter === id}">${label} <span class="gh-count">${(lists[id] ?? []).length}</span></button>`).join('')}</div>`;
    const list = items.length
      ? `<ul class="gh-mail-list">${items.map(item => `<li><button type="button" class="gh-mail${item.id === state.selectedMail ? ' is-on' : ''}" data-gh-mail="${escapeHtml(item.id)}" aria-current="${item.id === state.selectedMail}">
          <span class="gh-mail__top"><b>${escapeHtml(item.from)}</b><time>${day(item.date)}</time></span>
          <span class="gh-mail__subject">${escapeHtml(item.subject)}</span>
          <span class="gh-mail__chips">${chip(placeById(item.placeId))}<span class="gh-kind">${escapeHtml(KIND_LABELS[item.kind])}</span>${statusPill(item.status)}</span>
        </button></li>`).join('')}</ul>`
      : `<p class="gh-muted gh-mail-empty">${state.filter === 'waiting' ? 'Nothing waiting. The Mailroom is clear.' : 'Nothing here yet.'}</p>`;
    const selected = state.mailroom.items.find(item => item.id === state.selectedMail);
    return `<div class="gh-section-head gh-section-head--tight">${filters}<p>${state.gmailConnected ? 'Read-only Gmail. Only emails about your places appear.' : 'Gmail isn’t connected yet.'}</p></div>
      <div class="gh-mailroom">${list}${selected ? mailDetail(selected) : ''}</div>`;
  }

  function mailDetail(item) {
    const place = placeById(item.placeId);
    const facts = [
      ['Place', place ? escapeHtml(place.name) : 'Not filed'],
      ['What it is', escapeHtml(KIND_LABELS[item.kind])],
      item.facts.eventDate ? ['Date in the email', day(item.facts.eventDate)] : null,
      item.facts.amount !== null ? ['Amount', money(item.facts.amount, 2)] : null,
      item.facts.number !== null ? ['Number', `#${item.facts.number}`] : null,
      item.facts.ref ? ['Reference', escapeHtml(item.facts.ref)] : null,
      ['Received', day(item.date)]
    ].filter(Boolean);
    const others = state.home.places.filter(p => p.id !== item.placeId && !(p.type === 'car' && p.details.retired));
    const waitingActions = `
      <div class="gh-inline-actions">
        <button class="btn btn--primary" type="button" data-gh-act="approve" data-gh-id="${escapeHtml(item.id)}">Approve and file</button>
        <button class="btn btn--ghost" type="button" data-gh-act="ignore" data-gh-id="${escapeHtml(item.id)}">Not home stuff</button>
      </div>`;
    const done = `<div class="gh-inline-actions gh-done gh-done--${item.status}"><span>${item.status === 'filed' ? `Filed to ${escapeHtml(place?.name ?? 'a place')}${item.auto ? ' by autopilot' : ''}` : 'Ignored. It stays out of every place.'}</span><button class="btn btn--ghost" type="button" data-gh-act="undo" data-gh-id="${escapeHtml(item.id)}">Undo</button></div>`;
    const move = others.length
      ? `<div class="gh-move"><p class="gh-sub">Wrong place? Move it:</p><div class="gh-chips">${others.map(p => `<button type="button" class="gh-pick gh-pick--${placeTone(p.type)}" data-gh-act="move" data-gh-id="${escapeHtml(item.id)}" data-gh-place="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`).join('')}</div>
         ${item.fromAddress ? `<label class="gh-check"><input type="checkbox" data-gh="remember" ${state.remember ? 'checked' : ''}> Always send ${escapeHtml(item.fromAddress)} there</label>` : ''}</div>`
      : '';
    const logIt = place?.type === 'car' && item.status === 'filed' && ['booking', 'service', 'receipt'].includes(item.kind)
      ? `<div class="gh-inline-actions"><button class="btn btn--ghost" type="button" data-gh-act="log-from-mail" data-gh-id="${escapeHtml(item.id)}">Log this visit with the km</button></div>`
      : '';
    return `<article class="gh-tile gh-detail" aria-live="polite">
      <p class="gh-kicker">${escapeHtml(item.from)}${item.fromAddress ? ` · ${escapeHtml(item.fromAddress)}` : ''}</p>
      <h3 class="gh-h">${escapeHtml(item.subject)}</h3>
      <div class="gh-read">
        <p class="gh-kicker gh-kicker--on-dark">What Life Hub read</p>
        <p class="gh-read__snippet">${escapeHtml(item.snippet)}</p>
        <dl class="gh-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </div>
      ${item.status === 'waiting' ? waitingActions : done}
      ${move}${logIt}
    </article>`;
  }

  // Garage ────────────────────────────────────────────────────────────────────

  function garageView() {
    const cars = model.cars;
    if (!cars.length) return '<p class="gh-muted">No cars yet. Add one in Places.</p>';
    if (!cars.some(c => c.place.id === state.selectedCar)) state.selectedCar = (cars.find(c => !c.place.details.retired) ?? cars[0]).place.id;
    const car = cars.find(c => c.place.id === state.selectedCar);
    const p = car.place;
    const picker = cars.length > 1 ? `<div class="gh-chips" role="group" aria-label="Car">${cars.map(c => `<button type="button" class="gh-pick" data-gh-car="${escapeHtml(c.place.id)}" aria-pressed="${c.place.id === p.id}">${escapeHtml(c.place.name)}</button>`).join('')}</div>` : '';
    const stats = [
      ['Logged spend', car.spend ? money(car.spend) : '—', 'Only visits with a cost count'],
      ['Visits', String(car.visitCount), 'Logged plus filed from mail'],
      car.nextServiceKm ? ['Next service', km(car.nextServiceKm), car.serviceDue ? 'Probably due now' : `${(car.nextServiceKm - (car.odometer?.estimate ?? 0)).toLocaleString('en-AU')} km to go`] : null,
      p.details.warrantyUntil ? ['Warranty', day(p.details.warrantyUntil), car.warrantyLeftDays >= 0 ? `${Math.round(car.warrantyLeftDays / 30.44)} months left` : 'Ended'] : null,
      car.odometer?.perMonth ? ['Driving', `${car.odometer.perMonth.toLocaleString('en-AU')} km`, 'a month, from your own log'] : null
    ].filter(Boolean);
    return `<div class="gh-section-head gh-section-head--tight">${picker}<button class="btn btn--primary" type="button" data-gh-open="visit">Log a visit</button></div>
      <div class="gh-grid">
        <article class="gh-tile gh-car-hero">
          <p class="gh-kicker">${escapeHtml(p.details.model || 'Car')}${p.details.retired ? ' · no longer ours' : ''}</p>
          <h2 class="gh-h gh-h--big">${escapeHtml(p.name)}</h2>
          ${odometerDigits(car)}
          <p class="gh-sub">${car.odometer ? `Last reading ${km(car.odometer.lastKm)} on ${day(car.odometer.lastDate)}.${car.odometer.isEstimate ? ' The faded digits are an estimate from how much you drive.' : ''}` : 'Log a visit with the odometer to start the estimate.'}</p>
        </article>
        <div class="gh-stats">${stats.map(([k, v, s]) => `<div class="gh-tile gh-stat"><p class="gh-kicker">${k}</p><p class="gh-stat__value">${v}</p><p class="gh-sub">${s}</p></div>`).join('')}</div>
      </div>
      <article class="gh-tile gh-road-tile">
        <div class="gh-section-head gh-section-head--tight"><h2>Odometer Road</h2><p>Visits laid out by the kilometre. Tap a marker.</p></div>
        ${roadSvg(car)}
        ${visitDetail(car)}
      </article>
      <div class="gh-section-head"><h2>Every visit</h2><p>Logged by you, or filed from the Mailroom</p></div>
      ${timelineList(car)}`;
  }

  function roadSvg(car) {
    const points = car.timeline.filter(v => v.km !== null);
    if (!points.length) return '<p class="gh-muted">Markers appear once a visit has an odometer reading.</p>';
    const maxKm = Math.max(car.odometer?.estimate ?? 0, ...points.map(v => v.km), 1) * 1.08;
    const W = 1000;
    const x = value => 30 + (value / maxKm) * (W - 60);
    const step = maxKm > 150_000 ? 20_000 : 10_000;
    const ticks = [];
    for (let k = 0; k <= maxKm; k += step) ticks.push(k);
    const markers = points.map((v, i) => {
      const up = i % 2 === 0;
      const on = v.id === state.selectedVisit;
      const cx = x(v.km);
      return `<g class="gh-marker${on ? ' is-on' : ''}" data-gh-visit="${escapeHtml(v.id)}" role="button" tabindex="0" aria-label="${escapeHtml(`${v.title}, ${day(v.date)}, ${km(v.km)}`)}">
        <line x1="${cx}" x2="${cx}" y1="${up ? 52 : 108}" y2="${up ? 80 : 128}" class="gh-marker__stem"></line>
        <circle cx="${cx}" cy="${up ? 44 : 136}" r="${on ? 11 : 8}" class="gh-marker__dot"></circle>
        <text x="${cx}" y="${up ? 22 : 166}" text-anchor="middle" class="gh-marker__label">${escapeHtml(v.title.length > 14 ? `${v.title.slice(0, 13)}…` : v.title)}</text>
      </g>`;
    }).join('');
    const ghost = car.odometer?.isEstimate
      ? `<g class="gh-ghost"><line x1="${x(car.odometer.lastKm)}" x2="${x(car.odometer.estimate)}" y1="104" y2="104"></line><rect x="${x(car.odometer.estimate) - 14}" y="90" width="28" height="28" rx="7"></rect><text x="${x(car.odometer.estimate)}" y="188" text-anchor="middle">you, probably</text></g>`
      : '';
    return `<div class="gh-scroll"><svg viewBox="0 0 ${W} 200" role="img" aria-label="Visits by odometer reading">
      <rect x="10" y="80" width="${W - 20}" height="48" rx="12" class="gh-road"></rect>
      <line x1="20" x2="${W - 20}" y1="104" y2="104" class="gh-road__centre"></line>
      ${ticks.map(k => `<text x="${x(k)}" y="198" text-anchor="middle" class="gh-tick">${k / 1000}k</text>`).join('')}
      ${ghost}${markers}
    </svg></div>`;
  }

  function visitDetail(car) {
    const v = car.timeline.find(entry => entry.id === state.selectedVisit);
    if (!v) return '';
    return `<div class="gh-visit-detail">
      <div><p class="gh-kicker">${day(v.date)}${v.km !== null ? ` · ${km(v.km)}` : ''}</p><p class="gh-h">${escapeHtml(v.title)}</p><p class="gh-sub">${escapeHtml(v.provider)}</p></div>
      <p>${escapeHtml(v.note)}</p>
      <div><p class="gh-stat__value">${v.cost !== null ? money(v.cost, 2) : '—'}</p>${v.source === 'manual' ? `<button class="btn btn--ghost gh-danger" type="button" data-gh-act="remove-visit" data-gh-id="${escapeHtml(v.id)}">Remove</button>` : '<span class="gh-kind">From the Mailroom</span>'}</div>
    </div>`;
  }

  function timelineList(car) {
    if (!car.timeline.length) return '<p class="gh-muted">Nothing logged yet.</p>';
    return `<ul class="gh-timeline">${[...car.timeline].reverse().map(v => `<li><button type="button" class="gh-timeline__row${v.id === state.selectedVisit ? ' is-on' : ''}" data-gh-visit="${escapeHtml(v.id)}">
      <time>${day(v.date)}</time><span><b>${escapeHtml(v.title)}</b><small>${escapeHtml([v.provider, v.km !== null ? km(v.km) : ''].filter(Boolean).join(' · '))}</small></span><span class="gh-timeline__amt">${v.cost !== null ? money(v.cost, 2) : ''}${v.source === 'mail' ? '<span class="gh-kind">Mail</span>' : ''}</span>
    </button></li>`).join('')}</ul>`;
  }

  // Homes ─────────────────────────────────────────────────────────────────────

  function homesView() {
    const parts = [...model.homes.map(homeSection), ...model.investments.map(investmentSection)];
    return parts.length ? parts.join('') : '<p class="gh-muted">No homes yet. Add the home you rent or an investment in Places.</p>';
  }

  function homeSection(h) {
    const p = h.place;
    const inspection = h.nextInspection
      ? `<article class="gh-tile gh-inspection">
          <div class="gh-inspection__head"><div><p class="gh-kicker">Routine inspection · from the Mailroom</p><h3 class="gh-h">${day(h.nextInspection.facts.eventDate)}</h3><p class="gh-sub">${escapeHtml(h.nextInspection.from)}</p></div>
          <p class="gh-ring"><b>${h.daysToInspection}</b><small>day${h.daysToInspection === 1 ? '' : 's'}</small></p></div>
          <p class="gh-progress"><span style="width:${Math.round((h.prep.doneCount / Math.max(1, h.prep.items.length)) * 100)}%"></span></p>
          <ul class="gh-checklist">${h.prep.items.map(entry => `<li><button type="button" class="gh-check-row" role="checkbox" aria-checked="${entry.done}" data-gh-act="prep" data-gh-date="${escapeHtml(h.prep.forDate)}" data-gh-item="${escapeHtml(entry.item)}"><i aria-hidden="true"></i>${escapeHtml(entry.item)}</button></li>`).join('')}</ul>
        </article>`
      : '<article class="gh-tile"><p class="gh-kicker">Inspections</p><p class="gh-sub">When the agent emails an inspection notice, the date and a prep checklist appear here.</p></article>';
    const rent = `<article class="gh-tile"><p class="gh-kicker">Rent</p>
      ${p.details.weeklyRent ? `<p class="gh-stat__value">${money(p.details.weeklyRent)} <small>a week</small></p>` : ''}
      ${h.rent.length ? `<ol class="gh-receipts">${[...h.rent].reverse().map(r => `<li><span></span><small>${day(r.facts.eventDate ?? r.date)}</small></li>`).join('')}</ol><p class="gh-sub">Each receipt fills a block on its own.</p>` : '<p class="gh-sub">Rent receipts will fill in as they arrive.</p>'}
    </article>`;
    const lease = `<article class="gh-tile"><p class="gh-kicker">Lease</p>
      <dl class="gh-facts gh-facts--light"><div><dt>Lease ends</dt><dd>${p.details.leaseEnd ? day(p.details.leaseEnd) : 'Add in Places'}</dd></div><div><dt>Bond</dt><dd>${p.details.bond ? money(p.details.bond) : 'Add in Places'}</dd></div><div><dt>Agent</dt><dd>${escapeHtml(p.details.agent || '—')}</dd></div></dl>
      ${h.lease.length ? `<p class="gh-sub">Latest: ${escapeHtml(h.lease[0].subject)}</p>` : ''}
    </article>`;
    const repairs = h.repairs.length
      ? h.repairs.map(r => `<article class="gh-tile gh-repair"><p class="gh-kicker">Repair · ${r.steps.length} email${r.steps.length === 1 ? '' : 's'}</p><h3 class="gh-h">${escapeHtml(r.subject)}</h3>
          <ol class="gh-steps">${r.steps.map(s => `<li><time>${day(s.date)}</time><span><b>${escapeHtml(s.from)}</b>${escapeHtml(s.snippet.slice(0, 160))}${s.snippet.length > 160 ? '…' : ''}</span></li>`).join('')}</ol></article>`).join('')
      : '<p class="gh-muted">No repair threads filed.</p>';
    const bills = h.bills.length ? `<ul class="gh-timeline">${h.bills.map(b => `<li><div class="gh-timeline__row"><time>${day(b.date)}</time><span><b>${escapeHtml(b.from)}</b><small>${escapeHtml(b.subject)}</small></span><span class="gh-timeline__amt">${b.facts.amount !== null ? money(b.facts.amount, 2) : ''}</span></div></li>`).join('')}</ul>` : '<p class="gh-muted">Bills will appear as they arrive.</p>';
    return `<section class="gh-place-section">
      <div class="gh-section-head"><div><p class="gh-kicker">${escapeHtml(PLACE_TYPE_LABELS.home)}</p><h2>${escapeHtml(p.name)}</h2></div><p>${escapeHtml(p.details.address || p.details.agent || '')}</p></div>
      <div class="gh-grid gh-grid--home">${inspection}<div class="gh-stack">${rent}${lease}</div></div>
      <div class="gh-section-head"><h2>Repairs</h2><p>Each step comes from an email</p></div>${repairs}
      <div class="gh-section-head"><h2>Bills</h2></div>${bills}
    </section>`;
  }

  function investmentSection(inv) {
    const p = inv.place;
    const group = (label, items) => (items.length ? `<div class="gh-pack__group"><p class="gh-kicker">${label} · ${items.length}</p><ul>${items.map(i => `<li><time>${day(i.date)}</time><span>${escapeHtml(i.subject)}</span>${i.facts.amount !== null ? `<b>${money(i.facts.amount, 2)}</b>` : ''}</li>`).join('')}</ul></div>` : '');
    const pack = inv.packCount
      ? `${group('Statements', inv.pack.statements)}${group('Jobs', inv.pack.jobs)}${group('Inspections', inv.pack.inspections)}${group('Tax paperwork', inv.pack.tax)}${group('Other', inv.pack.other)}`
      : '<p class="gh-muted">Nothing filed for this financial year yet.</p>';
    const needed = inv.stillNeeded.length
      ? `<ul class="gh-checklist gh-checklist--dark">${inv.stillNeeded.map(entry => `<li><button type="button" class="gh-check-row" role="checkbox" aria-checked="${entry.done}" data-gh-act="needed" data-gh-place="${escapeHtml(p.id)}" data-gh-item="${escapeHtml(entry.item)}"><i aria-hidden="true"></i>${escapeHtml(entry.item)}</button></li>`).join('')}</ul>`
      : '<p class="gh-sub gh-on-dark-muted">Add the paperwork your accountant still needs in Places.</p>';
    return `<section class="gh-place-section">
      <div class="gh-section-head"><div><p class="gh-kicker">${escapeHtml(PLACE_TYPE_LABELS.investment)}</p><h2>${escapeHtml(p.name)}</h2></div><button class="btn btn--ghost" type="button" data-gh-go="property">Open the Property page</button></div>
      <div class="gh-grid gh-grid--home">
        <article class="gh-tile gh-pack">
          <div class="gh-pack__head"><div><p class="gh-kicker">Tax-time pack · FY ${escapeHtml(inv.fy.label)}</p><p class="gh-sub">Built from filed mail. The Property page keeps the money; this keeps the paperwork.</p></div>
          <p class="gh-ring gh-ring--light"><b>${Math.round(inv.yearProgress * 100)}%</b><small>of the year</small></p></div>
          ${pack}
        </article>
        <article class="gh-tile gh-needed"><p class="gh-kicker gh-kicker--on-dark">Still needed</p>${needed}</article>
      </div>
    </section>`;
  }

  return {
    async show() {
      build();
      setTitle('Garage & Home');
      if (!state.loaded) update();
      await run(() => api.load());
    },
    update,
    get state() {
      return state;
    }
  };
}
