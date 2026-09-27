/**
 * Phase 7 — Compare 2–3 organisations side by side with useful bridges.
 */

import { fetchOrganisationsDirectory } from '@/api/organisations-directory';
import { evaluateOrgBridges } from '@/api/org-bridges';
import { fetchOrgStructure } from '@/api/org-structure';
import { listUniversalLinksForEntity } from '@/api/universal-links';
import { organisationsRoute } from '@/app/router';
import { el } from '@/components/org-ui';
import { layoutOrgFlowchart, renderFlowchartSvg } from '@/domain/org-flowchart';

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

async function loadCrossOrgRelationships(
  peopleA: Array<{ id: string }>,
  peopleB: Array<{ id: string }>
): Promise<Array<{ source_id: string; target_id: string }>> {
  const bIds = new Set(peopleB.map((p) => p.id));
  const aIds = new Set(peopleA.map((p) => p.id));
  const out: Array<{ source_id: string; target_id: string }> = [];
  const seen = new Set<string>();
  // Cap UL fetches so Compare stays snappy on large walls.
  const sample = peopleA.slice(0, 40);
  const results = await Promise.all(
    sample.map(async (p) => {
      try {
        return await listUniversalLinksForEntity(`shared:person:${p.id}`);
      } catch {
        return null;
      }
    })
  );
  for (let i = 0; i < sample.length; i++) {
    const person = sample[i]!;
    const links = results[i];
    if (!links) continue;
    for (const entry of [...(links.outgoing || []), ...(links.incoming || [])]) {
      const type = entry.link?.relationship_type;
      if (type !== 'professional_relationship') continue;
      const otherRef =
        entry.direction === 'incoming' ? entry.link.source_ref : entry.link.target_ref;
      const otherId = String(otherRef || '').replace(/^shared:person:/, '');
      if (!bIds.has(otherId) && !aIds.has(otherId)) continue;
      if (!bIds.has(otherId)) continue;
      const key = [person.id, otherId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source_id: person.id, target_id: otherId });
    }
  }
  return out;
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

    const phoneMq = window.matchMedia('(max-width: 719px)');

    async function paintCharts(): Promise<void> {
      host.replaceChildren();
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
          const peopleNames = Object.fromEntries(
            (row.people || []).map((p) => [p.id, p.display_name])
          );
          const layout = await layoutOrgFlowchart(structure, {
            compact: phoneMq.matches,
            peopleNames
          });
          box.append(renderFlowchartSvg(layout));
        } catch (err) {
          box.append(
            el(
              'p',
              'people-pane__empty',
              err instanceof Error ? err.message : 'Layout failed.'
            )
          );
        }
      }
    }

    await paintCharts();
    phoneMq.addEventListener('change', () => {
      void paintCharts();
    });

    const peopleByOrg = rows.map((r) =>
      (r!.people || []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        warmth_band: p.warmth_band as 'warm' | 'cooling' | 'cold',
        org_id: r!.id,
        org_ref: r!.ref
      }))
    );

    const warmthByPerson: Record<string, string> = {};
    const displayNames: Record<string, string> = {};
    for (const group of peopleByOrg) {
      for (const p of group) {
        warmthByPerson[p.id] = p.warmth_band;
        displayNames[p.id] = p.display_name;
      }
    }

    const professionalRelationships =
      peopleByOrg[0] && peopleByOrg[1]
        ? await loadCrossOrgRelationships(peopleByOrg[0], peopleByOrg[1])
        : [];

    let bridges: Array<{ number?: number; reason?: string | null }> = [];
    let hiddenCount = 0;
    try {
      const result = await evaluateOrgBridges({
        orgA: {
          ref: rows[0]!.ref,
          people: (rows[0]!.people || []).map((p) => ({
            id: p.id,
            display_name: p.display_name,
            warmth_band: p.warmth_band
          }))
        },
        orgB: {
          ref: rows[1]!.ref,
          people: (rows[1]!.people || []).map((p) => ({
            id: p.id,
            display_name: p.display_name,
            warmth_band: p.warmth_band
          }))
        },
        professionalRelationships,
        warmthByPerson,
        nearOrgRef: rows[0]!.ref,
        displayNames
      });
      bridges = result.bridges || [];
      hiddenCount = result.hidden_count || 0;
    } catch {
      bridges = [];
      hiddenCount = 0;
    }

    bridgesHost.replaceChildren();
    const list = el('div', 'orgs-compare__bridge-list');
    if (!bridges.length) {
      list.append(
        el(
          'p',
          'people-pane__empty',
          hiddenCount
            ? `${hiddenCount} more hidden.`
            : 'No useful bridges yet.'
        )
      );
    } else {
      for (const b of bridges) {
        list.append(el('div', 'orgs-compare__bridge', `${b.number}. ${b.reason}`));
      }
      if (hiddenCount) {
        list.append(el('p', 'orgs-page__meta', `${hiddenCount} more hidden`));
      }
    }
    bridgesHost.append(list);
  } catch (err) {
    if (!isCurrent()) return;
    root.append(
      el('p', 'people-pane__empty', err instanceof Error ? err.message : 'Compare failed.')
    );
  }
}
