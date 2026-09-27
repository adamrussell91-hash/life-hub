/**
 * Organisations page — Phases 1–5 + 7 (FIX-BRIEF-01 Part B).
 */

import {
  fetchOrganisationsDirectory,
  signOrgCrest,
  updateOrganisation,
  uploadSignedCrest,
  type DirectoryOrganisationRow
} from '@/api/organisations-directory';
import {
  addOpportunityToApplications,
  addOpportunityToEvents,
  createOpportunity,
  dismissOpportunity,
  listOpportunities,
  type OpportunityRecord
} from '@/api/opportunities';
import { fetchOrgStructure, type OrgStructurePayload } from '@/api/org-structure';
import {
  fetchOrganisationRead,
  runOrganisationReadNow,
  type OrganisationRead
} from '@/api/organisation-read';
import { organisationsRoute } from '@/app/router';
import { openStructureEditor } from '@/components/org-structure-editor';
import { crestNode, el, sectionHost, setSectionState } from '@/components/org-ui';
import {
  layoutOrgFlowchart,
  renderFlowchartSvg,
  renderStructureOutline
} from '@/domain/org-flowchart';
import {
  buildOrganisationModel,
  type OrganisationModel
} from '@/domain/organisation-model';
import { ORG_SPARK_DOMAIN_START } from '@/domain/organisation-spark';
import { renderOrganisationTimelineSvg } from '@/domain/organisation-timeline';
import { parseOrgsQuery, serializeOrgsQuery } from '@/domain/organisations-query';

export interface OrganisationPageOptions {
  onTitleReady?: (title: string) => void;
  isCurrent?: () => boolean;
}

function hashQuery(): string {
  const i = location.hash.indexOf('?');
  return i >= 0 ? location.hash.slice(i) : '';
}

function chipClass(kind: string): string {
  switch (kind) {
    case 'workplace':
      return 'orgs-rchip orgs-rchip--work';
    case 'workplace_former':
      return 'orgs-rchip orgs-rchip--past';
    case 'event_venue':
      return 'orgs-rchip orgs-rchip--event';
    case 'pd_provider':
      return 'orgs-rchip orgs-rchip--pd';
    case 'placement':
      return 'orgs-rchip orgs-rchip--prac';
    case 'studied':
      return 'orgs-rchip orgs-rchip--study';
    case 'member':
    case 'accreditation':
      return 'orgs-rchip orgs-rchip--body';
    case 'you_presented':
      return 'orgs-rchip orgs-rchip--stage';
    case 'applied':
    case 'prospect':
      return 'orgs-rchip orgs-rchip--apply';
    default:
      return 'orgs-rchip';
  }
}

function rowToModel(row: DirectoryOrganisationRow): OrganisationModel {
  return buildOrganisationModel({
    id: row.id,
    ref: row.ref,
    displayName: row.display_name,
    legalName: row.legal_name,
    logoKey: row.logo_key,
    chips: row.chips,
    people: row.people.map((p) => ({
      id: p.id,
      warmthBand: p.warmth_band,
      firstLinkAt: p.first_link_at
    })),
    undatedPeopleCount: row.undated_people_count,
    arcPoints: row.arc_points,
    timelineLanes: row.timeline_lanes,
    firstTouchAt: row.first_touch_at,
    firstTouchKind: row.first_touch_kind ?? null,
    lastActivityAt: row.last_activity_at
  });
}

async function uploadCrest(model: OrganisationModel, file: File): Promise<void> {
  const signed = await signOrgCrest({
    organisation_id: model.id,
    filename: file.name,
    content_type: file.type || 'image/png',
    byte_size: file.size
  });
  await uploadSignedCrest(signed.put_url, file, signed.attachment.content_type);
  await updateOrganisation(model.ref, { logo_key: signed.attachment.r2_key });
}

function closesLabel(opp: OpportunityRecord): string {
  if (opp.closes_precision === 'none' || !opp.closes_on) return '';
  if (opp.closes_precision === 'month') {
    const [y, m] = opp.closes_on.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = Number(m) - 1;
    return `closes ${months[mi] ?? m} ${y}`;
  }
  const d = new Date(opp.closes_on);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `closes ${dd}/${mm}/${yy}`;
}

function openAddOpportunitySheet(opts: {
  organisationRef: string;
  organisationName: string;
  onSaved: () => void;
  onClose: () => void;
}): HTMLElement {
  const sheet = el('div', 'orgs-page__sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Add opportunity');
  const inner = el('div', 'orgs-page__sheet-inner');
  inner.append(el('h2', undefined, 'Add opportunity'));
  const title = document.createElement('input');
  title.type = 'text';
  title.placeholder = 'Title';
  const kind = document.createElement('select');
  for (const k of [
    'scholarship',
    'pd',
    'program',
    'role',
    'call_for_presenters',
    'grant',
    'event',
    'other'
  ]) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    kind.append(o);
  }
  const closes = document.createElement('input');
  closes.type = 'month';
  const url = document.createElement('input');
  url.type = 'url';
  url.placeholder = 'https://…';
  const status = el('p', 'orgs-page__meta', '');
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      try {
        await createOpportunity({
          organisation_ref: opts.organisationRef,
          kind: kind.value as OpportunityRecord['kind'],
          title: title.value.trim(),
          summary: '',
          closes_on: closes.value ? `${closes.value}-01` : null,
          closes_precision: closes.value ? 'month' : 'none',
          url: url.value.trim() || null,
          found_by: 'adam'
        });
        opts.onSaved();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Save failed.';
        save.disabled = false;
      }
    })();
  });
  const close = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
  close.type = 'button';
  close.addEventListener('click', opts.onClose);
  for (const [lab, control] of [
    ['Title', title],
    ['Kind', kind],
    ['Closes', closes],
    ['Link', url]
  ] as Array<[string, HTMLElement]>) {
    const l = el('label', 'orgs-page__field');
    l.append(document.createTextNode(lab), control);
    inner.append(l);
  }
  inner.append(status, save, close);
  sheet.append(inner);
  return sheet;
}

/**
 * Real entry point for `#/organisations/<id>` (W2).
 */
export async function renderOrganisationPage(
  canvas: HTMLElement,
  organisationId: string,
  options: OrganisationPageOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const query = parseOrgsQuery(hashQuery());
  const lineParam = new URLSearchParams(hashQuery().replace(/^\?/, '')).get('line');

  canvas.replaceChildren();
  canvas.classList.add('orgs-page', 'orgs-page--detail');

  const root = el('div', 'orgs-page__root');
  const switchBar = el('div', 'orgs-page__switch');
  const back = document.createElement('a');
  back.className = 'orgs-page__back';
  back.href = organisationsRoute(null, serializeOrgsQuery(query));
  back.textContent = '← Organisations';
  const switchSpacer = el('span', 'orgs-page__spacer');
  const compareBtn = document.createElement('a');
  compareBtn.className = 'btn btn--ghost';
  compareBtn.textContent = 'Compare with…';
  compareBtn.href = `#/organisations/compare?ids=${encodeURIComponent(organisationId)}`;
  const editBtn = el('button', 'btn btn--ghost', 'Edit') as HTMLButtonElement;
  editBtn.type = 'button';
  switchBar.append(back, switchSpacer, compareBtn, editBtn);

  const hdr = el('header', 'orgs-page__hdr');
  const hdrStack = el('div', 'orgs-page__hdr-stack');
  const title = el('h1', 'orgs-page__title', 'Loading…');
  const meta = el('p', 'orgs-page__meta', '');
  const chipsHost = el('div', 'orgs-rchips');
  hdrStack.append(title, meta, chipsHost);
  hdr.append(hdrStack);

  const main = el('div', 'orgs-page__main');
  const how = sectionHost('orgs-section--how', 'How it is run');
  const side = el('div', 'orgs-page__side');
  const ann = sectionHost('orgs-section--ann', "Ann's read");
  const opps = sectionHost('orgs-section--opps', 'Potential opportunities');
  side.append(ann.root, opps.root);
  main.append(how.root, side);

  const time = sectionHost('orgs-section--time', 'Your time with …');

  root.append(switchBar, hdr, main, time.root);
  canvas.append(root);

  setSectionState(how.body, 'loading');
  setSectionState(ann.body, 'loading');
  setSectionState(opps.body, 'loading');
  setSectionState(time.body, 'loading');

  let model: OrganisationModel | null = null;
  let structure: OrgStructurePayload | null = null;
  let directoryPeople: Array<{ id: string; display_name: string }> = [];
  let selfPersonRef: string | null = null;
  let editorSheet: HTMLElement | null = null;

  async function patchHowSection(): Promise<void> {
    if (!model || !isCurrent()) return;
    setSectionState(how.body, 'ready');
    how.body.replaceChildren();

    try {
      structure = await fetchOrgStructure(model.id);
    } catch {
      structure = null;
    }

    const hasStructure = Boolean(structure && structure.units.length > 0);
    const toolbar = el('div', 'orgs-how__toolbar');
    const addStructure = el('button', 'btn btn--ghost', hasStructure ? 'Edit structure' : 'Add structure') as HTMLButtonElement;
    addStructure.type = 'button';
    addStructure.addEventListener('click', () => openEditor());
    toolbar.append(addStructure);

    if (!hasStructure || !structure) {
      const howEmpty = el('div', 'orgs-how__empty');
      howEmpty.append(
        el('p', 'people-pane__empty', 'No structure yet. Add units to show how this organisation is run.'),
        addStructure
      );
      how.body.append(howEmpty);
      return;
    }

    // Highlight control (V2) — URL ?line=
    const hl = el('div', 'orgs-how__hl');
    hl.append(el('span', 'orgs-how__hl-lbl', 'Highlight'));
    const yourLines = lineParam || 'your_lines';
    const pills: Array<{ id: string; label: string }> = [
      { id: 'your_lines', label: 'Your lines' }
    ];
    if (selfPersonRef && structure.graph.memberships_by_person[selfPersonRef]) {
      for (const m of structure.graph.memberships_by_person[selfPersonRef]) {
        const unit = structure.units.find((u) => `shared:unit:${u.id}` === m.unit_ref);
        pills.push({
          id: `line:${m.unit_ref}`,
          label: m.role ? `as ${m.role}` : unit?.name || 'role'
        });
      }
    }
    const seen = new Set<string>();
    for (const p of pills) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const active =
        yourLines === p.id || (p.id === 'your_lines' && (!lineParam || lineParam === 'your_lines'));
      const btn = el('button', `orgs-how__pill${active ? ' is-active' : ''}`, p.label) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const params = new URLSearchParams(hashQuery().replace(/^\?/, ''));
        if (p.id === 'your_lines') params.delete('line');
        else params.set('line', p.id);
        const q = params.toString();
        location.hash = `#/organisations/${organisationId}${q ? `?${q}` : ''}`;
      });
      hl.append(btn);
    }

    const viewToggle = el('div', 'orgs-how__seg');
    const phoneMq = window.matchMedia('(max-width: 719px)');
    let view: 'outline' | 'flow' | 'people' = phoneMq.matches ? 'outline' : 'flow';
    const outlineBtn = el('button', 'orgs-how__seg-btn', 'Outline') as HTMLButtonElement;
    const flowBtn = el('button', 'orgs-how__seg-btn', 'Flow') as HTMLButtonElement;
    const peopleBtn = el('button', 'orgs-how__seg-btn', 'People list') as HTMLButtonElement;
    outlineBtn.type = flowBtn.type = peopleBtn.type = 'button';
    viewToggle.append(outlineBtn, flowBtn, peopleBtn);

    const host = el('div', 'orgs-how__host');
    how.body.append(toolbar, hl, viewToggle, host);

    const collapsedUnits = new Set<string>();

    async function paintView(): Promise<void> {
      if (!structure) return;
      outlineBtn.classList.toggle('is-active', view === 'outline');
      flowBtn.classList.toggle('is-active', view === 'flow');
      peopleBtn.classList.toggle('is-active', view === 'people');
      host.replaceChildren();
      if (view === 'outline') {
        host.append(
          renderStructureOutline(
            structure,
            selfPersonRef,
            Object.fromEntries(directoryPeople.map((p) => [p.id, p.display_name]))
          )
        );
        return;
      }
      if (view === 'people') {
        const list = el('div', 'orgs-people-list');
        const ids = structure.graph.member_person_ids;
        for (const id of ids) {
          const p = directoryPeople.find((x) => x.id === id);
          const a = document.createElement('a');
          a.href = `#/people/${encodeURIComponent(id)}`;
          a.textContent = p?.display_name || id;
          list.append(a);
        }
        if (selfPersonRef) {
          const youCount = structure.graph.memberships_by_person[selfPersonRef]?.length ?? 0;
          if (youCount) {
            how.heading.querySelector('.orgs-how__you')?.remove();
            how.heading.append(
              el('span', 'people-pane__h2-sub orgs-how__you', `You · ${youCount} roles`)
            );
          }
        }
        host.append(list);
        return;
      }
      // Flow + pan/zoom chrome (C4)
      const wrap = el('div', 'orgs-flow__box');
      const zoomRow = el('div', 'orgs-flow__zoom');
      const zoomIn = el('button', 'btn btn--ghost', '+') as HTMLButtonElement;
      const zoomOut = el('button', 'btn btn--ghost', '−') as HTMLButtonElement;
      const zoomFit = el('button', 'btn btn--ghost', 'Fit') as HTMLButtonElement;
      zoomIn.type = zoomOut.type = zoomFit.type = 'button';
      zoomIn.setAttribute('aria-label', 'Zoom in');
      zoomOut.setAttribute('aria-label', 'Zoom out');
      zoomFit.setAttribute('aria-label', 'Fit flowchart');
      zoomRow.append(zoomOut, zoomIn, zoomFit);
      const stage = el('div', 'orgs-flow__stage');
      wrap.append(zoomRow, stage);
      host.append(wrap);
      let scale = 1;
      try {
        const peopleNames = Object.fromEntries(
          directoryPeople.map((p) => [p.id, p.display_name])
        );
        const layout = await layoutOrgFlowchart(structure, {
          selfPersonRef,
          highlightLine: lineParam || 'your_lines',
          compact: phoneMq.matches,
          peopleNames,
          collapsedUnits
        });
        const svg = renderFlowchartSvg(layout, {
          collapsedUnits,
          onToggleUnit: (uref) => {
            if (collapsedUnits.has(uref)) collapsedUnits.delete(uref);
            else collapsedUnits.add(uref);
            void paintView();
          },
          onVacantPosition: () => openEditor()
        });
        stage.append(svg);
        const applyZoom = () => {
          svg.style.transform = `scale(${scale})`;
          svg.style.transformOrigin = '0 0';
        };
        zoomIn.addEventListener('click', () => {
          scale = Math.min(2.5, scale + 0.15);
          applyZoom();
        });
        zoomOut.addEventListener('click', () => {
          scale = Math.max(0.4, scale - 0.15);
          applyZoom();
        });
        zoomFit.addEventListener('click', () => {
          scale = 1;
          applyZoom();
          wrap.scrollLeft = 0;
          wrap.scrollTop = 0;
        });
        // Touch pan via native overflow; Pointer Events keep buttons usable without gestures (C4).
        stage.style.touchAction = 'pan-x pan-y';
        let pointers = 0;
        stage.addEventListener('pointerdown', (ev) => {
          pointers += 1;
          if (pointers === 1 && ev.target === stage) {
            stage.setPointerCapture(ev.pointerId);
          }
        });
        stage.addEventListener('pointerup', () => {
          pointers = Math.max(0, pointers - 1);
        });
        // Safari gesture path (non-blocking; buttons remain the primary control).
        wrap.addEventListener('gesturestart', ((ev: Event) => {
          ev.preventDefault();
        }) as EventListener);
        wrap.addEventListener('gesturechange', ((ev: Event) => {
          const ge = ev as Event & { scale?: number };
          if (typeof ge.scale === 'number') {
            scale = Math.min(2.5, Math.max(0.4, ge.scale));
            applyZoom();
          }
        }) as EventListener);
      } catch (err) {
        wrap.append(
          el(
            'p',
            'people-pane__empty',
            err instanceof Error ? err.message : 'Could not layout flowchart.'
          )
        );
      }
    }

    outlineBtn.addEventListener('click', () => {
      view = 'outline';
      void paintView();
    });
    flowBtn.addEventListener('click', () => {
      view = 'flow';
      void paintView();
    });
    peopleBtn.addEventListener('click', () => {
      view = 'people';
      void paintView();
    });

    const onPhoneChange = () => {
      const next = phoneMq.matches ? 'outline' : 'flow';
      if (view === 'outline' || view === 'flow') {
        view = next;
        void paintView();
      }
    };
    phoneMq.addEventListener('change', onPhoneChange);

    await paintView();
    return;
  }

  function openEditor(): void {
    if (!model) return;
    editorSheet?.remove();
    editorSheet = openStructureEditor({
      organisationRef: model.ref,
      organisationName: model.displayName,
      structure,
      people: directoryPeople,
      onSaved: async () => {
        editorSheet?.remove();
        editorSheet = null;
        await patchHowSection();
      },
      onClose: () => {
        editorSheet?.remove();
        editorSheet = null;
      }
    });
    root.append(editorSheet);
  }

  editBtn.addEventListener('click', () => openEditor());

  async function patchAnn(): Promise<void> {
    if (!model) return;
    setSectionState(ann.body, 'ready');
    ann.body.replaceChildren();
    let read: OrganisationRead | null = null;
    try {
      const res = await fetchOrganisationRead(model.ref);
      read = res.read?.generated_at ? res.read : null;
    } catch {
      read = null;
    }
    if (!read) {
      ann.body.append(
        el('p', 'people-pane__empty', `Ann hasn't read ${model.displayName} yet.`)
      );
      const run = el('button', 'btn btn--primary', 'Run now') as HTMLButtonElement;
      run.type = 'button';
      run.addEventListener('click', () => {
        void (async () => {
          run.disabled = true;
          try {
            await runOrganisationReadNow(
              model!.ref,
              structure
                ? {
                    structure: structure.graph,
                    memberships: selfPersonRef
                      ? structure.graph.memberships_by_person[selfPersonRef] || []
                      : [],
                    warmth_by_unit: {},
                    observations: [],
                    meetings: [],
                    opportunities: []
                  }
                : undefined
            );
            await patchAnn();
          } catch (err) {
            ann.body.append(
              el(
                'p',
                'people-pane__empty',
                err instanceof Error ? err.message : 'Run failed.'
              )
            );
          }
        })();
      });
      ann.body.append(run);
      return;
    }
    if (read.status === 'failed') {
      ann.body.append(
        el('p', 'people-pane__empty', read.error || 'Ann’s read failed.')
      );
      return;
    }
    ann.body.append(el('p', 'orgs-ann__summary', read.summary || ''));
    const threads = el('div', 'orgs-ann__threads');
    for (const t of read.threads || []) {
      const row = el('div', 'orgs-ann__thread');
      row.append(el('span', 'orgs-ann__k', t.key.replace(/_/g, ' ')));
      row.append(el('span', 'orgs-ann__v', t.text));
      if (t.sources?.[0]) {
        const src = t.sources[0];
        const label = src.excerpt || src.url || src.ref || 'source';
        row.append(el('span', 'orgs-ann__src', label));
      }
      threads.append(row);
    }
    ann.body.append(threads);
  }

  async function patchOpps(): Promise<void> {
    if (!model) return;
    setSectionState(opps.body, 'ready');
    opps.body.replaceChildren();
    opps.heading.querySelector('.people-pane__h2-sub')?.remove();
    opps.heading.append(el('span', 'people-pane__h2-sub', 'here · next 6 weeks'));

    let items: OpportunityRecord[] = [];
    try {
      const res = await listOpportunities({ organisationRef: model.ref });
      items = res.opportunities ?? [];
    } catch {
      items = [];
    }
    const open = items.filter((o) => o.status === 'open' || o.status === 'interested');

    const addBtn = el('button', 'btn btn--ghost', 'Add opportunity') as HTMLButtonElement;
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const sheet = openAddOpportunitySheet({
        organisationRef: model!.ref,
        organisationName: model!.displayName,
        onSaved: () => {
          sheet.remove();
          void patchOpps();
        },
        onClose: () => sheet.remove()
      });
      root.append(sheet);
    });

    if (!open.length) {
      opps.body.append(el('p', 'people-pane__empty', 'No opportunities yet.'), addBtn);
      return;
    }

    const list = el('div', 'orgs-opps__list');
    for (const opp of open.slice(0, 8)) {
      const row = el('div', 'orgs-opp');
      row.append(el('div', 'orgs-opp__t', opp.title));
      const sub = closesLabel(opp);
      if (sub) row.append(el('div', 'orgs-opp__sub', sub));
      const actions = el('div', 'orgs-opp__actions');
      const toApps = el('button', 'btn btn--ghost', 'Add to Applications') as HTMLButtonElement;
      toApps.type = 'button';
      toApps.addEventListener('click', () => {
        toApps.disabled = true;
        void addOpportunityToApplications(opp.id)
          .then(() => {
            location.hash = '#/applications';
          })
          .catch((err) => {
            window.alert(err instanceof Error ? err.message : 'Could not add to Applications.');
            toApps.disabled = false;
          });
      });
      const toEvents = el('button', 'btn btn--ghost', 'Add to Events') as HTMLButtonElement;
      toEvents.type = 'button';
      toEvents.addEventListener('click', () => {
        toEvents.disabled = true;
        void addOpportunityToEvents(opp.id)
          .then(() => {
            location.hash = '#/events';
          })
          .catch((err) => {
            window.alert(err instanceof Error ? err.message : 'Could not add to Events.');
            toEvents.disabled = false;
          });
      });
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss') as HTMLButtonElement;
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => {
        void dismissOpportunity(opp.id).then(() => patchOpps());
      });
      actions.append(toApps, toEvents, dismiss);
      row.append(actions);
      list.append(row);
    }
    opps.body.append(list, addBtn);
  }

  try {
    const directory = await fetchOrganisationsDirectory();
    if (!isCurrent()) return;
    const row = directory.organisations.find((o) => o.id === organisationId);
    if (!row) {
      title.textContent = 'Organisation not found';
      setSectionState(how.body, 'error', 'Organisation not found.');
      setSectionState(ann.body, 'empty');
      setSectionState(opps.body, 'empty');
      setSectionState(time.body, 'empty');
      return;
    }

    model = rowToModel(row);
    directoryPeople = row.people.map((p) => ({ id: p.id, display_name: p.display_name }));
    const selfRow = directory.organisations
      .flatMap((o) => o.people)
      .find((p) => (p as { is_self?: boolean }).is_self);
    // Directory may not flag is_self on people; use first workplace person with Adam pattern from self employment chips
    selfPersonRef = null;
    for (const p of row.people) {
      if ((p as { is_self?: boolean }).is_self) {
        selfPersonRef = `shared:person:${p.id}`;
        break;
      }
    }
    void selfRow;

    options.onTitleReady?.(model.displayName);
    title.textContent = model.displayName;
    how.heading.textContent = `How ${model.displayName} is run`;
    time.heading.textContent = `Your time with ${model.displayName}`;
    const peopleWord = model.peopleCount === 1 ? 'person' : 'people';
    how.heading.append(
      el('span', 'people-pane__h2-sub', `${model.peopleCount} ${peopleWord} you know`)
    );

    const crest = crestNode(model.monogram, 'xl', {
      orgRef: model.ref,
      logoKey: model.logoKey,
      onUpload: (file) => {
        void uploadCrest(model!, file)
          .then(() => {
            if (isCurrent()) location.reload();
          })
          .catch((err) => {
            window.alert(err instanceof Error ? err.message : 'Crest upload failed.');
          });
      }
    });
    hdr.prepend(crest);

    meta.textContent = model.metaLine;
    chipsHost.replaceChildren();
    for (const c of model.chips) {
      const chip = el('span', chipClass(c.kind));
      const full = c.detail ? `${c.label} · ${c.detail}` : c.label;
      chip.title = full;
      chip.append(el('b', undefined, c.label));
      if (c.detail) chip.append(el('span', 'orgs-rchip__yr', c.detail));
      chipsHost.append(chip);
    }

    await patchHowSection();
    await patchAnn();
    await patchOpps();

    // Your time with …
    setSectionState(time.body, 'ready');
    const domainStart =
      model.peopleSteps[0]?.at &&
      Date.parse(model.peopleSteps[0].at) < Date.parse(ORG_SPARK_DOMAIN_START)
        ? model.peopleSteps[0].at
        : model.timelineLanes[0]?.start &&
            Date.parse(model.timelineLanes[0].start) < Date.parse(ORG_SPARK_DOMAIN_START)
          ? model.timelineLanes[0].start
          : ORG_SPARK_DOMAIN_START;
    const domainEnd = new Date().toISOString();
    const wrap = el('div', 'orgs-time__svg');
    time.body.append(wrap);
    const measured = Math.max(wrap.clientWidth || 0, 448);
    const svg = renderOrganisationTimelineSvg({
      lanes: model.timelineLanes,
      peopleSteps: model.peopleSteps,
      domainStart,
      domainEnd,
      width: measured
    });
    wrap.append(svg);
    if (model.timelineLanes.length === 0 && model.peopleSteps.length === 0) {
      time.body.prepend(
        el('p', 'people-pane__empty', 'No timeline marks yet — links and events will appear here.')
      );
    }
  } catch (err) {
    if (!isCurrent()) return;
    title.textContent = 'Organisations';
    const msg = err instanceof Error ? err.message : 'Could not load organisation.';
    setSectionState(how.body, 'error', msg);
    setSectionState(ann.body, 'error', msg);
    setSectionState(opps.body, 'error', msg);
    setSectionState(time.body, 'error', msg);
  }
}
