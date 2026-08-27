import { load } from 'js-yaml';
import { parseEventDocument, TYPE_DOMAINS } from '../../../js/core/records.js';
import {
  applyLogToCentralNode,
  formatLogDate
} from '../../../js/core/central-node-write.js';
import {
  GOVERNANCE_LOG_PATH,
  appendGovernanceEntry,
  emptyGovernanceLog
} from '../../../js/core/governance-log.js';
import { AGENTS } from './agent-directory.mjs';
import { decodeBlob } from './decode-blob.mjs';
import { loadCentralNodeSeed } from './load-central-node-seed.mjs';

const CENTRAL_NODE_PATH = 'central-node.md';

export function renderMarkdown(record, notes) {
  const frontmatter = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const body = typeof notes === 'string' && notes.trim() !== '' ? `${notes.trim()}\n` : '';
  return `---\n${frontmatter}\n---\n${body}`;
}

export function describeRecordForLog(record, notes, { medicalAppend = false } = {}) {
  const label = typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null;
  switch (record.type) {
    case 'meal': {
      const macros = [
        record.calories != null ? `${record.calories} kcal` : null,
        record.protein_g != null ? `${record.protein_g}g protein` : null,
        record.fat_g != null ? `${record.fat_g}g fat` : null
      ].filter(Boolean).join(', ');
      const what = label ? `${label} for ${record.meal}` : record.meal;
      return `Logged ${what}${macros ? ` (${macros})` : ''}.`;
    }
    case 'workout': {
      const duration = record.duration_min != null ? `${record.duration_min}-min ` : '';
      const title = record.title ? ` (${record.title})` : '';
      return `Logged a ${duration}${record.day_type ?? 'workout'} session${title}.`;
    }
    case 'skincare':
      return `Logged ${record.routine ?? ''} skincare${record.completed === false ? ' (incomplete)' : ''}.`.replace(/\s+/g, ' ');
    case 'diary':
      return `Logged a diary entry${record.mood ? ` (mood: ${record.mood})` : ''}.`;
    case 'mind_session':
      return `Logged a mind session${record.theme ? ` (${record.theme})` : ''}.`;
    case 'weight':
      return `Logged weight${record.weight_kg != null ? `: ${record.weight_kg}kg` : ''}.`;
    case 'composition':
      return `Logged body composition${record.weight_kg != null ? ` (${record.weight_kg}kg${record.body_fat_pct != null ? `, ${record.body_fat_pct}% body fat` : ''})` : ''}.`;
    case 'measurements':
      return 'Logged body measurements.';
    case 'medical':
      return medicalAppend
        ? `Updated medical visit: ${record.title || 'visit'}.`
        : `Logged medical visit: ${record.title || 'visit'}.`;
    default:
      return `Logged a ${record.type} record.`;
  }
}

export async function persistLogEntry(client, { record, notes, path, existingSha, nowDateKey }) {
  const result = await client.writeFile({
    path,
    content: renderMarkdown(record, notes),
    ...(existingSha ? { sha: existingSha } : {}),
    message: `feat(chat): log ${record.type} for ${record.date}`
  });
  let centralNodeUpdated = false;
  try {
    const cn = await syncCentralNodeAfterLog(client, record, notes);
    centralNodeUpdated = cn?.updated === true;
  } catch {
    centralNodeUpdated = false;
  }
  let governanceUpdated = false;
  if (record.type === 'mind_session' && typeof record.insight === 'string' && record.insight.trim()) {
    try {
      await appendMindInsight(client, record, nowDateKey);
      governanceUpdated = true;
    } catch {
      governanceUpdated = false;
    }
  }
  return { sha: result.sha, commitSha: result.commitSha, centralNodeUpdated, governanceUpdated };
}

function agentNameForType(type) {
  return AGENTS.find(agent => agent.recordTypes.includes(type))?.name ?? 'Life Hub';
}

async function syncCentralNodeAfterLog(client, record, notes) {
  const current = await client.resolveTree();
  const entry = current.tree.find(item => item.path === CENTRAL_NODE_PATH && item.type === 'blob');

  let content;
  let existingSha;
  if (entry) {
    content = decodeBlob(await client.readBlob(entry.sha));
    if (content === null) return { updated: false, reason: 'decode_failed' };
    existingSha = entry.sha;
  } else {
    content = loadCentralNodeSeed();
    if (!content) return { updated: false, reason: 'missing_seed' };
    existingSha = undefined;
  }

  const actionLine = `\n**${formatLogDate(record.date)}:** ${agentNameForType(record.type)}: ${describeRecordForLog(record, notes)}`;
  let nutritionTotals = null;
  if (record.type === 'meal') {
    nutritionTotals = await sumDayMealTotals(client, current.tree, record);
  }

  const updated = applyLogToCentralNode(content, {
    record,
    actionLine,
    nutritionTotals,
    flagNotes: ['meal', 'skincare', 'weight', 'composition', 'measurements', 'medical'].includes(record.type)
      ? notes
      : null
  });
  if (updated === content) return { updated: false, reason: 'unchanged' };

  await client.writeFile({
    path: CENTRAL_NODE_PATH,
    content: updated,
    ...(existingSha ? { sha: existingSha } : {}),
    message: `chore(central-node): sync ${record.type} log into Status`
  });
  return { updated: true };
}

async function sumDayMealTotals(client, tree, record) {
  const domain = TYPE_DOMAINS.meal;
  const [year, month] = record.date.split('-');
  const prefix = `data/${domain}/${year}/${month}/${record.date}-`;
  const mealPaths = tree
    .filter(item => item.type === 'blob' && item.path.startsWith(prefix) && item.path.endsWith('.md'))
    .map(item => item.path);

  const totals = {
    calories: Number(record.calories) || 0,
    protein_g: Number(record.protein_g) || 0,
    fat_g: Number(record.fat_g) || 0
  };
  if (record.sodium_mg != null) totals.sodium_mg = Number(record.sodium_mg) || 0;
  if (record.calcium_mg != null) totals.calcium_mg = Number(record.calcium_mg) || 0;
  if (record.polyphenol_score != null) totals.polyphenol_score = Number(record.polyphenol_score) || 0;

  for (const path of mealPaths) {
    const blobEntry = tree.find(item => item.path === path);
    if (!blobEntry) continue;
    let text;
    try {
      text = decodeBlob(await client.readBlob(blobEntry.sha));
    } catch {
      continue;
    }
    if (text === null) continue;
    try {
      const parsed = parseEventDocument(text, path, load);
      if (parsed.record?.type !== 'meal') continue;
      if (parsed.record.meal === record.meal) continue;
      totals.calories += Number(parsed.record.calories) || 0;
      totals.protein_g += Number(parsed.record.protein_g) || 0;
      totals.fat_g += Number(parsed.record.fat_g) || 0;
      if (parsed.record.sodium_mg != null) {
        totals.sodium_mg = (totals.sodium_mg ?? 0) + (Number(parsed.record.sodium_mg) || 0);
      }
      if (parsed.record.calcium_mg != null) {
        totals.calcium_mg = (totals.calcium_mg ?? 0) + (Number(parsed.record.calcium_mg) || 0);
      }
      if (parsed.record.polyphenol_score != null) {
        totals.polyphenol_score = (totals.polyphenol_score ?? 0) + (Number(parsed.record.polyphenol_score) || 0);
      }
    } catch {
      // Ignore unreadable siblings; still publish totals from the confirmed record.
    }
  }

  return totals;
}

async function appendMindInsight(client, record, nowDateKey) {
  const current = await client.resolveTree();
  const entry = current.tree.find(item => item.path === GOVERNANCE_LOG_PATH && item.type === 'blob');
  let content = emptyGovernanceLog();
  let existingSha;
  if (entry) {
    const decoded = decodeBlob(await client.readBlob(entry.sha));
    if (decoded === null) throw new Error('governance_unreadable');
    content = decoded;
    existingSha = entry.sha;
  }
  const next = appendGovernanceEntry(content, {
    dateKey: nowDateKey,
    entryType: 'Mind Insight',
    title: record.theme ?? 'Mind session',
    body: record.insight
  });
  await client.writeFile({
    path: GOVERNANCE_LOG_PATH,
    content: next,
    ...(existingSha ? { sha: existingSha } : {}),
    message: 'chore(governance): Mind Insight'
  });
}
