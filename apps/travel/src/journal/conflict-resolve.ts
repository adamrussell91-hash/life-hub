import { ApiClientError } from '@/api/client';
import type { JournalDocument } from '@/api/journal';
import { getJournal, saveJournal } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { makeMomentId } from '@/journal/moment-operations';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export type MomentConflictField =
  | 'text'
  | 'local_time'
  | 'local_date'
  | 'place'
  | 'coordinates'
  | 'media_ids';

export const MOMENT_CONFLICT_FIELDS: MomentConflictField[] = [
  'text',
  'local_time',
  'local_date',
  'place',
  'coordinates',
  'media_ids',
];

export type FieldPick = 'server' | 'local';

export type MomentConflictResolution =
  | { mode: 'fields'; fields: Partial<Record<MomentConflictField, FieldPick>> }
  | { mode: 'keep_both' };

export type MomentConflictPlan = {
  momentId: string;
  server: JournalMoment;
  local: JournalMoment;
  fields: MomentConflictField[];
};

export function isJournalSaveConflict(err: unknown): boolean {
  return err instanceof ApiClientError && (err.code === 'conflict' || err.status === 409);
}

function fieldValue(moment: JournalMoment, field: MomentConflictField): unknown {
  if (field === 'place') return moment.place ?? null;
  if (field === 'coordinates') return moment.coordinates ?? null;
  if (field === 'media_ids') return [...moment.media_ids].sort();
  return moment[field] ?? null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function momentFieldConflicts(
  server: JournalMoment,
  local: JournalMoment,
): MomentConflictField[] {
  const out: MomentConflictField[] = [];
  for (const field of MOMENT_CONFLICT_FIELDS) {
    if (stableJson(fieldValue(server, field)) !== stableJson(fieldValue(local, field))) {
      out.push(field);
    }
  }
  return out;
}

export function planMomentConflicts(
  serverJournal: JournalDocument,
  localJournal: JournalDocument,
): MomentConflictPlan[] {
  const plans: MomentConflictPlan[] = [];
  const localById = new Map(
    localJournal.moments.filter((m) => m.lifecycle === 'live').map((m) => [m.id, m]),
  );
  for (const sm of serverJournal.moments) {
    if (sm.lifecycle !== 'live') continue;
    const lm = localById.get(sm.id);
    if (!lm) continue;
    const fields = momentFieldConflicts(sm, lm);
    if (fields.length) plans.push({ momentId: sm.id, server: sm, local: lm, fields });
  }
  return plans;
}

function pickField(
  field: MomentConflictField,
  server: JournalMoment,
  local: JournalMoment,
  pick: FieldPick,
): Partial<JournalMoment> {
  const source = pick === 'local' ? local : server;
  switch (field) {
    case 'text':
      return { text: source.text };
    case 'local_time':
      return { local_time: source.local_time };
    case 'local_date':
      return { local_date: source.local_date };
    case 'place':
      return { place: source.place };
    case 'coordinates':
      return {
        coordinates: source.coordinates,
        location_source: source.location_source,
      };
    case 'media_ids':
      return { media_ids: [...source.media_ids] };
    default:
      return {};
  }
}

function applyFieldResolution(
  server: JournalMoment,
  local: JournalMoment,
  resolution: MomentConflictResolution,
): JournalMoment {
  if (resolution.mode === 'keep_both') return server;
  let merged = { ...server };
  for (const field of MOMENT_CONFLICT_FIELDS) {
    const pick = resolution.fields[field];
    if (!pick) continue;
    merged = { ...merged, ...pickField(field, server, local, pick) };
  }
  return merged;
}

function cloneMomentForKeepBoth(local: JournalMoment, displayOrder: number): JournalMoment {
  return {
    ...local,
    id: makeMomentId(),
    display_order: displayOrder,
  };
}

export function mergeJournalAfterConflict(
  serverJournal: JournalDocument,
  localJournal: JournalDocument,
  resolutions: Record<string, MomentConflictResolution>,
): JournalDocument {
  const plans = planMomentConflicts(serverJournal, localJournal);
  const conflictIds = new Set(plans.map((p) => p.momentId));
  const serverIds = new Set(serverJournal.moments.map((m) => m.id));

  const extraMoments: JournalMoment[] = [];
  const moments = serverJournal.moments.map((sm) => {
    if (!conflictIds.has(sm.id)) return sm;
    const plan = plans.find((p) => p.momentId === sm.id)!;
    const resolution = resolutions[sm.id];
    if (!resolution) return sm;
    if (resolution.mode === 'keep_both') {
      const maxOrder = Math.max(
        ...serverJournal.moments
          .filter((m) => m.leg_id === sm.leg_id && m.local_date === sm.local_date)
          .map((m) => m.display_order),
        sm.display_order,
      );
      extraMoments.push(cloneMomentForKeepBoth(plan.local, maxOrder + 1));
      return sm;
    }
    return applyFieldResolution(plan.server, plan.local, resolution);
  });

  for (const lm of localJournal.moments) {
    if (lm.lifecycle !== 'live' || serverIds.has(lm.id)) continue;
    moments.push(lm);
  }

  const mergedMediaIds = new Set<string>();
  for (const m of [...moments, ...extraMoments]) {
    for (const id of m.media_ids) mergedMediaIds.add(id);
  }
  const media = [
    ...serverJournal.media,
    ...localJournal.media.filter((m) => !serverJournal.media.some((s) => s.id === m.id)),
  ].filter((m) => mergedMediaIds.has(m.id) || m.lifecycle !== 'live');

  return {
    ...serverJournal,
    revision: serverJournal.revision + 1,
    moments: [...moments, ...extraMoments],
    media,
  };
}

function defaultFieldPicks(plan: MomentConflictPlan): Partial<Record<MomentConflictField, FieldPick>> {
  const fields: Partial<Record<MomentConflictField, FieldPick>> = {};
  for (const f of plan.fields) fields[f] = 'local';
  return fields;
}

export function openJournalConflictSheet(options: {
  anchor: HTMLElement;
  plans: MomentConflictPlan[];
}): Promise<Record<string, MomentConflictResolution> | null> {
  attachVisualViewportInset();
  return new Promise((resolve) => {
    const picks = new Map<string, MomentConflictResolution>();
    for (const plan of options.plans) {
      picks.set(plan.momentId, { mode: 'fields', fields: defaultFieldPicks(plan) });
    }

    const back = document.createElement('div');
    back.className = 'sheet-back';
    const sheet = document.createElement('div');
    sheet.className = 'sheet addform journal-conflict-sheet hub-morph-dialog';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Resolve journal conflict');

    const heading = document.createElement('h3');
    heading.textContent = 'This moment changed elsewhere';

    const hint = document.createElement('p');
    hint.className = 'journal-sheet__hint';
    hint.textContent =
      'Compare the server copy with your edit. Pick each field or keep both as separate moments.';

    const status = document.createElement('p');
    status.className = 'journal-sheet__status';
    status.hidden = true;

    const form = document.createElement('form');
    form.className = 'addform__form compose';
    form.noValidate = true;
    const scroll = document.createElement('div');
    scroll.className = 'addform__scroll';
    const actions = document.createElement('div');
    actions.className = 'addform__actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn--secondary';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn--primary';
    saveBtn.textContent = 'Save merged';

    function finishClose(result: Record<string, MomentConflictResolution> | null): void {
      document.removeEventListener('keydown', onKey);
      back.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => finishClose(null));
    back.addEventListener('click', (ev) => {
      if (ev.target === back) finishClose(null);
    });
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finishClose(null);
      }
    };
    document.addEventListener('keydown', onKey);

    function fieldLabel(field: MomentConflictField): string {
      const labels: Record<MomentConflictField, string> = {
        text: 'Reflection',
        local_time: 'Time',
        local_date: 'Date',
        place: 'Place',
        coordinates: 'Pin',
        media_ids: 'Photos',
      };
      return labels[field];
    }

    function formatField(moment: JournalMoment, field: MomentConflictField): string {
      if (field === 'text') return moment.text?.trim() || '(empty)';
      if (field === 'local_time') return moment.local_time || '(no time)';
      if (field === 'local_date') return moment.local_date;
      if (field === 'place') return moment.place?.name || '(no place)';
      if (field === 'coordinates') {
        return moment.coordinates
          ? `${moment.coordinates.lat.toFixed(4)}, ${moment.coordinates.lon.toFixed(4)}`
          : '(no pin)';
      }
      return `${moment.media_ids.length} photo(s)`;
    }

    function renderPlans(): void {
      scroll.replaceChildren(hint);
      for (const plan of options.plans) {
        const block = document.createElement('section');
        block.className = 'journal-conflict__moment';
        const title = document.createElement('h4');
        title.className = 'journal-conflict__title';
        title.textContent = plan.server.place?.name || plan.momentId;

        const modeRow = document.createElement('div');
        modeRow.className = 'journal-conflict__mode';
        const keepBoth = document.createElement('label');
        const keepBothInput = document.createElement('input');
        keepBothInput.type = 'checkbox';
        keepBothInput.checked = picks.get(plan.momentId)?.mode === 'keep_both';
        keepBoth.append(keepBothInput, document.createTextNode(' Keep both moments (yours becomes a copy)'));
        keepBothInput.addEventListener('change', () => {
          if (keepBothInput.checked) {
            picks.set(plan.momentId, { mode: 'keep_both' });
          } else {
            picks.set(plan.momentId, { mode: 'fields', fields: defaultFieldPicks(plan) });
          }
          renderPlans();
        });
        modeRow.append(keepBoth);

        const resolution = picks.get(plan.momentId);
        const keepBothMode = resolution?.mode === 'keep_both';

        const compare = document.createElement('div');
        compare.className = 'journal-conflict__compare';

        for (const field of plan.fields) {
          const row = document.createElement('div');
          row.className = 'journal-conflict__field';
          const label = document.createElement('span');
          label.className = 'journal-conflict__field-label';
          label.textContent = fieldLabel(field);
          row.append(label);

          const cols = document.createElement('div');
          cols.className = 'journal-conflict__cols';
          const serverWrap = document.createElement('div');
          const serverLbl = document.createElement('span');
          serverLbl.className = 'journal-conflict__col-label';
          serverLbl.textContent = 'Server';
          const serverVal = document.createElement('p');
          serverVal.textContent = formatField(plan.server, field);
          serverWrap.append(serverLbl, serverVal);
          const localWrap = document.createElement('div');
          const localLbl = document.createElement('span');
          localLbl.className = 'journal-conflict__col-label';
          localLbl.textContent = 'Yours';
          const localVal = document.createElement('p');
          localVal.textContent = formatField(plan.local, field);
          localWrap.append(localLbl, localVal);
          cols.append(serverWrap, localWrap);
          row.append(cols);

          if (!keepBothMode) {
            const pickRow = document.createElement('div');
            pickRow.className = 'journal-conflict__pick';
            for (const side of ['server', 'local'] as FieldPick[]) {
              const wrap = document.createElement('label');
              const input = document.createElement('input');
              input.type = 'radio';
              input.name = `${plan.momentId}-${field}`;
              input.value = side;
              const current = resolution?.mode === 'fields' ? resolution.fields[field] : 'local';
              input.checked = current === side;
              input.addEventListener('change', () => {
                const cur = picks.get(plan.momentId);
                if (cur?.mode !== 'fields') return;
                cur.fields[field] = side;
              });
              wrap.append(input, document.createTextNode(side === 'server' ? ' Server' : ' Yours'));
              pickRow.append(wrap);
            }
            row.append(pickRow);
          }
          compare.append(row);
        }

        block.append(title, modeRow, compare);
        scroll.append(block);
      }
      scroll.append(status);
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const out: Record<string, MomentConflictResolution> = {};
      for (const plan of options.plans) {
        out[plan.momentId] = picks.get(plan.momentId) ?? {
          mode: 'fields',
          fields: defaultFieldPicks(plan),
        };
      }
      finishClose(out);
    });

    renderPlans();
    form.append(scroll, actions);
    actions.append(cancelBtn, saveBtn);
    sheet.append(heading, form);
    back.append(sheet);
    options.anchor.append(back);
    heading.tabIndex = -1;
    heading.focus();
  });
}

export class JournalConflictCancelledError extends Error {
  constructor() {
    super('Journal save conflict resolution cancelled');
    this.name = 'JournalConflictCancelledError';
  }
}

let conflictAnchor: HTMLElement | null = null;
let conflictUiOverride:
  | ((plans: MomentConflictPlan[]) => Promise<Record<string, MomentConflictResolution> | null>)
  | null = null;

export function __setJournalConflictUiForTests(
  handler:
    | ((plans: MomentConflictPlan[]) => Promise<Record<string, MomentConflictResolution> | null>)
    | null,
): void {
  conflictUiOverride = handler;
}

export function setJournalConflictAnchor(anchor: HTMLElement | null): void {
  conflictAnchor = anchor;
}

function conflictAnchorEl(): HTMLElement {
  return conflictAnchor ?? document.querySelector<HTMLElement>('.journal') ?? document.body;
}

async function promptConflictResolutions(
  plans: MomentConflictPlan[],
): Promise<Record<string, MomentConflictResolution>> {
  if (conflictUiOverride) {
    const picked = await conflictUiOverride(plans);
    if (!picked) throw new JournalConflictCancelledError();
    return picked;
  }
  const picked = await openJournalConflictSheet({ anchor: conflictAnchorEl(), plans });
  if (!picked) throw new JournalConflictCancelledError();
  return picked;
}

export async function recoverJournalSaveConflict(
  tripId: string,
  _staleVersion: string,
  localJournal: JournalDocument,
): Promise<{ journal: JournalDocument; version: string }> {
  const serverEnvelope = await getJournal(tripId);
  const plans = planMomentConflicts(serverEnvelope.journal, localJournal);
  if (!plans.length) {
    return saveJournal(tripId, serverEnvelope.version, localJournal);
  }
  const resolutions = await promptConflictResolutions(plans);
  const merged = mergeJournalAfterConflict(serverEnvelope.journal, localJournal, resolutions);
  return saveJournal(tripId, serverEnvelope.version, merged);
}
