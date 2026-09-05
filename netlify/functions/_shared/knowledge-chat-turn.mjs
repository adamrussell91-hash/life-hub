import { resolveChatPlan, writeMaxTokens } from './knowledge-chat-plan.mjs';
import { knowledgeKernelFetch } from './knowledge-kernel.mjs';
import { assembleClementinePrompt, loadKnowledgePrompt } from './knowledge-prompts.mjs';
import { formatKnowledgeQualityBlock } from './load-humanizer.mjs';
import {
  coverageFromResearch,
  parseResearchResult,
  topicQuery
} from './knowledge-research.mjs';

const ARCHIVE_FAILED_NOTE =
  'The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.';
const ANSWER_FROM_ARCHIVE =
  'Answer the question from the archive. Do not refuse it as the wrong office, a curriculum question, or not academic writing.';
const RESEARCH_THE_OPEN_WEB =
  'Search the open web for this topic. Do not dig the archive for answers Adam does not already have. Cite web sources as markdown links [Title](url). Never invent a URL.';
const CITE_NOTES_AS_LINKS =
  'Cite archive notes as markdown links [Note title](pageId). Never write a raw page_notion_ or page_hub_ id in the reader-facing answer.';

function lastUserQuery(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i].content;
  }
  return '';
}

function notesInPlay(input) {
  if (input.notesInPlay?.length) return input.notesInPlay;
  return input.noteContext ? [input.noteContext] : [];
}

function notesLine(input, prefix) {
  const notes = notesInPlay(input);
  if (!notes.length) return '';
  return `${prefix}${notes.map(note => `${note.title} (${note.pageId})`).join('; ')}`;
}

function bookContextLine(book) {
  if (!book?.label) return '';
  return book.locus ? `Reading: ${book.label} (${book.locus})` : `Reading: ${book.label}`;
}

function documentContext(input) {
  const parts = [
    bookContextLine(input.bookContext),
    input.workingThesis?.trim(),
    input.draft?.trim(),
    notesLine(input, 'Open note: ')
  ].filter(Boolean);
  return parts.length ? parts.join('\n\n') : undefined;
}

function compactArchiveNote(research) {
  if (!research.findings.length) {
    const gaps = research.gaps.length ? research.gaps.join('; ') : 'none named';
    return `The archive did not give you anything usable. Name the gaps (${gaps}). Do not say "no results found."`;
  }
  const detailed = research.findings.slice(0, 8);
  const rest = research.findings.slice(8);
  const lines = detailed.map((finding, index) => {
    const excerpt = String(finding.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return `${index + 1}. "${finding.title}" (${finding.pageId})${excerpt ? `\n${excerpt}` : ''}`;
  });
  const more = rest.length
    ? `\n${rest.length} further notes (titles only; cite by id if relevant): ${rest
      .map(item => `${item.title} (${item.pageId})`)
      .join('; ')}`
    : '';
  return `Archive findings (${research.findings.length} notes — cite as [Title](pageId) markdown links; never invent pages; never write a raw page id in the answer):\n${lines.join('\n\n')}${more}`;
}

function archiveNote(research) {
  return { research, note: compactArchiveNote(research) };
}

function failedArchive() {
  return { archiveFailed: true, note: ARCHIVE_FAILED_NOTE };
}

function searchBody(input) {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  const raw = lastUserQuery(input.messages) || 'working thesis';
  return {
    query: topicQuery(raw) || raw,
    documentContext: documentContext(input),
    k: plan.k,
    tags: plan.tags,
    maxRounds: plan.maxRounds,
    negation: plan.negation
  };
}

async function pullLive(input) {
  if (!input.archivePull) return null;
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  try {
    return await input.archivePull({
      query: lastUserQuery(input.messages) || 'working thesis',
      k: plan.k,
      tags: plan.tags
    });
  } catch {
    return null;
  }
}

function preferLive(kernel, live) {
  if (kernel.research?.findings.length && !kernel.archiveFailed) return kernel;
  if (live) return archiveNote(live);
  return kernel.research || kernel.archiveFailed || kernel.note ? kernel : failedArchive();
}

async function pullQuick(input) {
  if (!input.env) return { note: '' };
  try {
    const response = await knowledgeKernelFetch('/quick_research', {
      env: input.env,
      fetchImpl: input.fetchImpl,
      method: 'POST',
      body: searchBody(input),
      timeoutMs: 8_000
    });
    if (!response.ok) return failedArchive();
    const parsed = parseResearchResult(await response.json());
    if (!parsed) return failedArchive();
    return archiveNote(parsed);
  } catch {
    return failedArchive();
  }
}

async function resolveArchive(input) {
  const livePromise = pullLive(input);
  const kernel = await pullQuick(input);
  if (kernel.research?.findings.length && !kernel.archiveFailed) {
    await livePromise;
    return kernel;
  }
  return preferLive(kernel, await livePromise);
}

function composeFrom(archive) {
  return {
    status: 'compose',
    research: archive.research,
    archiveFailed: archive.archiveFailed,
    coverage: archive.research ? coverageFromResearch(archive.research) : undefined
  };
}

function assembledSystem(input, archive) {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  const query = lastUserQuery(input.messages);
  const coverage = archive.research ? coverageFromResearch(archive.research) : undefined;
  const synthesis = input.hat === 'synthesis'
    ? `\n${loadKnowledgePrompt('clementine-thematic-synthesis.md', input.cwd)}`
    : input.hat === 'fromBook'
      ? `\n${loadKnowledgePrompt('clementine-book-note.md', input.cwd)}`
      : input.hat === 'makeNote'
        ? `\n${loadKnowledgePrompt('clementine-make-note.md', input.cwd)}`
        : '';
  const grounding = input.hat === 'fromBook' || input.hat === 'makeNote'
    ? RESEARCH_THE_OPEN_WEB
    : `${ANSWER_FROM_ARCHIVE}\n${CITE_NOTES_AS_LINKS}`;
  return {
    coverage,
    system: assembleClementinePrompt({
      voice: input.voice,
      job: input.universityJob,
      surface: `This turn is the Knowledge Hub Chat sitting. Hat: ${plan.hat.label}. Scope: ${plan.scope}. Depth: ${plan.depth}.\n${plan.hat.plan}${synthesis}\n${grounding}\n${archive.note ?? ''}`,
      payload: [
        bookContextLine(input.bookContext),
        input.workingThesis?.trim() ? `Working thesis:\n${input.workingThesis.trim()}` : '',
        input.draft?.trim() ? `Draft excerpt:\n${input.draft.trim()}` : '',
        notesLine(input, 'Notes in play: '),
        query ? `Latest question:\n${query}` : '',
        coverage
          ? `Coverage: ${coverage.distinctSources} distinct sources, ${coverage.gapCount} gaps, ${coverage.thin ? 'thin' : 'enough'}.`
          : ''
      ].filter(Boolean).join('\n\n'),
      quality: formatKnowledgeQualityBlock()
    })
  };
}

async function startWrite(input, archive) {
  const { system, coverage } = assembledSystem(input, archive);
  const started = await input.write.start({
    system,
    messages: input.messages,
    maxTokens: writeMaxTokens(input),
    research: archive.research,
    archiveFailed: archive.archiveFailed,
    webSearch: input.hat === 'fromBook' || input.hat === 'makeNote' || undefined
  });
  if (started.status === 'done' && started.reply) {
    return {
      status: 'done',
      reply: started.reply,
      research: archive.research ?? started.research,
      archiveFailed: archive.archiveFailed ?? started.archiveFailed,
      coverage
    };
  }
  return {
    status: 'writing',
    writeSessionId: started.writeSessionId,
    research: archive.research ?? started.research,
    archiveFailed: archive.archiveFailed,
    coverage
  };
}

async function pollWrite(input) {
  const state = await input.write.poll(input.writeSessionId);
  if (!state) return { status: 'external-unavailable', reason: 'Unknown write session' };
  if (state.status === 'writing') {
    return {
      status: 'writing',
      writeSessionId: state.writeSessionId,
      research: state.research,
      archiveFailed: state.archiveFailed,
      coverage: state.research ? coverageFromResearch(state.research) : undefined
    };
  }
  if (state.status === 'error' || !state.reply) {
    return { status: 'external-unavailable', reason: state.error?.trim() || 'The Worker write failed.' };
  }
  const coverage = state.research ? coverageFromResearch(state.research) : undefined;
  return {
    status: 'done',
    reply: state.reply,
    research: state.research,
    archiveFailed: state.archiveFailed,
    coverage,
    canSearchOutside: input.hat === 'internalExternal' && Boolean(coverage?.thin)
  };
}

async function startDeep(input) {
  if (input.env) {
    try {
      const response = await knowledgeKernelFetch('/deep_research/start', {
        env: input.env,
        fetchImpl: input.fetchImpl,
        method: 'POST',
        body: searchBody(input),
        timeoutMs: 8_000
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload.sessionId) {
          return {
            status: 'researching',
            researchSessionId: payload.sessionId,
            research: parseResearchResult(payload.result) ?? undefined
          };
        }
      }
    } catch {
      /* live archive below */
    }
  }
  return startWrite(input, await resolveArchive({ ...input, env: undefined }));
}

async function pollDeep(input) {
  if (!input.env || !input.researchSessionId) return preferLive(failedArchive(), await pullLive(input));
  try {
    const response = await knowledgeKernelFetch(
      `/deep_research/${encodeURIComponent(input.researchSessionId)}`,
      { env: input.env, fetchImpl: input.fetchImpl, timeoutMs: 8_000 }
    );
    if (!response.ok) return preferLive(failedArchive(), await pullLive(input));
    const parsed = parseResearchResult(await response.json());
    if (!parsed) return preferLive(failedArchive(), await pullLive(input));
    if (parsed.status === 'running') {
      return { researching: input.researchSessionId, research: parsed, note: '' };
    }
    if (parsed.status === 'error' || parsed.status === 'cancelled') {
      return preferLive({ ...failedArchive(), research: parsed }, await pullLive(input));
    }
    if (parsed.findings.length) return archiveNote(parsed);
    return preferLive(archiveNote(parsed), await pullLive(input));
  } catch {
    return preferLive(failedArchive(), await pullLive(input));
  }
}

export async function runChatTurn(input) {
  assembleClementinePrompt({
    voice: input.voice,
    job: input.universityJob,
    surface: 'chat',
    payload: 'validate'
  });
  if (input.searchOutside) {
    return {
      status: 'external-unavailable',
      reason: 'External search is not connected. Brave is not on the research kernel yet. Archive citations stay archive-only.'
    };
  }
  if (input.writeSessionId) return pollWrite(input);
  if ((input.hat === 'fromBook' || input.hat === 'makeNote') && !input.compose) return startWrite(input, { note: '' });
  if (input.compose) {
    if (input.priorResearch?.findings?.length) {
      return startWrite(input, {
        ...archiveNote(input.priorResearch),
        archiveFailed: input.archiveFailed
      });
    }
    const recovered = await pullLive(input);
    if (recovered?.findings.length) return startWrite(input, archiveNote(recovered));
    return startWrite(input, recovered ? archiveNote(recovered) : failedArchive());
  }
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  if (input.researchSessionId) {
    const archive = await pollDeep(input);
    if (archive.researching) {
      return { status: 'researching', researchSessionId: archive.researching, research: archive.research };
    }
    return startWrite(input, archive);
  }
  if (input.sittingLibrary?.findings?.length) {
    return startWrite(input, archiveNote(input.sittingLibrary));
  }
  if (plan.kernel === 'deep') return startDeep(input);
  const archive = await resolveArchive(input);
  return startWrite(input, archive);
}
