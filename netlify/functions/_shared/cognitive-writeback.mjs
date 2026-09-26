import { createGitHubClient } from './github-client.mjs';
import { applyCentralNodePatch } from '../../../apps/life/js/core/central-node-patch.js';
import { assertAgentMayApplyCentralNodePatch } from './hammond-tools.mjs';

export const PROTOCOL_CN_SENDERS = {
  fates: 'The Three Fates',
  horizon: 'Horizon Council',
  refinery: 'The Refinery',
  cartographers: 'The Cartographers',
  mirror: 'The Mirror Council',
  consilium: 'The Consilium',
  witness: 'The Witness',
  tribunal: 'The Tribunal'
};

const words = s => String(s || '').trim().split(/\s+/u).filter(Boolean).length;

export function centralNodeLineOk(line) {
  const text = String(line || '').trim();
  if (!text || text.includes('!') || /\n/.test(text)) return false;
  if (words(text) > 40) return false;
  if (/amazing|incredible|thrilled|excited|game.?changer/i.test(text)) return false;
  return true;
}

export function clampSummary(raw = {}) {
  const title = String(raw.title || 'Untitled run').trim().slice(0, 120);
  const keyFinding = String(raw.keyFinding || '').trim().slice(0, 160);
  let summary = String(raw.summary || '').trim();
  while (words(summary) > 80) {
    const parts = summary.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [];
    if (parts.length <= 1) {
      summary = summary.split(/\s+/u).slice(0, 80).join(' ');
      break;
    }
    parts.pop();
    summary = parts.join('').trim();
  }
  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()).slice(0, 6)
    : [];
  let forHammond = raw.forHammond == null || raw.forHammond === '' ? null : String(raw.forHammond).trim();
  if (forHammond && (forHammond.includes('!') || words(forHammond) > 30)) forHammond = forHammond.replace(/!+/g, '.').split(/\s+/u).slice(0, 30).join(' ');
  return { title, keyFinding, summary, openQuestions, forHammond };
}

export async function summariseCompletedSession(session, model) {
  if (typeof model !== 'function') {
    return clampSummary({
      title: session.intake?.task || session.intake?.focus || session.intake?.claim || session.protocolId,
      keyFinding: 'Run completed.',
      summary: 'The protocol finished without a model summary.',
      openQuestions: [],
      forHammond: null
    });
  }
  const raw = await model({
    system: 'Return JSON only: {"title","keyFinding","summary","openQuestions","forHammond"}. keyFinding max 160 characters. summary max 80 words. forHammond is null unless there is a concrete actionable directive for Hammond.',
    user: JSON.stringify({
      protocolId: session.protocolId,
      mode: session.mode,
      intake: session.intake,
      transcript: (session.transcript || []).slice(-24).map(t => ({ role: t.role, speaker: t.speaker, stage: t.stage, text: t.text }))
    }),
    wordBudget: 200,
    speaker: 'summary',
    stage: 'summary'
  });
  let parsed = {};
  try {
    const text = typeof raw?.text === 'string' ? raw.text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch { parsed = {}; }
  return clampSummary(parsed);
}

export function buildProtocolWriteBackLines(session) {
  const sender = PROTOCOL_CN_SENDERS[session.protocolId] || session.protocolId;
  const date = (session.updatedAt || new Date().toISOString()).slice(0, 10);
  const finding = (session.summary?.keyFinding || 'Run completed.').replace(/!+/g, '.').trim();
  const recent = `${sender}: ${date}: ${finding}`.slice(0, 200);
  const lines = [];
  if (centralNodeLineOk(recent)) {
    lines.push({ section: 'recent_actions', op: 'append_line', payload: { summary: 'Protocol recent action', text: recent }, sender });
  }
  if (session.summary?.forHammond) {
    const directive = `${sender}\u2192Hammond: ${session.summary.forHammond}`.replace(/!+/g, '.').trim();
    if (centralNodeLineOk(directive)) {
      lines.push({ section: 'cross_agent', op: 'append_line', payload: { summary: 'Protocol cross-agent directive', text: directive }, sender });
    }
  }
  return lines;
}

export async function writeProtocolCentralNodeLines(session, env, { fetchImpl = fetch, readCentralNode, writeCentralNode } = {}) {
  const patches = buildProtocolWriteBackLines(session);
  if (!patches.length) return { ok: true, written: [] };
  for (const patch of patches) {
    const slug = `protocol:${session.protocolId}`;
    if (!assertAgentMayApplyCentralNodePatch(slug, patch)) {
      return { ok: false, error: 'sender_not_permitted', written: [] };
    }
  }
  try {
    let markdown;
    if (typeof readCentralNode === 'function') markdown = await readCentralNode(env, fetchImpl);
    else {
      const client = createGitHubClient({ env, fetchImpl });
      const { tree } = await client.resolveTree();
      const entry = tree.find(e => e.path === 'central-node.md' && e.type === 'blob');
      if (!entry?.sha) return { ok: false, error: 'central_node_missing', written: [] };
      markdown = await client.readBlob(entry.sha);
    }
    let next = markdown;
    const written = [];
    for (const patch of patches) {
      const applied = applyCentralNodePatch(next, patch);
      if (!applied) return { ok: false, error: 'patch_failed', written };
      next = applied;
      written.push({ section: patch.section, text: patch.payload.text });
    }
    if (typeof writeCentralNode === 'function') await writeCentralNode(next, env, fetchImpl);
    else {
      // ponytail: write path left to chat/commit helpers; tests inject writeCentralNode.
      // Upgrade: shared GitHub write helper once protocol write-back is live-wired.
      throw Object.assign(new Error('Central Node write helper not configured.'), { code: 'cn_write_unconfigured' });
    }
    return { ok: true, written };
  } catch (error) {
    return { ok: false, error: error?.code || error?.message || 'write_failed', written: [] };
  }
}
