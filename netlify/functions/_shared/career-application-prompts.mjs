/**
 * Ann's prompts for one job application: checking each selection criterion
 * against Adam's record, and drafting responses, a cover letter or a CV from
 * the answers he confirmed. Facts about Adam come only from the inputs and the
 * private Central Node, read at runtime; nothing about him lives here.
 */

import { annVoice } from './career-prompts.mjs';

const CENTRAL_NODE_LIMIT = 40000;
const VOICE_SAMPLE_LIMIT = 12000;
const AD_SUMMARY_LIMIT = 4000;

function centralNodeBlock(centralNode) {
  return centralNode ? JSON.stringify(String(centralNode).slice(0, CENTRAL_NODE_LIMIT)) : '(not available)';
}

/** One suggested answer per criterion, naming the cards that show it. */
export function applicationCheckPrompt({ title, where, criteria, cards, roles, centralNode }) {
  return `${annVoice()}

Adam is applying for this role. Read his record and suggest an answer for every selection criterion.
Return strict JSON only:
{ "suggestions": [{ "criterion_id": string, "status": "have"|"partly"|"not_yet"|"unknown", "evidence": string ≤ 200, "card_ids": string[] (≤ 6) }] }

Rules:
- "have": his record clearly shows it. "partly": it shows some of it. "not_yet": it clearly shows he lacks it.
- "unknown": the record says nothing either way. A record that is silent is "unknown", never "not_yet".
- Evidence names the specific record in one plain line, and is empty for "unknown". Invent nothing: no roles, dates or credentials beyond the record.
- card_ids lists the skill cards that show this criterion, strongest first, using only the ids given below. Leave it empty when no card shows it.
- Judge each line on its own. Do not flatter. Adam confirms every answer. Australian English. No markdown.

Role: ${JSON.stringify(title || '')}
Where: ${JSON.stringify(where || '')}
Criteria:
${JSON.stringify(criteria.map((c) => ({ criterion_id: c.id, text: c.text })))}

Work history:
${JSON.stringify(roles)}

Skill cards:
${JSON.stringify(cards)}

Central Node (his private notes about himself):
${centralNodeBlock(centralNode)}
`;
}

const SHARED_WRITING_RULES = `- Write as Adam, in the first person, in his own voice. Match his voice sample and his own earlier answers when given; with neither, write plainly and directly.
- Use only the evidence given here and the Central Node. Invent nothing: no roles, dates, numbers, schools, credentials or people.
- Where something the piece needs is missing from the record, write a bracket such as [add: the year this ran] in its place. Never fill a gap with a guess.
- One claim per sentence. Concrete and specific.
- Start with the substance. No meta openers ("This response will…", "In this letter I…", "I am writing to…").
- State what he can do and has done. No deficit phrasing: avoid "without", "not", "never" and "rather than" framings.
- Australian English. Plain text only: no markdown, no asterisks, no hashes.`;

function roleBlock({ application, where }) {
  return `Role: ${JSON.stringify(application?.position_title || '')}
Where: ${JSON.stringify(where || '')}
Ad summary:
${JSON.stringify(String(application?.advertisement?.summary || '').slice(0, AD_SUMMARY_LIMIT))}`;
}

/** Drafts go out under Adam's name, so they open with no agent persona. */
const DRAFTER = `You are drafting job application writing that Adam will edit and send under his own name. Write as him, never as an assistant or agent.`;

function sourceBlock({ roles, centralNode, voiceSample, ownWriting = [] }) {
  return `Work history:
${JSON.stringify(roles)}

Central Node (his private notes about himself):
${centralNodeBlock(centralNode)}

His voice sample:
${voiceSample ? JSON.stringify(String(voiceSample).slice(0, VOICE_SAMPLE_LIMIT)) : '(not available)'}

Answers he wrote himself on earlier applications (for voice only; do not reuse their claims unless the evidence above supports them):
${ownWriting.length ? JSON.stringify(ownWriting) : '(none yet)'}`;
}

/**
 * The drafting prompt for one target. `criteria` holds only what may be drafted:
 * each with its word limit, confirmed evidence and the full STAR of its cards.
 */
export function applicationDraftPrompt({ target, application, where, criteria = [], roles = [], centralNode, voiceSample, ownWriting = [] }) {
  if (target === 'responses') {
    return `${DRAFTER}

Draft Adam's response to each selection criterion below.
Return strict JSON only:
{ "responses": [{ "criterion_id": string, "text": string }] }

Rules:
${SHARED_WRITING_RULES}
- One response per criterion listed, using its criterion_id. Draft no others.
- Stay under each criterion's word_limit. Where word_limit is null, aim for 200–250 words.
- Build each response on STAR: the situation and task briefly, then what he did, then the result.
- Draw on that criterion's evidence and cards first.

${roleBlock({ application, where })}

Criteria to draft:
${JSON.stringify(criteria)}

${sourceBlock({ roles, centralNode, voiceSample, ownWriting })}
`;
  }
  if (target === 'cover_letter') {
    return `${DRAFTER}

Draft Adam's cover letter for this role.
Return strict JSON only:
{ "text": string }

Rules:
${SHARED_WRITING_RULES}
- One page: about 350–450 words in short paragraphs, with a greeting and a sign-off.
- Lead with his strongest confirmed evidence for what this role asks for.
- Use [add: …] for anything the letter needs that is not given, such as the panel chair's name.

${roleBlock({ application, where })}

Strongest confirmed evidence:
${JSON.stringify(criteria)}

${sourceBlock({ roles, centralNode, voiceSample, ownWriting })}
`;
  }
  return `${DRAFTER}

Draft Adam's CV tailored to this role.
Return strict JSON only:
{ "text": string }

Rules:
${SHARED_WRITING_RULES}
- Plain text with headings on their own lines, in this order: Profile; Roles; Qualifications; Registration; Professional development; Referees.
- Profile: three or four sentences tied to what this role asks for.
- Roles: newest first, each with its title, where and dates from the work history, then 2–4 bullet achievements (lines starting "- ") tied to this role's criteria.
- Qualifications, Registration and Professional development: only what the record shows; otherwise [add: …], for example [add: teaching registration number].
- Referees: "Available on request".

${roleBlock({ application, where })}

Confirmed evidence for this role:
${JSON.stringify(criteria)}

${sourceBlock({ roles, centralNode, voiceSample, ownWriting })}
`;
}
