/**
 * Sorts a class's continuum-line reasons by how students argued, with one
 * short Claude call. Claude gets the statement, the line's labels, the text
 * stimulus if there is one, and each reason with its position, by opaque id.
 */
import { completeMessage } from './anthropic-client.mjs';
import { parseGroups } from './brainstorm-groups.mjs';

const MODEL = 'claude-haiku-4-5';

const SYSTEM = `You sort the reasons a class gave for placing a statement on a line, for a teacher leading a critical thinking discussion.
Group by HOW each student argued, not where they placed it: for example, read it straight from the evidence, brought in an outside assumption, offered another explanation, questioned what the line's words mean.
Reply with JSON only: {"groups":[{"name":"...","ids":["..."]}]}.
Use 2 to 5 groups. Names are 2 to 6 plain words in sentence case, describing the move, never judging it.
Put every id in exactly one group. Use only ids you were given.`;

export async function groupReasons({ statement, scale, stimulus, reasons, apiKey, fetchImpl = fetch, model }) {
  const reply = await completeMessage({
    apiKey,
    fetchImpl,
    model: model || MODEL,
    maxTokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          stimulus: stimulus || undefined,
          statement,
          line: { left_end: scale.left, right_end: scale.right, middle_stops: scale.stops },
          reasons: reasons.map((r) => ({ id: r.id, position: `${Math.round(r.position * 100)}% of the way from ${scale.left} to ${scale.right}`, reason: r.reason }))
        })
      }
    ]
  });
  return parseGroups(reply, reasons.map((r) => r.id));
}
