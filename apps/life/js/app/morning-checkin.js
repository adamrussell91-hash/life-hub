/**
 * Morning check-in on the Life dashboard (#morning-checkin).
 *
 * "How are you starting today?" with one to three conditional bubble questions chosen from
 * yesterday's evidence. Nothing is preselected. Done saves the observation beside the
 * prediction issued before it; Skip saves a skip. Either way the card disappears for the
 * day. When the answer lands well outside the forecast band it asks "What did we miss?"
 * once — the observation is already saved, so the reason is optional.
 *
 * Shown until 2 pm Sydney time; after that a morning check-in is no longer a morning one.
 */
import {
  DISCREPANCY_REASONS,
  isDiscrepancy,
  morningContext,
  previewCheckin,
  selectQuestions
} from '../../../../packages/design-kit/js/calendar/readiness-model.js';
import { getSydneyMinutesOfDay } from '../core/time.js';

const ENDPOINT = '/api/readiness-checkin';
export const CHECKIN_CLOSES_MINUTES = 14 * 60;

let generation = 0;

/** Recent check-ins as Life events, for the calendar and dial. Never throws. */
export async function loadRecentCheckins(apiFetch, today, days = 16) {
  try {
    const [y, m, d] = today.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
    const data = await readJson(await apiFetch(`${ENDPOINT}?from=${from}&to=${today}`));
    return (data.checkins ?? []).filter(r => r?.type === 'readiness_checkin').map(record => ({ record, body: '', path: null }));
  } catch {
    return [];
  }
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hide(host) {
  host.replaceChildren();
  host.setAttribute('hidden', '');
}

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw new Error('request_failed');
  return payload.data;
}

function bubbleGroup(doc, question, onPick) {
  const group = el(doc, 'fieldset', 'checkin__question');
  group.dataset.question = question.id;
  group.append(el(doc, 'legend', 'checkin__prompt', question.prompt));
  const row = el(doc, 'div', 'checkin__bubbles');
  for (const [code, label] of question.options) {
    const button = el(doc, 'button', 'checkin__bubble', label);
    button.type = 'button';
    button.dataset.answer = code;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      for (const other of row.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      onPick(question.id, pressed ? null : code);
    });
    row.append(button);
  }
  group.append(row);
  return group;
}

/** Build everything the card needs from loaded Life events. Pure; exported for tests. */
export function planCheckin(events, date, now = new Date()) {
  const context = morningContext(events, date);
  const predicted = previewCheckin(context);
  const questions = selectQuestions(context.state, context.yesterday, { symptoms: context.symptoms });
  return {
    context,
    questions,
    prediction: { pct: predicted.pct, low: predicted.low, high: predicted.high, issued_at: now.toISOString() },
    explanation: predicted.explanation
  };
}

function renderReason(doc, host, { apiFetch, date, saved }) {
  host.replaceChildren();
  const card = el(doc, 'div', 'checkin__card metric-card');
  card.append(el(doc, 'p', 'section-kicker', 'Morning check-in · saved'));
  card.append(el(doc, 'h2', 'checkin__title', 'That’s a bigger difference. What did we miss?'));
  card.append(el(doc, 'p', 'metric-caption', `Forecast ${saved.predicted_estimate}, you came in at ${saved.final_estimate}. Your answer already counts; this just helps the forecast learn.`));
  const row = el(doc, 'div', 'checkin__bubbles');
  const noteWrap = el(doc, 'div', 'checkin__note');
  noteWrap.hidden = true;
  const note = el(doc, 'input', 'hub-search');
  note.type = 'text';
  note.maxLength = 280;
  note.placeholder = 'What was it? (optional)';
  note.setAttribute('aria-label', 'What else was it?');
  const saveNote = el(doc, 'button', 'btn btn--primary', 'Save');
  saveNote.type = 'button';
  noteWrap.append(note, saveNote);
  const status = el(doc, 'p', 'metric-caption checkin__status');
  status.setAttribute('aria-live', 'polite');

  const send = async (codes, text) => {
    status.textContent = 'Saving…';
    try {
      await readJson(await apiFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, action: 'reason', reason_codes: codes, ...(text ? { note: text } : {}) })
      }));
      hide(host);
    } catch {
      status.textContent = 'Couldn’t save that reason. Try again, or close.';
    }
  };

  for (const [code, label] of DISCREPANCY_REASONS) {
    const button = el(doc, 'button', 'checkin__bubble', label);
    button.type = 'button';
    button.dataset.reason = code;
    button.addEventListener('click', () => {
      if (code === 'something_else') {
        noteWrap.hidden = false;
        note.focus();
        return;
      }
      void send([code]);
    });
    row.append(button);
  }
  saveNote.addEventListener('click', () => void send(['something_else'], note.value.trim()));
  const close = el(doc, 'button', 'btn btn--ghost checkin__skip', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => hide(host));
  card.append(row, noteWrap, status, close);
  host.append(card);
}

/**
 * Paint the card if today's check-in is still open. Safe to call on every Home render.
 * options: { apiFetch, events, date, now?, onSaved?(record) }
 */
export async function renderMorningCheckin(root, { apiFetch, events = [], date, now = () => new Date(), onSaved = () => {} } = {}) {
  const doc = root.ownerDocument ?? root;
  const host = root.querySelector('#morning-checkin');
  if (!host || typeof apiFetch !== 'function' || !date) return;
  const mine = ++generation;
  if (getSydneyMinutesOfDay(now()) >= CHECKIN_CLOSES_MINUTES) return hide(host);
  if (host.dataset.date === date && host.childElementCount) return; // already showing today's card

  let done = true;
  try {
    done = (await readJson(await apiFetch(`${ENDPOINT}?date=${encodeURIComponent(date)}`))).done === true;
  } catch {
    done = true; // can't tell: stay out of the way rather than ask twice
  }
  if (mine !== generation) return;
  if (done) return hide(host);

  const plan = planCheckin(events, date, now());
  const answers = {};
  host.dataset.date = date;
  host.replaceChildren();
  const card = el(doc, 'div', 'checkin__card metric-card');
  const head = el(doc, 'div', 'checkin__head');
  const titles = el(doc, 'div');
  titles.append(el(doc, 'p', 'section-kicker', 'Morning check-in'));
  const title = el(doc, 'h2', 'checkin__title', 'How are you starting today?');
  title.id = 'checkin-title';
  titles.append(title);
  const forecast = el(doc, 'p', 'checkin__forecast');
  forecast.append(el(doc, 'strong', null, String(plan.prediction.pct)), el(doc, 'span', null, ' forecast'));
  head.append(titles, forecast);
  card.append(head, el(doc, 'p', 'metric-caption checkin__why', plan.explanation));

  const done$ = el(doc, 'button', 'btn btn--primary', 'Done');
  done$.type = 'button';
  done$.disabled = true;
  for (const question of plan.questions) {
    card.append(bubbleGroup(doc, question, (id, code) => {
      if (code) answers[id] = code;
      else delete answers[id];
      done$.disabled = Object.keys(answers).length === 0;
    }));
  }
  const status = el(doc, 'p', 'metric-caption checkin__status');
  status.setAttribute('aria-live', 'polite');
  const skip = el(doc, 'button', 'btn btn--ghost checkin__skip', 'Skip today');
  skip.type = 'button';
  const actions = el(doc, 'div', 'checkin__actions');
  actions.append(skip, done$);
  card.append(actions, status);
  host.append(card);
  host.setAttribute('aria-labelledby', 'checkin-title');
  host.removeAttribute('hidden');

  const post = async (body) => readJson(await apiFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }));

  skip.addEventListener('click', async () => {
    skip.disabled = true;
    done$.disabled = true;
    status.textContent = 'Skipping…';
    try {
      const data = await post({ date, skipped: true, prediction: plan.prediction });
      hide(host);
      onSaved(data.checkin);
    } catch {
      status.textContent = 'Couldn’t save. Try again.';
      skip.disabled = false;
      done$.disabled = Object.keys(answers).length === 0;
    }
  });

  done$.addEventListener('click', async () => {
    const result = previewCheckin(plan.context, answers);
    done$.disabled = true;
    skip.disabled = true;
    status.textContent = 'Saving…';
    try {
      const data = await post({ date, answers, questions: plan.questions.map(q => q.id), prediction: plan.prediction, final: result.pct });
      onSaved(data.checkin);
      if (isDiscrepancy(plan.prediction, result.pct)) renderReason(doc, host, { apiFetch, date, saved: data.checkin });
      else hide(host);
    } catch {
      status.textContent = 'Couldn’t save your check-in. Try again.';
      done$.disabled = false;
      skip.disabled = false;
    }
  });
}
