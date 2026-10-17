import type { Block } from '@/schemas/block';
import { apiPost } from '@/api/client';
import type { RenderMode, RenderContext } from '@/blocks/render';
import './peer-feedback.css';

type PeerBlock = Extract<Block, { block_type: 'peer_feedback' }>;
type Feedback = { strength: string; suggestion: string };
type State = {
  phase: 'idle' | 'write' | 'review' | 'results'; session?: string; code?: string;
  taken?: string[]; identity?: string; text?: string; submitted?: boolean;
  reviewed?: boolean; assigned_text?: string; received?: Feedback; included?: boolean;
  rows?: { id: string; joined: boolean; text: string; review?: Feedback }[];
};
type Identity = { session: string; identity: string; token: string };
const colours = [['Blue', 'var(--wave)'], ['Green', 'var(--success)'], ['Orange', 'var(--high-sea)'], ['Gold', 'var(--pastel-gold-ink)'], ['Purple', 'var(--pastel-lilac-ink)'], ['Grey', 'var(--orca)']];
const symbols = [['Star', '★'], ['Circle', '●'], ['Moon', '☾'], ['Flower', '✿'], ['Diamond', '◆'], ['Triangle', '▲']];
const ids = Array.from({ length: 36 }, (_, i) => `${i % 6}-${Math.floor(i / 6)}`);
function label(id: string): string { const [c, s] = id.split('-').map(Number); return `${colours[c]?.[0]} ${symbols[s]?.[0]}`; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function button(text: string, action: () => void) {
  const node = el('button', text); node.type = 'button'; node.className = 'btn btn--secondary'; node.addEventListener('click', action); return node;
}
function load<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } }
function save(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }

export function createPeerFeedbackEditor(block: PeerBlock, onChange: (b: PeerBlock) => void, lessonId?: string): HTMLElement {
  const root = el('div'); root.className = 'peer-feedback';
  let current = block;
  for (const [field, title] of [['prompt', 'Writing prompt'], ['strength_prompt', 'Strength feedback prompt'], ['suggestion_prompt', 'Suggestion feedback prompt']] as const) {
    const wrap = el('label', title); const input = el('textarea'); input.value = current.content[field]; input.rows = field === 'prompt' ? 4 : 2; input.maxLength = field === 'prompt' ? 4000 : 300;
    input.addEventListener('input', () => { current = { ...current, content: { ...current.content, [field]: input.value } }; onChange(current); });
    wrap.append(input); root.append(wrap);
  }
  if (lessonId) root.append(mountExchange(block, lessonId, true));
  else root.append(el('p', 'Open this block in a lesson to run a peer-feedback activity.'));
  return root;
}
export function renderPeerFeedback(block: PeerBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section'); root.className = 'peer-feedback'; root.dataset.blockId = block.id;
  root.append(el('h3', 'Peer feedback'), el('p', block.content.prompt || 'Write, exchange feedback, and reflect.'));
  if (mode === 'print') {
    root.append(el('p', block.content.strength_prompt), el('p', block.content.suggestion_prompt)); return root;
  }
  if (ctx.lessonId) root.append(mountExchange(block, ctx.lessonId, mode === 'teacher'));
  else root.append(el('p', 'Publish and open the lesson to take part.'));
  return root;
}
function mountExchange(block: PeerBlock, lessonId: string, teacher: boolean): HTMLElement {
  const root = el('div'); root.className = 'peer-feedback__exchange';
  const status = el('p'); status.setAttribute('role', 'status');
  const body = el('div'); root.append(status, body);
  const endpoint = teacher ? `/api/lessons/${encodeURIComponent(lessonId)}/peer-feedback/${encodeURIComponent(block.id)}` : `/api/published/peer-feedback/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const storage = `peer-feedback:${lessonId}:${block.id}`;
  let identity = load<Identity | null>(`${storage}:identity`, null);
  let state: State = { phase: 'idle' }; let previous = ''; let busy = false; let joinCode = '';
  const excluded = new Set<string>();
  async function request(action = 'status', extra: Record<string, unknown> = {}, preserveError = false) {
    if (busy) return;
    busy = true;
    root.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const next = await apiPost<State>(endpoint, { ...identity, action, ...extra });
      state = next;
      if (identity && state.session && identity.session !== state.session) { identity = null; localStorage.removeItem(`${storage}:identity`); }
      const signature = JSON.stringify(next);
      if (signature !== previous || action !== 'status') { previous = signature; paint(); }
      if (!preserveError) status.textContent = '';
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : 'Unable to load activity. Try again.';
      if (identity && e instanceof Error && /identity|activity code|Join again/.test(e.message)) {
        identity = null; localStorage.removeItem(`${storage}:identity`); previous = '';
        window.setTimeout(() => { void request('status', {}, true); }, 0);
      }
    } finally { busy = false; root.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  function draftKey(field: string) { return `${storage}:${state.session}:${identity?.identity ?? 'draft'}:${field}`; }
  function textField(title: string, field: string, max: number, host: HTMLElement = body) {
    const wrap = el('label', title); const input = el('textarea'); input.rows = 6; input.maxLength = max; input.value = load<string>(draftKey(field), '');
    input.addEventListener('input', () => { try { save(draftKey(field), input.value); } catch { status.textContent = 'Device storage is unavailable. Keep this page open until your work is submitted.'; } });
    wrap.append(input); host.append(wrap); return input;
  }
  function actions(...buttons: HTMLButtonElement[]) { const bar = el('div'); bar.className = 'peer-feedback__actions'; bar.append(...buttons); body.append(bar); return bar; }
  function formFields() {
    const form = el('div'); form.className = 'peer-feedback__form';
    const fields = el('div'); fields.className = 'peer-feedback__fields';
    form.append(fields); body.append(form); return { form, fields };
  }
  function paint() {
    const scrollY = window.scrollY;
    body.replaceChildren();
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    if (teacher) {
      if (state.phase === 'idle' || state.phase === 'results') actions(button('Start new activity', () => { excluded.clear(); void request('start'); }));
      if (state.phase === 'idle') { body.append(el('p', 'Publish the lesson, then start an activity. Students join from this block in their lesson.')); return; }
      body.append(el('p', `Activity code: ${state.code} · ${state.phase === 'write' ? 'Writing' : state.phase === 'review' ? 'Giving feedback' : 'Reading feedback'}`));
      const rows = state.rows ?? [];
      body.append(el('p', `${rows.filter(r => r.joined).length} joined · ${rows.filter(r => r.text).length} submitted · ${rows.filter(r => r.review).length} reviews submitted`));
      if (state.phase === 'write') actions(button('Start feedback round', () => { void request('review', { exclude: [...excluded] }); }), button('End activity', () => { void request('close'); }));
      if (state.phase === 'review') actions(button('Return feedback to writers', () => { void request('results'); }));
      for (const row of rows.filter(r => r.text)) {
        const card = el('article'); card.className = 'peer-feedback__writing'; card.append(el('h4', label(row.id)), el('p', row.text));
        if (state.phase === 'write') {
          const include = el('label'); const check = el('input'); check.type = 'checkbox'; check.checked = !excluded.has(row.id);
          check.addEventListener('change', () => { if (check.checked) excluded.delete(row.id); else excluded.add(row.id); }); include.append(check, document.createTextNode(' Include in peer review')); card.append(include);
        }
        if (row.review) card.append(el('h5', 'Feedback given'), el('p', row.review.strength), el('p', row.review.suggestion));
        body.append(card);
      }
      return;
    }
    if (state.phase === 'idle') { body.append(el('p', 'Your teacher has not started this activity yet.')); return; }
    if (!identity || !state.identity) {
      if (state.phase !== 'write') { body.append(el('p', 'Joining has closed for this activity.')); return; }
      body.append(el('p', 'Enter the activity code and choose a coloured symbol. No account needed.'));
      const codeLabel = el('label', 'Activity code'); const code = el('input'); code.inputMode = 'numeric'; code.maxLength = 6; code.autocomplete = 'off'; code.value = joinCode; code.addEventListener('input', () => { joinCode = code.value; }); codeLabel.append(code); body.append(codeLabel);
      const available = ids.filter(id => !state.taken?.includes(id));
      if (!available.length) body.append(el('p', 'All 36 identities have been chosen. Ask your teacher to work with a partner.'));
      const picker = el('div'); picker.className = 'peer-feedback__picker';
      for (const id of available) {
        const [c, s] = id.split('-').map(Number);
        const choice = button(`${symbols[s][1]} ${label(id)}`, () => {
          if (!/^\d{6}$/.test(code.value.trim())) { status.textContent = 'Enter the six-digit activity code first.'; return; }
          const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
          const candidate = { session: state.session!, identity: id, token };
          try { save(`${storage}:identity`, candidate); identity = candidate; } catch { status.textContent = 'Enable device storage to join this activity.'; return; }
          void request('join', { code: code.value.trim() });
        });
        choice.style.borderInlineStart = `8px solid ${colours[c][1]}`; picker.append(choice);
      }
      body.append(picker); return;
    }
    body.append(el('p', `You are ${label(identity.identity)}. This device remembers your writing and feedback.`));
    if (state.phase === 'write' && !state.submitted) {
      const { form, fields } = formFields();
      const writing = textField('Your writing', 'writing', 8000, fields);
      form.append(actions(button('Submit writing', () => { void request('submit', { text: writing.value }); }))); 
    } else if (state.phase === 'write') body.append(el('p', 'Writing submitted. Your teacher will start the feedback round.'));
    const originalText = state.text || load<string>(draftKey('writing'), '');
    if (originalText && (state.submitted || state.phase !== 'write')) { const original = el('article'); original.className = 'peer-feedback__writing'; original.append(el('h4', 'Your writing'), el('p', originalText)); body.append(original); }
    if (state.phase === 'review' && state.assigned_text) {
      const work = el('article'); work.className = 'peer-feedback__writing'; work.append(el('h4', 'Writing to review'), el('p', state.assigned_text)); body.append(work);
      if (!state.reviewed) {
        const { form, fields } = formFields();
        const strength = textField(block.content.strength_prompt, 'strength', 2000, fields);
        const suggestion = textField(block.content.suggestion_prompt, 'suggestion', 2000, fields);
        form.append(actions(button('Send feedback', () => { void request('feedback', { strength: strength.value, suggestion: suggestion.value }); }))); 
      } else body.append(el('p', 'Feedback sent. Your teacher will return everyone’s feedback.'));
    } else if (state.phase === 'review') body.append(el('p', 'Your writing is not included in this feedback round.'));
    if (state.phase === 'results') {
      body.append(el('h4', 'Feedback on your writing'));
      if (state.received) body.append(el('h5', block.content.strength_prompt), el('p', state.received.strength), el('h5', block.content.suggestion_prompt), el('p', state.received.suggestion));
      else body.append(el('p', state.included ? 'Your reviewer has not submitted feedback.' : 'Your writing was not included in this feedback round.'));
    }
  }
  root.append(button('Refresh activity', () => { void request(); }));
  void request();
  const poll = () => { window.setTimeout(() => { if (!root.isConnected) return; void request('status', {}, true).finally(poll); }, 8000); }; poll();
  return root;
}
