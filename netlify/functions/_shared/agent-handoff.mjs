/**
 * Phase 4 — Hammond specialist handoff contracts.
 * A missing specialist stays open. Hammond must not synthesise that return as complete.
 */
export const HAMMOND_SPECIALISTS = Object.freeze([
  'clare', 'chadwick', 'sara', 'ann', 'clementine', 'brisket',
  'hyaluronica', 'penelope', 'vera'
]);

export const CROSS_HUB = new Set([
  'slipping', 'slip', 'falling', 'through', 'across', 'life',
  'priority', 'priorities', 'coordinate', 'hub', 'hubs', 'cross',
  'mission', 'attention', 'colliding', 'collision', 'overdue',
  'stalled', 'stall', 'open', 'loops', 'review', 'week', 'weekly',
  'sunday', 'audit', 'triage', 'picture', 'status', 'delegate',
  'handoff', 'supervision', 'coordinate', 'coordinated'
]);

const GREET = new Set(['hi', 'hey', 'hello', 'yo', 'thanks', 'cheers', 'bro', 'mate', 'just', 'saying']);

export const SPECIALIST_BRIEFINGS = Object.freeze({
  clare: {
    objective: 'Name a realistic next move from task, project, and calendar state',
    question: 'What should I focus on today?',
    evidencePointers: ['tasks', 'projects', 'lessons'],
    constraints: ['Do not invent overdue work', 'Name a failed tasks store'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  chadwick: {
    objective: 'Review training across recent windows without inventing sessions',
    question: 'How has my training been going lately?',
    evidencePointers: ['workouts', 'composition'],
    constraints: ['Do not invent completed sessions', 'Name empty windows'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  sara: {
    objective: 'Build a health timeline from body, weight, and medical records',
    question: 'health timeline please',
    evidencePointers: ['composition', 'measurements', 'medicalEvents'],
    constraints: ['Do not invent visits or lab results', 'Name weight conflicts'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  ann: {
    objective: 'Diagnose the next lesson from class, unit, and calendar context',
    question: "help me improve tomorrow's lesson",
    evidencePointers: ['classes', 'lessons', 'units'],
    constraints: ['Do not invent a class or hinge'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  clementine: {
    objective: 'Retrieve archive notes and synthesise only from those sources',
    question: 'what notes do I already have',
    evidencePointers: ['pages'],
    constraints: ['Do not invent a page or citation'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  brisket: {
    objective: 'Separate logged intake, missing days, and adherence from guesses',
    question: 'how am I eating lately',
    evidencePointers: ['meals'],
    constraints: ['Do not claim adherence when today is unlogged'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  hyaluronica: {
    objective: 'Compare routine adherence with observed response evidence',
    question: 'is my routine helping',
    evidencePointers: ['skincare'],
    constraints: ['Do not claim the routine is helping without logs'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  penelope: {
    objective: 'Search diary history for recurrence without inventing a pattern',
    question: 'feeling like this often',
    evidencePointers: ['mindEvents'],
    constraints: ['Do not invent a recurring feeling'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  },
  vera: {
    objective: 'Compare mind sessions and keep interpretations inside retrieved evidence',
    question: 'what patterns across sessions',
    evidencePointers: ['mindEvents'],
    constraints: ['Do not invent a longitudinal pattern'],
    expectedOutput: ['findings', 'limitations', 'confidence']
  }
});

function tokenize(message) {
  return String(message ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .flatMap(word => {
      const out = [word];
      if (word.endsWith("'s")) out.push(word.slice(0, -2));
      if (word.endsWith('ing') && word.length > 5) {
        const stem = word.slice(0, -3);
        out.push(stem, `${stem}e`);
      }
      if (word.endsWith('ed') && word.length > 4) out.push(word.slice(0, -2));
      if (word.endsWith('s') && word.length > 3) out.push(word.slice(0, -1));
      return out;
    })
    .filter(Boolean);
}

function hits(words, lexicon) {
  return words.some(word => lexicon.has(word));
}

function hasRows(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasDiary(events) {
  return (events ?? []).some(e => (e?.record?.type ?? e?.type) === 'diary');
}

function hasSessions(events) {
  const t = e => e?.record?.type ?? e?.type;
  return (events ?? []).some(e => t(e) === 'mind_session' || t(e) === 'session');
}

export function hammondShouldSupervise(message) {
  const words = tokenize(message);
  if (!words.length) return false;
  if (words.every(word => GREET.has(word))) return false;
  return hits(words, CROSS_HUB);
}

export function selectHammondDelegates({ message, stores = {}, loadErrors = {} } = {}) {
  const words = tokenize(message);
  const broad = hits(words, CROSS_HUB);
  const errors = { ...loadErrors, ...(stores.loadErrors ?? {}) };
  const picked = [];
  const add = (slug, when) => {
    if (when && !picked.includes(slug)) picked.push(slug);
  };

  add('clare', broad || hasRows(stores.tasks) || Boolean(errors.tasks));
  add('chadwick', broad || hasRows(stores.workouts));
  add('sara', broad || hasRows(stores.composition) || hasRows(stores.medicalEvents));
  add('ann', broad || hasRows(stores.lessons) || hasRows(stores.classes) || Boolean(errors.scheduledLessons));
  add('clementine', hasRows(stores.pages) || hits(words, new Set(['know', 'notes', 'archive', 'knowledge'])));
  add('brisket', broad || hasRows(stores.meals));
  add('hyaluronica', hasRows(stores.skincare) || hits(words, new Set(['skin', 'routine', 'skincare'])));
  add('penelope', hasDiary(stores.mindEvents) || hits(words, new Set(['diary', 'feeling', 'journal'])));
  add('vera', hasSessions(stores.mindEvents) || hits(words, new Set(['therapy', 'mind', 'session', 'sessions'])));

  if (!picked.length) picked.push('clare');
  return picked;
}

export function createHandoffRequest({ to, from = 'hammond' } = {}) {
  const brief = SPECIALIST_BRIEFINGS[to];
  if (!brief) return null;
  return {
    id: `handoff:${from}:${to}`,
    from,
    to,
    objective: brief.objective,
    question: brief.question,
    evidencePointers: [...brief.evidencePointers],
    constraints: [...brief.constraints],
    expectedOutput: [...brief.expectedOutput],
    status: 'requested',
    result: null,
    reason: null
  };
}

export function collectSpecialistReturn(kernel) {
  if (!kernel) return null;
  return {
    specialist: kernel.slug ?? null,
    workflow: kernel.plan?.workflow ?? 'none',
    findings: kernel.claims ?? [],
    limitations: kernel.limitations ?? [],
    confidence: kernel.complete ? 'complete' : kernel.sufficient ? 'partial' : 'open',
    proposedAction: kernel.actions?.[0] ?? null,
    sourcesInspected: Object.keys(kernel.evidence ?? {}),
    complete: kernel.complete === true,
    sufficient: kernel.sufficient === true
  };
}

export function verifyHandoff(request, returned) {
  if (!request) {
    return {
      id: 'handoff:unknown',
      from: 'hammond',
      to: null,
      status: 'open',
      reason: 'specialist_did_not_run',
      result: null
    };
  }
  if (!returned || returned.workflow === 'none') {
    return { ...request, status: 'open', reason: 'specialist_did_not_run', result: returned ?? null };
  }
  const inspected = (returned.sourcesInspected ?? []).length > 0;
  const spoke = (returned.findings?.length ?? 0) > 0 || (returned.limitations?.length ?? 0) > 0;
  if (!inspected || !spoke) {
    return { ...request, status: 'open', reason: 'empty_return', result: returned };
  }
  return {
    ...request,
    status: 'verified',
    reason: returned.complete ? 'complete' : 'verified_with_gaps',
    result: returned
  };
}

export function serializeHandoffEvidence(handoff) {
  return {
    ok: true,
    open: handoff.status === 'open',
    status: handoff.status,
    reason: handoff.reason,
    specialist: handoff.to,
    workflow: handoff.result?.workflow ?? null,
    findings: handoff.result?.findings ?? [],
    limitations: handoff.result?.limitations ?? [],
    sources_inspected: handoff.result?.sourcesInspected ?? [],
    confidence: handoff.result?.confidence ?? null
  };
}

export function runHammondDelegation(state, runSpecialist) {
  const slugs = selectHammondDelegates({
    message: state.message,
    stores: state.stores,
    loadErrors: state.stores?.loadErrors
  });
  state.handoffs = [];
  for (const slug of slugs) {
    const request = createHandoffRequest({ to: slug });
    let returned = null;
    try {
      const specialist = runSpecialist({
        slug,
        message: request.question,
        today: state.today,
        now: state.now,
        stores: state.stores
      });
      returned = collectSpecialistReturn(specialist);
    } catch {
      returned = null;
    }
    const handoff = verifyHandoff(request, returned);
    state.handoffs.push(handoff);
    state.evidence[`handoff_${slug}`] = serializeHandoffEvidence(handoff);
  }
  return state;
}

export function handoffPromptBlock(handoffs = []) {
  if (!handoffs.length) {
    return [
      'Handoffs:',
      '- none requested'
    ].join('\n');
  }
  const lines = ['Handoffs (specialist returns — not Hammond invention):'];
  for (const item of handoffs) {
    const findingCount = item.result?.findings?.length ?? 0;
    const limitCount = item.result?.limitations?.length ?? 0;
    lines.push(
      `- ${item.to}: ${item.status} (${item.reason || 'requested'}) findings=${findingCount} limitations=${limitCount}`
    );
  }
  return lines.join('\n');
}

export function handoffInterpretationLines(handoffs = []) {
  const open = handoffs.filter(item => item.status === 'open');
  const verified = handoffs.filter(item => item.status === 'verified');
  return [
    '- Synthesise only verified specialist returns. Do not invent a specialist row they did not return.',
    open.length
      ? `- Open handoffs stay open: ${open.map(item => item.to).join(', ')}. Do not mark them complete.`
      : '- No open handoffs this turn.',
    verified.length
      ? `- Verified returns: ${verified.map(item => item.to).join(', ')}.`
      : '- No verified specialist returns this turn.',
    '- Unavailable hubs must be named. Do not treat a failed hub as empty-by-design.',
    '- Decision records and Central Node writes stay pending until Confirm. They are not user truth yet.'
  ];
}
