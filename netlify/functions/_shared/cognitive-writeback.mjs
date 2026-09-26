import { createGitHubClient } from './github-client.mjs';
import { applyCentralNodePatch } from '../../../apps/life/js/core/central-node-patch.js';
import { assertAgentMayApplyCentralNodePatch, PROTOCOL_CN_SENDERS } from './hammond-tools.mjs';
import { horizonNextReviewDue } from './cognitive-horizon.mjs';
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';

export { PROTOCOL_CN_SENDERS };

const words = s => String(s || '').trim().split(/\s+/u).filter(Boolean).length;

export function centralNodeLineOk(line) {
  const text = String(line || '').trim();
  if (!text || text.includes('!') || /\n/.test(text)) return false;
  if (words(text) > 40) return false;
  if (/amazing|incredible|thrilled|excited|game.?changer/i.test(text)) return false;
  return true;
}

function clampToSentenceOrClause(text, maxWords) {
  const cleaned = String(text || '').replace(/!+/g, '.').trim();
  if (!cleaned) return null;
  if (words(cleaned) <= maxWords) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]+/gu) || [];
  let kept = '';
  for (const sentence of sentences) {
    const candidate = `${kept}${sentence}`.trim();
    if (words(candidate) > maxWords) break;
    kept = candidate;
  }
  if (kept) return kept;
  const clauses = cleaned.split(/(?<=[;:—–-])\s+/u);
  kept = '';
  for (const clause of clauses) {
    const candidate = kept ? `${kept} ${clause}`.trim() : clause.trim();
    if (words(candidate) > maxWords) break;
    kept = candidate;
  }
  return kept || null;
}

/** Trim finding so prefix + finding + suffix stay within 200 chars and 40 words. Suffix stays whole. */
function fitFinding(finding, prefix, suffix) {
  const maxChars = Math.max(0, 200 - prefix.length - suffix.length);
  const maxWords = Math.max(0, 40 - words(`${prefix}${suffix}`));
  let text = String(finding || '').replace(/!+/g, '.').trim();
  if (!text) text = 'Run completed.';
  const tokens = text.split(/\s+/u).filter(Boolean);
  while (tokens.length && (tokens.length > maxWords || tokens.join(' ').length > maxChars)) {
    tokens.pop();
  }
  return tokens.join(' ') || text.slice(0, maxChars).trim();
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
  if (forHammond) {
    forHammond = forHammond.replace(/!+/g, '.');
    if (words(forHammond) > 30) forHammond = clampToSentenceOrClause(forHammond, 30);
  }
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
  const stamp = session.completedAt || session.updatedAt || new Date().toISOString();
  const date = getSydneyDateKey(new Date(stamp));
  const finding = (session.summary?.keyFinding || 'Run completed.').replace(/!+/g, '.').trim();
  let recent;
  if (session.protocolId === 'horizon') {
    const due = horizonNextReviewDue(stamp);
    const suffix = `; next review due ${due}`;
    const prefix = `${sender}: ${date}: `;
    recent = `${prefix}${fitFinding(finding, prefix, suffix)}${suffix}`;
  } else {
    recent = `${sender}: ${date}: ${finding}`.slice(0, 200);
  }
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

/** Same GitHub contents write path chat.mjs uses for Central Node patches. */
export async function writeCentralNodeMarkdown(content, env, fetchImpl = fetch, { sha, message = 'chore(cn): protocol write-back' } = {}) {
  const client = createGitHubClient({ env, fetchImpl });
  let blobSha = sha;
  if (!blobSha) {
    const { tree } = await client.resolveTree();
    const entry = tree.find(e => e.path === 'central-node.md' && e.type === 'blob');
    if (!entry?.sha) throw Object.assign(new Error('central_node_missing'), { code: 'central_node_missing' });
    blobSha = entry.sha;
  }
  return client.writeFile({
    path: 'central-node.md',
    content,
    sha: blobSha,
    message
  });
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

  async function once() {
    let markdown;
    let sha;
    if (typeof readCentralNode === 'function') {
      markdown = await readCentralNode(env, fetchImpl);
    } else {
      const client = createGitHubClient({ env, fetchImpl });
      const { tree } = await client.resolveTree();
      const entry = tree.find(e => e.path === 'central-node.md' && e.type === 'blob');
      if (!entry?.sha) return { ok: false, error: 'central_node_missing', written: [] };
      sha = entry.sha;
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
    if (typeof writeCentralNode === 'function') await writeCentralNode(next, env, fetchImpl, { sha });
    else await writeCentralNodeMarkdown(next, env, fetchImpl, { sha, message: `chore(cn): protocol ${session.protocolId} write-back` });
    return { ok: true, written };
  }

  try {
    return await once();
  } catch (error) {
    if (error?.code === 'write_conflict') {
      try { return await once(); }
      catch (retryError) {
        return { ok: false, error: retryError?.code || retryError?.message || 'write_failed', written: [] };
      }
    }
    return { ok: false, error: error?.code || error?.message || 'write_failed', written: [] };
  }
}

export function writeBackRetryable(error) {
  const code = String(error || '');
  return /write_conflict|write_failed|github_unavailable|cn_write_unconfigured|central_node_missing|timeout/i.test(code);
}
