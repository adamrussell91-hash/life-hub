#!/usr/bin/env node
// Manual live voice evaluation (docs/cognitive-protocol-api.md) run in-process against the real provider.
// Synthetic inputs only. No archive retrieval, no R2, no deploy, no Central Node write-back.
//
//   ANTHROPIC_API_KEY=… node scripts/cognitive-live-eval.mjs [--only fates,tribunal] [--out dir] [--dry]
//
// --dry swaps in a fake model to check the harness itself. Transcripts are written as Markdown, one per scenario.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSession, advance, act } from '../netlify/functions/_shared/cognitive-controller.mjs';
import { defaultModel } from '../netlify/functions/knowledge-protocols.mjs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry');
const only = flag('--only')?.split(',');
const out = flag('--out') || join(tmpdir(), `cognitive-live-eval-${Date.now()}`);

const SCENARIOS = [
  { id: 'fates-sprint', protocolId: 'fates', mode: 'sprint',
    intake: { task: 'Design a Saturday community library event that draws teenagers who never visit' },
    answers: ['Audience is 13 to 16 year olds from the two nearby high schools', 'Budget is $400 and one Saturday afternoon', 'Success is 25 teens who come back within a month', 'A movie night last year drew six people'],
    checks: ['3 alternating stops after the confirmed plan', 'Lachesis reports sprint as fixed and does not re-ask supplied fields', 'Voices distinguishable with labels covered', 'No Weave before filter closure'] },
  { id: 'horizon-no-future', protocolId: 'horizon', mode: 'full',
    intake: { focus: 'Career direction as a secondary teacher', trajectory: 'Eight years teaching science, took on year coordinator two years ago, evenings go to marking', constraints: 'Mortgage, cannot drop below current salary' },
    answers: ['Coordinator load has grown each term', 'Mostly drift, I think', 'Unclassified'],
    checks: ['Ketill stays within two years and names delayed effects per fork', 'Alvar labels extrapolation, moderate-to-low confidence, names a precondition below the event layer', 'Sigrid contrasts future with obstacle and classifies 2 to 4 gaps', 'Map covers all sections in about 700 words'] },
  { id: 'refinery-unsound', protocolId: 'refinery', mode: 'full',
    intake: { claim: 'Homework should be banned in every school because students dislike it', context: 'Opinion piece for a school newsletter', audience: 'Parents and teachers' },
    answers: ['Offer a reframe labelled as a suggestion', 'Keep it short for a newsletter'],
    checks: ['Thesis restated and confirmed before Builder', 'Builder shows Toulmin joints', 'Breaker names weakest joint and likely sets thesisUnsound', 'Run waits for rebuild-or-reframe before Reforger', 'Closing summary adds nothing new'] },
  { id: 'cartographers-interrogation', protocolId: 'cartographers', mode: 'interrogation',
    intake: { topic: 'Short meetings and participation', purpose: 'Decide whether to propose a 20-minute cap to the library committee',
      sources: 'Paper A (Lee 2020). Small field experiment, 40 teams: capping meetings at 20 minutes raised the share of members who spoke from 45% to 70%. Limitation: one organisation, four weeks.\n\nPaper B (Ortiz 2021). Survey of 600 staff: members of short-meeting teams reported feeling less consulted on complex decisions. Limitation: self-report, cross-sectional.' },
    answers: ['Continue', 'Draw the map', 'Continue'],
    checks: ['No Surveyor turn anywhere', 'Only Paper A and Paper B cited; no invented papers', 'Waits after contradictions and after master synthesis', 'Closing summary traces to slips'] },
  { id: 'mirror-quick', protocolId: 'mirror', mode: 'quick',
    intake: { conflict: 'I agreed to run the Saturday chess club again instead of resting', behaviour: 'I said yes to chess club last Saturday' },
    answers: ['That was the only Saturday this term', 'I have not written anything about rest', 'I can protect Sunday morning'],
    checks: ['Framing stated first without a question', 'Gu Jian refuses a trend from one instance', 'Wang Yuan names the silence, invents no aspiration', 'Zheng Ming ends on the seven-day question'] },
  { id: 'consilium-standard', protocolId: 'consilium', mode: 'standard',
    intake: { dilemma: 'I found a scoring error that would drop a colleague\'s student from an award list after results were announced', parties: 'The student, the colleague, other nominees, the school', constraints: 'Results were published two days ago' },
    answers: ['Yes, that framing is right', 'The student has already told family', 'Correcting it quietly is not possible', 'I care about being someone people can trust with results', 'The colleague would support correcting it'],
    checks: ['Framing waits for confirmation', 'Virtue never first; signature openings once', 'Every voice and the user contribute before the map', 'Map has no verdict; reflection closes the run'] },
  { id: 'witness-standard', protocolId: 'witness', mode: 'standard',
    intake: { instance: 'Choosing which of two venues to book for the end-of-year awards', timeBoundary: 'Tuesday afternoon, about 20 minutes', outcome: 'Booked the hall I had used before', process: 'Opened both quotes, saw the familiar hall was cheaper, booked it before reading the second quote fully' },
    answers: [],
    checks: ['Trace uses the 250 words for sequence, not story', 'Trace ends on the verification question', 'Pattern Match starts from sound thinking', 'Recalibration gives one disposition', 'Closing summary'] },
  { id: 'tribunal-no-attempts', protocolId: 'tribunal', mode: 'standard',
    intake: { problem: 'Staff meetings overrun every week by at least twenty minutes and the agenda never finishes', entrenchment: 'It has happened all year despite complaints and nobody changes anything', framing: 'The chair lets people talk too long and needs to be firmer' },
    answers: ['We tried a timed agenda, a parking lot for side issues, and rotating chairs. Each worked for about two weeks.'],
    checks: ['Clarify asks what has been tried', 'Inverter tests the attempted solutions first', 'Voices ask no questions and do not reference each other', 'Convergence ends with the fixed closing line'] }
];

function fakeModel(p) {
  if (p.gate || p.stage === 'clarify') return { text: `Dry ${p.speaker} ${p.stage}.`, question: 'Is that right?', done: true, evidenceIds: [] };
  const ask = ['retrospective', 'prospective', 'clotho', 'atropos', 'lachesis'].includes(p.speaker) && !p.finalBurst;
  return { text: `Dry ${p.speaker} ${p.stage}.`, question: ask || p.stage === 'dialogue' ? 'Which part matters most?' : null, done: true, evidenceIds: [] };
}

const env = process.env;
if (!dry && !env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set. Use --dry to check the harness.'); process.exit(2); }
const model = dry ? async p => fakeModel(p) : p => defaultModel(p, env);
const retrieve = async () => ({ evidence: [], status: 'Live eval: archive retrieval disabled.' });

function chooseAction(s, answers) {
  const k = s.checkpoint?.kind, a = s.allowedActions;
  if (k === 'reflection') return ['reflect', 'This leaves me clearer on what I owe.'];
  if (k === 'verify') return ['confirm'];
  if (a.includes('finish')) return ['finish'];
  if (a.includes('close')) return ['close'];
  if (k === 'confirm') return ['confirm'];
  return ['answer', answers.shift() || 'That covers it. Continue.'];
}

async function runScenario(sc) {
  let s = createSession({ id: randomUUID(), owner: 'live-eval', protocolId: sc.protocolId, mode: sc.mode, intake: sc.intake, requestId: randomUUID() });
  const answers = [...sc.answers], log = [], started = Date.now();
  for (let n = 0; n < 80 && !['completed', 'cancelled', 'failed'].includes(s.status); n++) {
    if (['queued', 'running'].includes(s.status)) {
      try { s = await advance(s, { model, retrieve }); }
      catch (e) { log.push(`FAILED at ${s.stage}: ${e.code || ''} ${e.message}`); break; }
    } else if (s.status === 'waiting' || s.status === 'paused') {
      if (s.status === 'paused') { s = act(s, { action: 'resume', revision: s.revision, requestId: randomUUID() }); continue; }
      const [action, text] = chooseAction(s, answers);
      log.push(`checkpoint ${s.checkpoint.kind} at ${s.stage} → ${action}${text ? `: ${text}` : ''}`);
      s = act(s, { action, text, revision: s.revision, requestId: randomUUID() });
    }
  }
  const secs = Math.round((Date.now() - started) / 1000);
  const md = [`# ${sc.id} (${sc.protocolId}/${sc.mode})`, '', `Status: **${s.status}** · ${s.transcript.length} turns · ${secs}s`, '',
    '## Checks for the reviewer', ...sc.checks.map(c => `- [ ] ${c}`), '', '## Checkpoints', ...log.map(l => `- ${l}`), '', '## Transcript', '',
    ...s.transcript.map(t => `### ${t.speaker} · ${t.stage}${t.trimmed ? ' · trimmed' : ''}\n\n${t.text}\n`)].join('\n');
  writeFileSync(join(out, `${sc.id}.md`), md);
  return { id: sc.id, status: s.status, turns: s.transcript.length, secs, failed: log.find(l => l.startsWith('FAILED')) };
}

mkdirSync(out, { recursive: true });
const picked = SCENARIOS.filter(sc => !only || only.some(o => sc.id.startsWith(o) || sc.protocolId === o));
const results = await Promise.all(picked.map(runScenario));
for (const r of results) console.log(`${r.status.padEnd(9)} ${r.id.padEnd(30)} ${String(r.turns).padStart(3)} turns ${r.secs}s${r.failed ? `  ${r.failed}` : ''}`);
console.log(`Transcripts: ${out}`);
process.exit(results.every(r => r.status === 'completed') ? 0 : 1);
