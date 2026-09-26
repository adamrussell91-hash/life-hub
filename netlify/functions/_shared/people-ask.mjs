import { planRelationalQuery } from './relational-search-nl.mjs';
import { searchPeopleRelationally } from './relational-search.mjs';
import { createRememberFactRepository } from './remember-repository.mjs';
import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';

/**
 * Phase 6 Ask — Ann turn over the people graph.
 * Fast path: relational-search-nl when the question reduces to org/role/text.
 * Otherwise: keyword graph scan + Remember facts; honest unknown if empty.
 */

export function looksLikeAskQuestion(text) {
  const q = String(text || '').trim();
  if (!q) return false;
  if (/\?$/.test(q)) return true;
  return /^(who|whom|whose|which|what|where|how many|do i know|anyone|anybody)\b/i.test(q);
}

function scorePerson(person, relationships, queryWords, rememberTexts) {
  const hay = [
    person.display_name,
    ...(person.aliases ?? []),
    ...relationships.map((r) => `${r.link?.role ?? ''} ${r.endpoint?.display_label ?? ''}`),
    ...rememberTexts
  ]
    .join(' ')
    .toLowerCase();
  let score = 0;
  const reasons = [];
  for (const w of queryWords) {
    if (w.length < 3) continue;
    if (hay.includes(w)) {
      score += 1;
      if (rememberTexts.some((t) => t.toLowerCase().includes(w))) {
        reasons.push(`Remember: …${w}…`);
      } else if ((person.display_name || '').toLowerCase().includes(w)) {
        reasons.push('Name match');
      } else {
        reasons.push(`Linked context mentions “${w}”`);
      }
    }
  }
  return { score, reason: reasons[0] ?? 'Related in your network' };
}

function summarisePeopleAnswer(people) {
  if (people.length === 1) {
    return `${people[0].display_name} — ${people[0].reason}.`;
  }
  const names = people
    .slice(0, 3)
    .map((p) => p.display_name)
    .join(', ');
  return `I'd look at ${names}${people.length > 3 ? ` and ${people.length - 3} more` : ''}.`;
}

export async function runPeopleAsk(question, deps = {}) {
  const q = String(question || '').trim();
  if (!q) {
    return {
      mode: 'ask',
      answer: "I don't know enough about who knows that yet.",
      people: [],
      filter: null,
      source: 'empty'
    };
  }

  const env = deps.env ?? process.env;
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));

  const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';

  if (apiKey || deps.complete || deps.plan) {
    try {
      const plan =
        deps.plan ??
        (await planRelationalQuery({
          question: q,
          apiKey,
          fetchImpl: deps.fetchImpl,
          complete: deps.complete,
          store: universalStore
        }));
      if (plan && !plan.unsupported && (plan.organisation_ref || plan.role || plan.text)) {
        const results =
          deps.searchResults ??
          (await searchPeopleRelationally(
            {
              organisation_ref: plan.organisation_ref ?? '',
              role: plan.role ?? '',
              text: plan.text ?? ''
            },
            {
              store: universalStore,
              professionalStore,
              env,
              resolveEntity: deps.resolveEntity,
              createRepository: deps.createRepository,
              now: deps.now?.() ?? new Date(),
              createObservationRepository: deps.createObservationRepository,
              loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
            }
          ));
        const people = (results ?? []).slice(0, 5).map((p) => ({
          id: p.id,
          ref: p.ref,
          display_name: p.display_name,
          reason:
            (p.matched_reasons && p.matched_reasons[0]) || plan.text || plan.role || 'Matches your filters',
          source: 'relational search'
        }));
        if (people.length === 0) {
          return {
            mode: 'ask',
            answer: "I don't know enough about who knows that yet.",
            people: [],
            filter: {
              org: plan.organisation_ref ?? null,
              role: plan.role ?? null,
              q: plan.text ?? ''
            },
            source: 'relational_nl'
          };
        }
        return {
          mode: 'ask',
          answer: summarisePeopleAnswer(people),
          people,
          filter: {
            org: plan.organisation_ref ?? null,
            role: plan.role ?? null,
            q: plan.text ?? ''
          },
          source: 'relational_nl'
        };
      }
    } catch {
      // Fall through to graph scan.
    }
  }

  const peopleWithRelationships =
    deps.peopleWithRelationships ??
    (await loadAllPeopleWithRelationships({
      store: universalStore,
      now: deps.now?.() ?? new Date(),
      env,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      fetchImpl: deps.fetchImpl
    }));

  const rememberRepo =
    deps.rememberRepo ?? createRememberFactRepository({ store: professionalStore, now: deps.now });

  const queryWords = q
    .toLowerCase()
    .replace(/[?.,!]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const scored = [];
  for (const { person, relationships } of peopleWithRelationships) {
    if (!person || person.is_self) continue;
    const personRef = person.ref ?? (person.id ? `shared:person:${person.id}` : null);
    if (!personRef) continue;
    const facts = await rememberRepo.listForPerson(personRef, { status: 'active' }).catch(() => []);
    const { score, reason } = scorePerson(
      person,
      relationships ?? [],
      queryWords,
      facts.map((f) => f.text)
    );
    if (score > 0) {
      scored.push({
        id: person.id,
        ref: personRef,
        display_name: person.display_name,
        reason,
        source: facts.length ? 'Remember' : 'people graph',
        score
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const people = scored.slice(0, 5).map(({ score: _s, ...rest }) => rest);

  if (people.length === 0) {
    return {
      mode: 'ask',
      answer: "I don't know enough about who knows that yet.",
      people: [],
      filter: null,
      source: 'graph'
    };
  }

  return {
    mode: 'ask',
    answer: summarisePeopleAnswer(people),
    people,
    filter: { q: people.map((p) => p.display_name.split(' ')[0]).join(' ') },
    source: 'graph'
  };
}
