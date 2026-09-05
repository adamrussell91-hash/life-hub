import { assembleClementinePrompt } from './knowledge-prompts.mjs';
import { formatKnowledgeQualityBlock } from './load-humanizer.mjs';
import { knowledgeKernelFetch } from './knowledge-kernel.mjs';
import { parseResearchResult } from './knowledge-research.mjs';

function lastUserQuery(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i].content;
  }
  return '';
}

export async function runCoachTurn({
  voice,
  universityJob,
  messages,
  workingThesis,
  draft,
  env,
  fetchImpl,
  complete
}) {
  assembleClementinePrompt({
    voice,
    job: universityJob,
    surface: 'coach',
    payload: 'validate'
  });
  const query = lastUserQuery(messages);
  let research;
  let archiveFailed = false;
  let note = '';
  if (env) {
    try {
      const response = await knowledgeKernelFetch('/quick_research', {
        env,
        fetchImpl,
        method: 'POST',
        body: {
          query: query || 'working thesis',
          documentContext: [workingThesis, draft].filter(Boolean).join('\n\n') || undefined
        },
        timeoutMs: 8_000
      });
      if (!response.ok) {
        archiveFailed = true;
        note = 'The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.';
      } else {
        research = parseResearchResult(await response.json());
        if (!research) {
          archiveFailed = true;
          note = 'The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.';
        } else if (!research.findings.length) {
          const gaps = research.gaps.length ? research.gaps.join('; ') : 'none named';
          note = `The archive did not give you anything usable. Name the gaps (${gaps}). Do not say "no results found."`;
        } else {
          note = `Archive findings (cite these; never invent pages):\n${JSON.stringify(research.findings, null, 2)}`;
        }
      }
    } catch (error) {
      if (error?.code !== 'knowledge_kernel_unbound') {
        archiveFailed = true;
        note = 'The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.';
      }
    }
  }
  const system = assembleClementinePrompt({
    voice,
    job: universityJob,
    surface: `This turn is a Knowledge Hub conversation, not a JSON card list. If he is writing, coach the writing: one primary observation, optionally one secondary. If he is asking a research or practice question, synthesise from the archive. Never refuse a question as the wrong office. Cite notes as [Title](pageId). Never write a raw page id in the answer.\n${note}`,
    payload: [
      workingThesis ? `Working thesis:\n${workingThesis}` : '',
      draft ? `Draft excerpt:\n${draft}` : '',
      query ? `Latest question:\n${query}` : ''
    ].filter(Boolean).join('\n\n'),
    quality: formatKnowledgeQualityBlock()
  });
  const reply = await complete(system, messages);
  return { reply, research, archiveFailed };
}
