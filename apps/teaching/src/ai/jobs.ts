import { z } from 'zod';
import type { ArchivePull } from '@/ai/archiveKernel';
import type { AiProposal, AiScope } from '@/ai/proposals';
import { AiChatRequestSchema, parseToolProposal } from '@/ai/proposals';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import type { SearchPack } from '@/ai/search-pack';
import { validateMutatingProposal } from '@/ai/validate-proposal';

export const AiJobAgentSchema = z.enum(['clementine', 'ann', 'hammond', 'clare']);
export const AiJobStatusSchema = z.enum(['working', 'done', 'error']);

export const AiJobCreateSchema = AiChatRequestSchema;

export const AiJobPatchSchema = z.object({
  resolution: z.enum(['accepted', 'rejected', 'dismissed'])
});

export type AiJobCreate = z.infer<typeof AiJobCreateSchema>;
export type AiJobPatch = z.infer<typeof AiJobPatchSchema>;

export type AiTranscriptTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiJob = {
  id: string;
  lesson_id: string;
  agent: z.infer<typeof AiJobAgentSchema>;
  status: z.infer<typeof AiJobStatusSchema>;
  snapshot_at: string;
  message: string;
  scope?: AiScope;
  selected_block_id?: string;
  protocol_id?: string;
  action?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  phase?: 'queued' | 'searching' | 'writing';
  response?: string;
  proposal?: AiProposal;
  error?: string;
  archiveFailed?: boolean;
  created_at: string;
  resolution?: 'accepted' | 'rejected' | 'dismissed';
};

export type KernelJobPayload = {
  query: string;
  lesson: unknown;
  transcript: AiTranscriptTurn[];
  archive: {
    findings: ArchivePull['findings'];
    archiveFailed: boolean;
    note: string;
  };
  findings: ArchivePull['findings'];
  archiveFailed: boolean;
  searchPack: SearchPack;
  blockRecipes: string;
};

export function buildKernelJobPayload(input: {
  query: string;
  lesson: unknown;
  transcript: AiTranscriptTurn[];
  archive?: ArchivePull | null;
  searchPack: SearchPack;
}): KernelJobPayload {
  const findings = input.archive?.findings ?? [];
  const archiveFailed = Boolean(input.archive?.archiveFailed);
  const note = input.archive?.note ?? '';
  return {
    query: input.query,
    lesson: input.lesson,
    transcript: input.transcript,
    findings,
    archiveFailed,
    searchPack: input.searchPack,
    blockRecipes: BLOCK_BUILD_RECIPES,
    archive: {
      findings,
      archiveFailed,
      note
    }
  };
}

export function fixtureReplaceLessonProposal(): AiProposal {
  const now = new Date().toISOString();
  return {
    kind: 'replace_lesson',
    blocks: [
      {
        id: 'mock-ai-heading',
        type: 'block',
        block_type: 'heading',
        variant: 'page',
        visibility: 'student_teacher',
        content: { text: 'Heading' },
        layout: {},
        print: {},
        settings: {},
        created_at: now,
        updated_at: now,
        schema_version: 1
      }
    ]
  };
}

export function appendTranscriptTurns(
  existing: AiTranscriptTurn[] | null | undefined,
  turns: AiTranscriptTurn[],
  max = 50
): AiTranscriptTurn[] {
  const prior = Array.isArray(existing) ? existing : [];
  return [...prior, ...turns].slice(-max);
}

export const AI_JOB_STALE_MS = 10 * 60 * 1000;

export type KernelOutcome =
  | { kind: 'missing' }
  | { kind: 'failed'; error: string }
  | { kind: 'ok'; proposal: AiProposal };

export type ClassifyKernelInput = {
  secret?: string | null;
  status?: number;
  payload?: unknown;
  networkError?: boolean;
  invalidJson?: boolean;
  searchPack: SearchPack;
};

export function classifyKernelResponse(input: ClassifyKernelInput): KernelOutcome {
  if (!input.secret) return { kind: 'missing' };
  if (input.networkError) return { kind: 'failed', error: 'Kernel request failed' };
  if (input.status === 404) return { kind: 'missing' };
  if (input.status !== undefined && input.status !== 200) {
    return { kind: 'failed', error: `Kernel returned HTTP ${input.status}` };
  }
  if (input.invalidJson) return { kind: 'failed', error: 'Kernel returned invalid JSON' };
  const proposal = proposalFromKernelPayload(input.payload, input.searchPack);
  if (!proposal) return { kind: 'failed', error: 'Kernel returned an invalid proposal' };
  return { kind: 'ok', proposal };
}

export function applyKernelOutcome(job: AiJob, outcome: KernelOutcome): AiJob {
  if (outcome.kind === 'missing') {
    return { ...job, status: 'done', proposal: fixtureReplaceLessonProposal() };
  }
  if (outcome.kind === 'failed') {
    const { proposal: _unused, ...rest } = job;
    return { ...rest, status: 'error', error: outcome.error };
  }
  return { ...job, status: 'done', proposal: outcome.proposal };
}

export function isStaleWorkingJob(job: AiJob, now = Date.now()): boolean {
  if (job.status !== 'working') return false;
  const created = Date.parse(job.created_at);
  if (Number.isNaN(created)) return false;
  return now - created > AI_JOB_STALE_MS;
}

export function staleWorkingJobError(job: AiJob, now = Date.now()): AiJob | null {
  if (!isStaleWorkingJob(job, now)) return null;
  const { proposal: _unused, ...rest } = job;
  return { ...rest, status: 'error', error: 'Job timed out after 10 minutes' };
}

const KERNEL_PROPOSAL_TO_TOOL = {
  replace_block: 'propose_replace_block',
  replace_section: 'propose_replace_section',
  replace_lesson: 'propose_replace_lesson',
  insert_blocks: 'propose_insert_blocks',
  delete_blocks: 'propose_delete_blocks',
  reorder_blocks: 'propose_reorder_blocks',
  review_only: 'review_only'
} as const;

export function proposalFromKernelPayload(
  payload: unknown,
  searchPack: SearchPack
): AiProposal | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const candidate = (raw.proposal ?? raw) as Record<string, unknown>;
  if (!candidate || typeof candidate !== 'object') return null;
  const kind = candidate.kind ?? 'replace_lesson';
  if (typeof kind !== 'string' || !(kind in KERNEL_PROPOSAL_TO_TOOL)) return null;
  const { kind: _kind, ...toolInput } = candidate;
  const parsed = parseToolProposal(
    KERNEL_PROPOSAL_TO_TOOL[kind as keyof typeof KERNEL_PROPOSAL_TO_TOOL],
    toolInput
  );
  if ('error' in parsed) return null;
  if (!validateMutatingProposal(parsed, searchPack).ok) return null;
  return parsed;
}
