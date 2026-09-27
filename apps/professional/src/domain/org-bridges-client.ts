/**
 * Client-side useful-bridge rules (mirrors `_shared/org-bridges.mjs`).
 * Used when Compare has directory people but no dedicated bridges API payload yet.
 */

export interface BridgePerson {
  id: string;
  display_name: string;
  warmth_band: 'warm' | 'cooling' | 'cold';
  org_id: string;
  org_ref: string;
}

export interface BridgeCandidate {
  kind: 'moved' | 'know_each_other' | 'met_at_event';
  person_a_id: string;
  person_b_id: string;
  org_a_ref: string;
  org_b_ref: string;
  number?: number;
  rule?: 1 | 2 | 3 | null;
  reason?: string | null;
}

export function findUsefulBridges(input: {
  orgs: Array<{ id: string; ref: string; name: string }>;
  peopleByOrg: BridgePerson[][];
  relationships: Array<{
    type: string;
    source_ref: string;
    target_ref: string;
  }>;
  openOpportunityPersonIds: Set<string>;
  selfPersonId?: string | null;
}): { shown: BridgeCandidate[]; hidden_count: number } {
  const candidates: BridgeCandidate[] = [];
  const [aPeople, bPeople] = input.peopleByOrg;
  if (!aPeople?.length || !bPeople?.length) {
    return { shown: [], hidden_count: 0 };
  }
  const orgA = input.orgs[0];
  const orgB = input.orgs[1];
  if (!orgA || !orgB) return { shown: [], hidden_count: 0 };

  const aById = new Map(aPeople.map((p) => [p.id, p]));
  const bById = new Map(bPeople.map((p) => [p.id, p]));

  // moved: same person id in both orgs
  for (const [id, pa] of aById) {
    const pb = bById.get(id);
    if (!pb) continue;
    candidates.push({
      kind: 'moved',
      person_a_id: id,
      person_b_id: id,
      org_a_ref: orgA.ref,
      org_b_ref: orgB.ref
    });
    void pa;
    void pb;
  }

  // know_each_other from professional_relationship
  for (const rel of input.relationships) {
    if (rel.type !== 'professional_relationship') continue;
    const aId = rel.source_ref.replace(/^shared:person:/, '');
    const bId = rel.target_ref.replace(/^shared:person:/, '');
    const inA = aById.has(aId) || bById.has(aId);
    const inB = aById.has(bId) || bById.has(bId);
    if (!inA || !inB) continue;
    if (aById.has(aId) && bById.has(bId)) {
      candidates.push({
        kind: 'know_each_other',
        person_a_id: aId,
        person_b_id: bId,
        org_a_ref: orgA.ref,
        org_b_ref: orgB.ref
      });
    } else if (bById.has(aId) && aById.has(bId)) {
      candidates.push({
        kind: 'know_each_other',
        person_a_id: bId,
        person_b_id: aId,
        org_a_ref: orgA.ref,
        org_b_ref: orgB.ref
      });
    }
  }

  const shown: BridgeCandidate[] = [];
  let hidden = 0;
  let n = 1;
  for (const c of candidates) {
    const near = aById.get(c.person_a_id);
    const far = bById.get(c.person_b_id) || aById.get(c.person_b_id);
    const nearBand = near?.warmth_band || 'cold';
    const farBand = far?.warmth_band || 'cold';
    let rule: 1 | 2 | 3 | null = null;
    if ((farBand === 'cold' || !far) && nearBand === 'warm') rule = 1;
    else if (
      input.openOpportunityPersonIds.has(c.person_a_id) ||
      input.openOpportunityPersonIds.has(c.person_b_id)
    ) {
      rule = 2;
    } else if (input.selfPersonId && c.person_a_id === input.selfPersonId && farBand === 'cold') {
      rule = 3;
    }
    if (!rule) {
      hidden += 1;
      continue;
    }
    const nearName = near?.display_name || 'Someone';
    const farName = far?.display_name || 'someone';
    const reason =
      rule === 1
        ? `${nearName} is your warmest way into ${orgB.name}, toward ${farName}.`
        : rule === 2
          ? `${nearName} ↔ ${farName} ties to an open opportunity.`
          : `Your move links cold former colleagues around an upcoming event.`;
    shown.push({ ...c, number: n++, rule, reason });
  }

  return { shown, hidden_count: hidden };
}
