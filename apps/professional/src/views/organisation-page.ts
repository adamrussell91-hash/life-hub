/**
 * Organisations redesign Phase 1 — organisation page skeleton + Your time with …
 * FIX-BRIEF-01 A3–A5, A8: ongoing bars, timeline labels, no dead buttons / roadmap copy.
 */

import {
  fetchOrganisationsDirectory,
  signOrgCrest,
  updateOrganisation,
  uploadSignedCrest,
  type DirectoryOrganisationRow
} from '@/api/organisations-directory';
import { organisationsRoute } from '@/app/router';
import { crestNode, el, sectionHost, setSectionState } from '@/components/org-ui';
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

/**
 * Real entry point for `#/organisations/<id>` (W2). Replaces generic entity detail (P3).
 */
export async function renderOrganisationPage(
  canvas: HTMLElement,
  organisationId: string,
  options: OrganisationPageOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const query = parseOrgsQuery(hashQuery());

  canvas.replaceChildren();
  canvas.classList.add('orgs-page', 'orgs-page--detail');

  const root = el('div', 'orgs-page__root');
  const switchBar = el('div', 'orgs-page__switch');
  const back = document.createElement('a');
  back.className = 'orgs-page__back';
  back.href = organisationsRoute(null, serializeOrgsQuery(query));
  back.textContent = '← Organisations';
  const switchSpacer = el('span', 'orgs-page__spacer');
  // A5: Compare / Edit land with Phases 7 and 2 — don't render disabled stubs.
  switchBar.append(back, switchSpacer);

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

    const model = rowToModel(row);
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
        void uploadCrest(model, file)
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

    // How it is run — empty until Phase 3; no disabled "Add structure" (A5 / I3).
    setSectionState(how.body, 'ready');
    const howEmpty = el('div', 'orgs-how__empty');
    howEmpty.append(
      el('p', 'people-pane__empty', 'No structure yet. Add units to show how this organisation is run.')
    );
    how.body.append(howEmpty);

    // Ann's read — empty until Phase 5; no disabled "Run now" (A5).
    setSectionState(ann.body, 'ready');
    ann.body.append(
      el('p', 'people-pane__empty', `Ann hasn't read ${model.displayName} yet.`)
    );

    // Opportunities — honest empty; Add arrives with Phase 4 (A5).
    setSectionState(opps.body, 'ready');
    opps.heading.append(el('span', 'people-pane__h2-sub', 'here · next 3 weeks'));
    opps.body.append(el('p', 'people-pane__empty', 'No opportunities yet.'));

    // Your time with … — shared 2019→now domain when people spark uses it (A4).
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
    const svg = renderOrganisationTimelineSvg({
      lanes: model.timelineLanes,
      peopleSteps: model.peopleSteps,
      domainStart,
      domainEnd
    });
    const wrap = el('div', 'orgs-time__svg');
    wrap.append(svg);
    if (model.timelineLanes.length === 0 && model.peopleSteps.length === 0) {
      time.body.append(
        el('p', 'people-pane__empty', 'No timeline marks yet — links and events will appear here.')
      );
    }
    time.body.append(wrap);
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
