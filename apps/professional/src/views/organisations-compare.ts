/**
 * Phase 7 — Compare 2–3 organisations side by side with useful bridges.
 */

import { fetchOrganisationsDirectory } from '@/api/organisations-directory';
import { fetchOrgStructure } from '@/api/org-structure';
import { organisationsRoute } from '@/app/router';
import { el } from '@/components/org-ui';
import { layoutOrgFlowchart, renderFlowchartSvg } from '@/domain/org-flowchart';
import { findUsefulBridges, type BridgeCandidate } from '@/domain/org-bridges-client';

export interface ComparePageOptions {
  isCurrent?: () => boolean;
}

function parseIds(hash: string): string[] {
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const ids = new URLSearchParams(q).get('ids') || '';
  return ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function renderOrganisationsCompare(
  canvas: HTMLElement,
  options: ComparePageOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const ids = parseIds(location.hash);

  canvas.replaceChildren();
  canvas.classList.add('orgs-page', 'orgs-page--compare');
  const root = el('div', 'orgs-page__root');
  const back = document.createElement('a');
  back.className = 'orgs-page__back';
  back.href = organisationsRoute(ids[0] || null);
  back.textContent = '← Back';
  root.append(back, el('h1', 'orgs-page__title', 'Compare'));

  if (ids.length < 2) {
    root.append(
      el('p', 'people-pane__empty', 'Pick at least two organisations to compare.'),
      (() => {
        const a = document.createElement('a');
        a.href = organisationsRoute(null);
        a.className = 'btn btn--primary';
        a.textContent = 'Organisations wall';
        return a;
      })()
    );
    canvas.append(root);
    return;
  }

  const host = el('div', 'orgs-compare__cols');
  const bridgesHost = el('div', 'orgs-compare__bridges');
  root.append(host, bridgesHost);
  canvas.append(root);

  try {
    const directory = await fetchOrganisationsDirectory();
    if (!isCurrent()) return;
    const rows = ids
      .map((id) => directory.organisations.find((o) => o.id === id))
      .filter(Boolean);

    const structures = await Promise.all(
      rows.map(async (row) => {
        try {
          return await fetchOrgStructure(row!.id);
        } catch {
          return null;
        }
      })
    );

    const isPhone = window.matchMedia('(max-width: 719px)').matches;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const col = el('div', 'orgs-compare__col');
      col.append(el('h2', 'orgs-compare__name', row.display_name));
      const box = el('div', 'orgs-flow__box');
      col.append(box);
      host.append(col);
      const structure = structures[i];
      if (!structure || !structure.units.length) {
        box.append(el('p', 'people-pane__empty', 'No structure yet.'));
        continue;
      }
      try {
        const layout = await layoutOrgFlowchart(structure, { compact: true });
        box.append(renderFlowchartSvg(layout));
      } catch (err) {
        box.append(
          el('p', 'people-pane__empty', err instanceof Error ? err.message : 'Layout failed.')
        );
      }
    }

    // Bridges from directory people + relationships approximation
    const peopleByOrg = rows.map((r) =>
      (r!.people || []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        warmth_band: p.warmth_band as 'warm' | 'cooling' | 'cold',
        org_id: r!.id,
        org_ref: r!.ref
      }))
    );

    const result = findUsefulBridges({
      orgs: rows.map((r) => ({ id: r!.id, ref: r!.ref, name: r!.display_name })),
      peopleByOrg,
      // Relationship edges not on directory — empty until Compare API loads links.
      relationships: [],
      openOpportunityPersonIds: new Set()
    });

    if (isPhone || result.shown.length === 0) {
      const list = el('div', 'orgs-compare__bridge-list');
      if (!result.shown.length) {
        list.append(
          el(
            'p',
            'people-pane__empty',
            result.hidden_count
              ? `${result.hidden_count} more hidden — open All links when links exist.`
              : 'No useful bridges yet.'
          )
        );
      } else {
        for (const b of result.shown) {
          list.append(el('div', 'orgs-compare__bridge', `${b.number}. ${b.reason}`));
        }
        if (result.hidden_count) {
          list.append(el('p', 'orgs-page__meta', `${result.hidden_count} more hidden`));
        }
      }
      bridgesHost.append(list);
    } else {
      const list = el('div', 'orgs-compare__bridge-list');
      for (const b of result.shown as BridgeCandidate[]) {
        list.append(el('div', 'orgs-compare__bridge', `${b.number}. ${b.reason}`));
      }
      if (result.hidden_count) {
        list.append(el('p', 'orgs-page__meta', `${result.hidden_count} more hidden`));
      }
      bridgesHost.append(list);
    }
  } catch (err) {
    if (!isCurrent()) return;
    root.append(
      el('p', 'people-pane__empty', err instanceof Error ? err.message : 'Compare failed.')
    );
  }
}
