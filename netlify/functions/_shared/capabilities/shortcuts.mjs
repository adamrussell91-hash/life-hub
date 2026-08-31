/**
 * Named capability shortcuts — thin wrappers over propose-action shapes.
 * Auto risk → write immediately when allowlisted.
 * Confirm risk → return { kind: 'propose', proposal } for Confirm.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHALLENGES_DIR,
  RESEARCH_DIR,
  REMEMBER_WEEK_FLAGS_PATH,
  REMEMBER_CONTEXT_NOTES_PATH,
  CN_LOANS_PATH,
  WIDGETS_DIR,
  OS_DIR,
  slugify,
  newId,
  challengePath,
  researchPath,
  widgetPath,
  resolveResearchTtl,
  researchExpiresAt,
  parseJsonBlob,
  serializeJson,
  findChallengePath,
  isCalendarDate,
  addCalendarDays
} from './stores.mjs';
import {
  isPathAllowedForAgent,
  capabilityIdsForAgent,
  loadCapability,
  loadRegistry,
  capabilitiesRoot
} from './registry.mjs';
import {
  CENTRAL_NODE_SECTIONS,
  classifyCentralNodePatchRisk
} from '../../../../js/core/central-node-patch.js';
import { applyIntuitionEdit } from './intuition.mjs';

const CN_OPS = ['upsert_field', 'append_line', 'replace_section', 'delete_lines', 'condense'];

function deny(message) {
  return { kind: 'error', error: message };
}

function ok(message, data = {}) {
  return { kind: 'ok', message, ...data };
}

function propose(proposal) {
  return { kind: 'propose', proposal };
}

function assertAllow(agentSlug, path) {
  if (!isPathAllowedForAgent(agentSlug, path, { mode: 'write' })) {
    throw new Error(`Path not allowlisted for ${agentSlug}: ${path}`);
  }
}

async function writeAllowlisted(client, agentSlug, path, content, message, sha) {
  assertAllow(agentSlug, path);
  return client.writeFile({
    path,
    content,
    message,
    ...(sha ? { sha } : {})
  });
}

function repoTreeOf(ctx) {
  return ctx.repoTree ?? ctx.repoTree ?? [];
}

function fileFromTree(tree, path) {
  if (!Array.isArray(tree)) return null;
  return tree.find(item => item.type === 'blob' && item.path === path) ?? null;
}

async function readJson(ctx, path, fallback) {
  const entry = fileFromTree(repoTreeOf(ctx), path);
  if (!entry?.sha) return { value: structuredClone(fallback), sha: null };
  try {
    const raw = await ctx.readBlob(entry.sha);
    return { value: parseJsonBlob(raw, structuredClone(fallback)), sha: entry.sha };
  } catch {
    return { value: structuredClone(fallback), sha: entry.sha };
  }
}

function buildProposal({ agentSlug, intent, writes, surfaces = ['governance_log'], reads = [] }) {
  return {
    intent,
    reads,
    writes: writes.map(write => ({
      path: write.path,
      mode: write.mode || 'create',
      content: write.content,
      diff: write.diff || `${write.mode || 'create'} ${write.path}`
    })),
    surfaces
  };
}

export function shortcutSchemas() {
  return {
    remember_set_week_flag: {
      name: 'remember_set_week_flag',
      description: 'Set or clear a week-scoped remember flag (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          week_id: { type: 'string', description: 'ISO week id YYYY-Www' },
          key: { type: 'string' },
          value: {},
          clear: { type: 'boolean' }
        },
        required: ['week_id', 'key'],
        additionalProperties: false
      }
    },
    remember_note_context: {
      name: 'remember_note_context',
      description: 'Append a durable context note for later turns (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          note: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['note'],
        additionalProperties: false
      }
    },
    track_open_challenge: {
      name: 'track_open_challenge',
      description: 'Propose opening a challenge (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          metric: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['title', 'goal'],
        additionalProperties: false
      }
    },
    track_log_progress: {
      name: 'track_log_progress',
      description: 'Log progress on an open challenge (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          entry: { type: 'string' },
          value: {},
          date: { type: 'string' }
        },
        required: ['challenge_id', 'entry'],
        additionalProperties: false
      }
    },
    track_close_challenge: {
      name: 'track_close_challenge',
      description: 'Propose closing a challenge with a verdict (Confirm). On dispute, propose a revised verdict.',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          verdict: { type: 'string', enum: ['met', 'missed', 'partial', 'abandoned'] },
          summary: { type: 'string' },
          revised: { type: 'boolean', description: 'True when revising after a dispute' }
        },
        required: ['challenge_id', 'verdict', 'summary'],
        additionalProperties: false
      }
    },
    coordinate_request_cn_write: {
      name: 'coordinate_request_cn_write',
      description:
        'Request a Central Node write via CN loan. Auto-risk patches apply immediately; high-risk needs Confirm (Hammond does not re-Confirm if ask is auto).',
      input_schema: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: [...CENTRAL_NODE_SECTIONS] },
          op: { type: 'string', enum: [...CN_OPS] },
          path: { type: 'string' },
          value: {},
          reason: { type: 'string' }
        },
        required: ['section', 'op', 'reason'],
        additionalProperties: false
      }
    },
    research_save_brief: {
      name: 'research_save_brief',
      description: 'Save a research brief with per-domain TTL (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          domain: {
            type: 'string',
            enum: ['clinical', 'nutrition', 'fitness', 'skincare', 'mind', 'retail', 'general']
          },
          summary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          body: { type: 'string' },
          ttl_days: { type: 'number' }
        },
        required: ['title', 'domain', 'summary'],
        additionalProperties: false
      }
    },
    research_expiring_brief: {
      name: 'research_expiring_brief',
      description: 'List research briefs nearing expiry for this agent.',
      input_schema: {
        type: 'object',
        properties: {
          within_days: { type: 'number' }
        },
        additionalProperties: false
      }
    },
    publish_surface_widget: {
      name: 'publish_surface_widget',
      description: 'Publish one Adam-approved widget template instance (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          template_id: { type: 'string' },
          title: { type: 'string' },
          props: { type: 'object' }
        },
        required: ['template_id', 'title'],
        additionalProperties: false
      }
    },
    plan_week_meals: {
      name: 'plan_week_meals',
      description: 'Propose a week meal plan write (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          week_id: { type: 'string' },
          meals: { type: 'object' },
          notes: { type: 'string' }
        },
        required: ['week_id', 'meals'],
        additionalProperties: false
      }
    },
    lookup_food_brand_au: {
      name: 'lookup_food_brand_au',
      description:
        'AU-first nutrition lookup reminder — search Australian sources, then cache with save_food_library_entry.',
      input_schema: {
        type: 'object',
        properties: {
          brand: { type: 'string' },
          product: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['brand', 'product'],
        additionalProperties: false
      }
    },
    os_capability_scoreboard: {
      name: 'os_capability_scoreboard',
      description: 'Return this agent\'s capability scoreboard (surface when useful / when asked).',
      input_schema: {
        type: 'object',
        properties: {
          detail: { type: 'boolean' }
        },
        additionalProperties: false
      }
    },
    intuition_edit_pack: {
      name: 'intuition_edit_pack',
      description: 'Update a standing intuition pack this agent owns (judgment only — never gates capacity). Auto when allowlisted.',
      input_schema: {
        type: 'object',
        properties: {
          pack_id: { type: 'string', description: 'Existing intuition pack id, e.g. flare-rules' },
          summary: { type: 'string' },
          guidance: { type: 'string' },
          reason: { type: 'string', description: 'Why this prior is changing' }
        },
        required: ['pack_id', 'reason'],
        additionalProperties: false
      }
    },
    os_promote_shortcut: {
      name: 'os_promote_shortcut',
      description: 'Propose promoting a repeated durable pattern into a named shortcut draft for Adam to Confirm (does not mutate the live registry).',
      input_schema: {
        type: 'object',
        properties: {
          proposed_id: { type: 'string', description: 'e.g. track.morning-weigh-in' },
          tool_name: { type: 'string' },
          summary: { type: 'string' },
          example_intent: { type: 'string' },
          example_writes: { type: 'array', items: { type: 'object' } },
          risk: { type: 'string', enum: ['auto', 'confirm'] }
        },
        required: ['proposed_id', 'summary', 'example_intent'],
        additionalProperties: false
      }
    }
  };
}

export function isShortcutTool(name) {
  return Boolean(shortcutSchemas()[name]);
}

async function handleRememberSetWeekFlag(ctx, input) {
  const weekId = String(input.week_id || '').trim();
  const key = String(input.key || '').trim();
  if (!weekId || !key) return deny('week_id and key are required');
  const path = REMEMBER_WEEK_FLAGS_PATH;
  const { value: data, sha } = await readJson(ctx, path, { weeks: {} });
  if (!data.weeks || typeof data.weeks !== 'object') data.weeks = {};
  if (!data.weeks[weekId] || typeof data.weeks[weekId] !== 'object') data.weeks[weekId] = {};
  if (input.clear) delete data.weeks[weekId][key];
  else data.weeks[weekId][key] = input.value ?? true;
  data.updated_at = new Date().toISOString();
  data.updated_by = ctx.agentSlug;
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(data),
    `remember: week flag ${weekId}/${key}`,
    sha
  );
  return ok(input.clear ? `Cleared ${key} for ${weekId}` : `Set ${key} for ${weekId}`, { path });
}

async function handleRememberNoteContext(ctx, input) {
  const note = String(input.note || '').trim();
  if (!note) return deny('note is required');
  const path = REMEMBER_CONTEXT_NOTES_PATH;
  const { value: data, sha } = await readJson(ctx, path, { notes: [] });
  if (!Array.isArray(data.notes)) data.notes = [];
  data.notes.push({
    id: newId('note'),
    agent_id: ctx.agentSlug,
    note,
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    created_at: new Date().toISOString()
  });
  data.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(data),
    'remember: context note',
    sha
  );
  return ok('Context note saved', { path });
}

async function handleTrackOpenChallenge(ctx, input) {
  const title = String(input.title || '').trim();
  const goal = String(input.goal || '').trim();
  if (!title || !goal) return deny('title and goal are required');
  const start = isCalendarDate(input.start_date) ? input.start_date : ctx.today;
  const end = isCalendarDate(input.end_date) ? input.end_date : addCalendarDays(start, 14);
  const id = newId('ch');
  const path = challengePath(start, title);
  const body = {
    id,
    title,
    goal,
    metric: input.metric || null,
    start_date: start,
    end_date: end,
    notes: input.notes || '',
    status: 'open',
    owner_agent: ctx.agentSlug,
    progress: [],
    created_at: new Date().toISOString()
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Open challenge: ${title}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `new challenge ${title} (${start} → ${end})`
      }]
    })
  );
}

async function handleTrackLogProgress(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const entry = String(input.entry || '').trim();
  if (!challengeId || !entry) return deny('challenge_id and entry are required');
  const path = findChallengePath(repoTreeOf(ctx), challengeId);
  if (!path) return deny(`Challenge not found: ${challengeId}`);
  const { value: challenge, sha } = await readJson(ctx, path, null);
  if (!challenge || challenge.status === 'closed') return deny('Challenge is closed or missing');
  if (!Array.isArray(challenge.progress)) challenge.progress = [];
  challenge.progress.push({
    at: new Date().toISOString(),
    date: isCalendarDate(input.date) ? input.date : ctx.today,
    entry,
    value: input.value ?? null,
    agent_id: ctx.agentSlug
  });
  challenge.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(challenge),
    `track: progress ${challengeId}`,
    sha
  );
  return ok('Progress logged', { path, challenge_id: challengeId });
}

async function handleTrackCloseChallenge(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const verdict = String(input.verdict || '').trim();
  const summary = String(input.summary || '').trim();
  if (!challengeId || !verdict || !summary) {
    return deny('challenge_id, verdict, and summary are required');
  }
  const path = findChallengePath(repoTreeOf(ctx), challengeId);
  if (!path) return deny(`Challenge not found: ${challengeId}`);
  const { value: challenge } = await readJson(ctx, path, null);
  if (!challenge) return deny('Challenge missing');
  const closed = {
    ...challenge,
    status: 'closed',
    verdict,
    close_summary: summary,
    closed_at: new Date().toISOString(),
    closed_by: ctx.agentSlug,
    revised_verdict: Boolean(input.revised)
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: input.revised
        ? `Revise challenge verdict: ${challenge.title || challengeId}`
        : `Close challenge: ${challenge.title || challengeId}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'overwrite',
        content: serializeJson(closed),
        diff: `${verdict} — ${summary}`
      }]
    })
  );
}

async function handleCoordinateRequestCnWrite(ctx, input) {
  const section = String(input.section || '').trim();
  const op = String(input.op || '').trim();
  const reason = String(input.reason || '').trim();
  if (!CENTRAL_NODE_SECTIONS.includes(section)) return deny(`Invalid section: ${section}`);
  if (!CN_OPS.includes(op)) return deny(`Invalid op: ${op}`);
  if (!reason) return deny('reason is required');
  const patch = {
    section,
    op,
    path: input.path || undefined,
    value: input.value,
    reason,
    requested_by: ctx.agentSlug
  };
  const risk = classifyCentralNodePatchRisk(patch);
  const loan = {
    id: newId('loan'),
    from_agent: ctx.agentSlug,
    to_agent: 'hammond',
    patch,
    risk,
    status: risk === 'auto' ? 'applied' : 'pending',
    created_at: new Date().toISOString(),
    inherit_lower_risk: true
  };

  const { value: loansDoc, sha } = await readJson(ctx, CN_LOANS_PATH, { loans: [] });
  if (!Array.isArray(loansDoc.loans)) loansDoc.loans = [];
  loansDoc.loans.push(loan);
  loansDoc.updated_at = new Date().toISOString();
  const content = serializeJson(loansDoc);

  if (risk === 'auto') {
    // Capability loan inherits lower risk — apply without Hammond Confirm.
    await writeAllowlisted(
      ctx.client,
      ctx.agentSlug,
      CN_LOANS_PATH,
      content,
      `coordinate: CN loan ${loan.id}`,
      sha
    );
    return {
      kind: 'loan_auto',
      message: `CN loan applied (auto risk): ${section}/${op}`,
      loan
    };
  }

  return {
    kind: 'loan_confirm',
    message: `CN loan needs Confirm (risk=${risk})`,
    proposal: buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `CN write: ${section}/${op}`,
      surfaces: ['confirm_card', 'central_node', 'governance_log'],
      writes: [{
        path: CN_LOANS_PATH,
        mode: sha ? 'overwrite' : 'create',
        content,
        diff: `pending CN loan ${loan.id}: ${reason}`
      }]
    }),
    loan
  };
}

async function handleResearchSaveBrief(ctx, input) {
  const title = String(input.title || '').trim();
  const domain = String(input.domain || 'general').trim();
  const summary = String(input.summary || '').trim();
  if (!title || !summary) return deny('title and summary are required');
  const ttl = resolveResearchTtl(domain, input.ttl_days);
  const created = new Date().toISOString();
  const body = {
    id: newId('rb'),
    title,
    domain,
    summary,
    body: input.body || '',
    sources: Array.isArray(input.sources) ? input.sources.map(String) : [],
    ttl_days: ttl,
    created_at: created,
    expires_at: researchExpiresAt(domain, created, ttl),
    owner_agent: ctx.agentSlug
  };
  const path = researchPath(ctx.today, title);
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Save research: ${title}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `${domain} · TTL ${ttl}d — ${summary}`
      }]
    })
  );
}

async function handleResearchExpiringBrief(ctx, input) {
  const within = Number.isFinite(Number(input.within_days)) ? Number(input.within_days) : 7;
  const cutoff = Date.now() + within * 86400000;
  const files = repoTreeOf(ctx).filter(item =>
    item.type === 'blob'
    && typeof item.path === 'string'
    && item.path.startsWith(`${RESEARCH_DIR}/`)
    && item.path.endsWith('.json')
  );
  const expiring = [];
  for (const file of files) {
    try {
      const raw = await ctx.readBlob(file.sha);
      const brief = parseJsonBlob(raw, null);
      if (!brief?.expires_at) continue;
      if (brief.owner_agent && brief.owner_agent !== ctx.agentSlug) continue;
      const exp = Date.parse(brief.expires_at);
      if (Number.isFinite(exp) && exp <= cutoff) {
        expiring.push({
          id: brief.id,
          title: brief.title,
          domain: brief.domain,
          expires_at: brief.expires_at,
          path: file.path
        });
      }
    } catch {
      /* skip */
    }
  }
  return ok(`Found ${expiring.length} brief(s) expiring within ${within}d`, { briefs: expiring });
}

function loadWidgetTemplate(templateId) {
  const root = capabilitiesRoot();
  const path = join(root, 'widgets', 'templates', `${templateId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function handlePublishSurfaceWidget(ctx, input) {
  const templateId = String(input.template_id || '').trim();
  const title = String(input.title || '').trim();
  if (!templateId || !title) return deny('template_id and title are required');
  const template = loadWidgetTemplate(templateId);
  if (!template) return deny(`Template not found: ${templateId}`);
  if (!template.approved) {
    return deny(`Template ${templateId} is not Adam-approved yet — one at a time`);
  }
  const path = widgetPath(ctx.today, title);
  const body = {
    id: newId('wg'),
    template_id: templateId,
    title,
    props: input.props && typeof input.props === 'object' ? input.props : {},
    owner_agent: ctx.agentSlug,
    created_at: new Date().toISOString(),
    status: 'published'
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Publish widget: ${title}`,
      surfaces: ['confirm_card', 'hub_tab', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `template=${templateId}`
      }]
    })
  );
}

async function handlePlanWeekMeals(ctx, input) {
  const weekId = String(input.week_id || '').trim();
  if (!weekId || !input.meals || typeof input.meals !== 'object') {
    return deny('week_id and meals are required');
  }
  const path = `data/nutrition/meal-plans/week-${slugify(weekId)}.json`;
  const body = {
    week_id: weekId,
    meals: input.meals,
    notes: input.notes || '',
    planned_by: ctx.agentSlug,
    updated_at: new Date().toISOString()
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Week meals: ${weekId}`,
      surfaces: ['confirm_card', 'nutrition_tab', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: input.notes || 'Meal plan proposal'
      }]
    })
  );
}

async function handleLookupFoodBrandAu(_ctx, input) {
  const brand = String(input.brand || '').trim();
  const product = String(input.product || '').trim();
  if (!brand || !product) return deny('brand and product are required');
  return ok(
    `AU lookup: search Australian sources only for ${brand} ${product} (FSANZ, brand .com.au, Coles/Woolworths, CalorieKing AU). Then cache with save_food_library_entry.`,
    {
      brand,
      product,
      region: 'AU',
      notes: input.notes || '',
      next_step: 'save_food_library_entry'
    }
  );
}

async function handleOsCapabilityScoreboard(ctx, input) {
  const registry = loadRegistry();
  const ids = capabilityIdsForAgent(ctx.agentSlug);
  const rows = ids.map(id => {
    const def = loadCapability(id);
    return {
      id,
      risk: def?.risk || 'confirm',
      one_liner: def?.prompt_one_liner || id
    };
  });
  return ok(`Capability scoreboard for ${ctx.agentSlug}`, {
    agent_id: ctx.agentSlug,
    count: rows.length,
    capabilities: input.detail === false ? rows.map(row => row.id) : rows,
    registry_version: registry.version
  });
}





async function handleIntuitionEditPack(ctx, input) {
  const packId = String(input.pack_id || '').trim();
  const reason = String(input.reason || '').trim();
  if (!packId || !reason) return deny('pack_id and reason are required');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(packId)) return deny('pack_id must be a kebab-case id');
  const path = `intuition/${packId}.json`;
  const { value: existing, sha } = await readJson(ctx, path, null);
  if (!existing || typeof existing !== 'object') {
    return deny(`Intuition pack not found: ${packId}`);
  }
  const agents = Array.isArray(existing.agents) ? existing.agents : [];
  if (agents.length && !agents.includes(ctx.agentSlug) && !agents.includes('*')) {
    return deny(`Agent ${ctx.agentSlug} does not own intuition pack ${packId}`);
  }
  const patched = applyIntuitionEdit(existing, {
    id: packId,
    summary: input.summary,
    guidance: input.guidance
  });
  if (!patched) return deny('Invalid intuition edit');
  if (typeof input.guidance === 'string' && input.guidance.trim()) {
    patched.guidance = input.guidance.trim();
  }
  if (typeof input.summary === 'string' && input.summary.trim()) {
    patched.summary = input.summary.trim();
  }
  patched.updated_at = new Date().toISOString();
  patched.updated_by = ctx.agentSlug;
  patched.last_edit_reason = reason;
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(patched),
    `intuition: edit ${packId}`,
    sha
  );
  return ok(`Updated intuition pack ${packId}`, { path, pack_id: packId, reason });
}

async function handleOsPromoteShortcut(ctx, input) {
  const proposedId = String(input.proposed_id || '').trim();
  const summary = String(input.summary || '').trim();
  const exampleIntent = String(input.example_intent || '').trim();
  if (!proposedId || !summary || !exampleIntent) {
    return deny('proposed_id, summary, and example_intent are required');
  }
  if (!/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/.test(proposedId)) {
    return deny('proposed_id must look like area.name (e.g. track.morning-weigh-in)');
  }
  const toolName = String(input.tool_name || proposedId.replace(/\./g, '_').replace(/-/g, '_'));
  const risk = input.risk === 'auto' ? 'auto' : 'confirm';
  const id = newId('promo');
  const path = `${OS_DIR}/promoted-shortcuts/${slugify(proposedId)}.json`;
  const body = {
    id,
    proposed_id: proposedId,
    tool_name: toolName,
    summary,
    example_intent: exampleIntent,
    example_writes: Array.isArray(input.example_writes) ? input.example_writes : [],
    risk,
    status: 'pending_adam',
    proposed_by: ctx.agentSlug,
    created_at: new Date().toISOString(),
    note: 'Draft only — does not mutate capabilities/registry until Adam confirms and a follow-up lands the live def.'
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Promote shortcut: ${proposedId}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `${proposedId} (${risk}) — ${summary}`
      }]
    })
  );
}


export async function executeShortcut(toolName, input, ctx) {
  if (!shortcutSchemas()[toolName]) return deny(`Unknown shortcut: ${toolName}`);
  try {
    switch (toolName) {
      case 'remember_set_week_flag':
        return await handleRememberSetWeekFlag(ctx, input);
      case 'remember_note_context':
        return await handleRememberNoteContext(ctx, input);
      case 'track_open_challenge':
        return await handleTrackOpenChallenge(ctx, input);
      case 'track_log_progress':
        return await handleTrackLogProgress(ctx, input);
      case 'track_close_challenge':
        return await handleTrackCloseChallenge(ctx, input);
      case 'coordinate_request_cn_write':
        return await handleCoordinateRequestCnWrite(ctx, input);
      case 'research_save_brief':
        return await handleResearchSaveBrief(ctx, input);
      case 'research_expiring_brief':
        return await handleResearchExpiringBrief(ctx, input);
      case 'publish_surface_widget':
        return await handlePublishSurfaceWidget(ctx, input);
      case 'plan_week_meals':
        return await handlePlanWeekMeals(ctx, input);
      case 'lookup_food_brand_au':
        return await handleLookupFoodBrandAu(ctx, input);
      case 'os_capability_scoreboard':
        return await handleOsCapabilityScoreboard(ctx, input);
      case 'intuition_edit_pack':
        return await handleIntuitionEditPack(ctx, input);
      case 'os_promote_shortcut':
        return await handleOsPromoteShortcut(ctx, input);
      default:
        return deny(`Unhandled shortcut: ${toolName}`);
    }
  } catch (err) {
    return deny(err?.message || String(err));
  }
}

export {
  CHALLENGES_DIR,
  RESEARCH_DIR,
  REMEMBER_WEEK_FLAGS_PATH,
  REMEMBER_CONTEXT_NOTES_PATH,
  CN_LOANS_PATH,
  WIDGETS_DIR,
  OS_DIR
};
