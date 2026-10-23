import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  draftLessonKey,
  getJSON,
  publishedLessonKey,
  setJSON
} from './_shared/teaching-blobs.mjs';
import { blobJsonStore, writeCheckpoint } from './_shared/teaching-versions.mjs';
import {
  defaultGetWhiteboardStore,
  getWhiteboardJSON,
  whiteboardKey
} from './_shared/whiteboard-blobs.mjs';
import { attachedOutcomeIds, filterBlocksForStudent, sanitizeBlocksDeep } from './_shared/teaching-student.mjs';
import { materialiseLinkedCompositions } from './_shared/composition-blocks.mjs';
import { prepareQuizPublish, storeQuizKey } from './_shared/quiz.mjs';
import { prepareTutorialPublish, storeTutorialTabs } from './_shared/tutorial.mjs';

export const config = { path: '/api/lessons/:id/publish' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/publish$/);
  return match?.[1] ?? '';
}

function containsWhiteboard(blocks) {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false;
    if (block.block_type === 'whiteboard') return true;
    if (block.block_type === 'section') return containsWhiteboard(block.content?.blocks);
    if (block.block_type === 'columns') {
      return (block.content?.columns ?? []).some((column) => containsWhiteboard(column?.blocks));
    }
    if (block.block_type === 'tabs') {
      return (block.content?.tabs ?? []).some((tab) => containsWhiteboard(tab?.blocks));
    }
    return false;
  });
}

async function materialisePublishedWhiteboards(blocks, store) {
  if (!Array.isArray(blocks)) return [];
  return Promise.all(blocks.map(async (block) => {
    if (!block || typeof block !== 'object') return block;

    if (block.block_type === 'whiteboard') {
      const content = block.content && typeof block.content === 'object'
        ? { ...block.content }
        : {};
      const ids = [content.document_id, content.seed_document_id]
        .filter((id, index, all) => typeof id === 'string' && id && all.indexOf(id) === index);
      let record = null;
      for (const documentId of ids) {
        record = await getWhiteboardJSON(store, whiteboardKey(documentId));
        if (record?.snapshot) break;
      }
      delete content.seed_document_id;
      content.published_snapshot = record?.snapshot ?? null;
      return { ...block, content };
    }

    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: await materialisePublishedWhiteboards(block.content?.blocks, store)
        }
      };
    }

    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: await Promise.all((block.content?.columns ?? []).map(async (column) => ({
            ...column,
            blocks: await materialisePublishedWhiteboards(column?.blocks, store)
          })))
        }
      };
    }

    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: await Promise.all((block.content?.tabs ?? []).map(async (tab) => ({
            ...tab,
            blocks: await materialisePublishedWhiteboards(tab?.blocks, store)
          })))
        }
      };
    }

    return block;
  }));
}

export function createLessonPublishHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const id = readLessonId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    // Strong read: the editor saves just before publishing, and an eventual
    // read can still return the older draft, which would then be published
    // and written back over the teacher's latest changes.
    const draft = await getJSON(store, draftLessonKey(id), { consistency: 'strong' });
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    const unit_id = typeof draft.unit_id === 'string' ? draft.unit_id : '';
    if (!title || !unit_id) {
      return withCors(
        errorResponse(400, 'validation_error', 'Lesson needs a title and unit_id to publish', false),
        request,
        env
      );
    }

    let studentBlocks;
    try {
      const resolved = await materialiseLinkedCompositions(filterBlocksForStudent(draft.blocks, { keepQuizQuestions: true }), store, id);
      studentBlocks = filterBlocksForStudent(resolved, { keepQuizQuestions: true });
    } catch (error) {
      return withCors(errorResponse(
        error.status === 400 ? 400 : 503,
        error.status === 400 ? 'validation_error' : 'composition_load_failed',
        error.status === 400 ? error.message : 'Publish aborted: linked compositions could not be loaded.',
        error.status !== 400
      ), request, env);
    }

    const publishedAt = new Date().toISOString();
    try {
      await writeCheckpoint(blobJsonStore(store), {
        kind: 'lesson',
        parentId: id,
        snapshot: draft,
        reason: 'publish',
        now: publishedAt
      });
    } catch {
      return withCors(
        errorResponse(
          500,
          'checkpoint_failed',
          'Publish aborted: version history checkpoint failed before writing the published snapshot.',
          true
        ),
        request,
        env
      );
    }

    const outcomeIds = attachedOutcomeIds(draft);
    let publishBlocks = studentBlocks;
    if (containsWhiteboard(studentBlocks)) {
      try {
        const whiteboardStore = await (deps.getWhiteboardStore ?? defaultGetWhiteboardStore)(env);
        publishBlocks = await materialisePublishedWhiteboards(studentBlocks, whiteboardStore);
      } catch {
        return withCors(
          errorResponse(
            503,
            'whiteboard_snapshot_failed',
            'Publish aborted: whiteboard content could not be frozen for students.',
            true
          ),
          request,
          env
        );
      }
    }

    // A tutorial: Common is public; tabs and exit-check keys are stored apart (tutorial.mjs).
    if (draft.pedagogical_mode === 'tutorial') {
      const tutorial = prepareTutorialPublish(draft, publishBlocks);
      if (tutorial.problems.length > 0) {
        return withCors(errorResponse(400, 'validation_error', `An exit check question isn’t finished: ${tutorial.problems[0]}`, false), request, env);
      }
      if (tutorial.quiz) await storeQuizKey(store, id, tutorial.quiz);
      await storeTutorialTabs(store, id, { ...tutorial.tabs, groups: tutorial.tabs.groups.map((g) => ({ ...g, blocks: sanitizeBlocksDeep(g.blocks) })) });
      const tutorialSnapshot = {
        lesson_id: id,
        title,
        unit_id,
        blocks: sanitizeBlocksDeep(tutorial.common),
        published_at: publishedAt,
        schema_version: 1,
        ...(draft.cover ? { cover: draft.cover } : {}),
        ...(outcomeIds.length > 0 ? { outcome_ids: outcomeIds } : {}),
        ...(draft.feedback_off === true ? { feedback_off: true } : {}),
        pedagogical_mode: 'tutorial',
        ...(tutorial.quiz ? { quiz: tutorial.quiz.snapshot } : {})
      };
      await setJSON(store, publishedLessonKey(id), tutorialSnapshot);
      await setJSON(store, draftLessonKey(id), { ...draft, published_at: publishedAt, updated_at: publishedAt });
      return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
    }

    // Quiz answers are split off here and stored apart; students only get the questions.
    const quizPublish = prepareQuizPublish(draft, publishBlocks);
    if (quizPublish.problems.length > 0) {
      return withCors(
        errorResponse(400, 'validation_error', `A quiz question isn’t finished: ${quizPublish.problems[0]}`, false),
        request,
        env
      );
    }
    publishBlocks = quizPublish.blocks;
    if (quizPublish.quiz) await storeQuizKey(store, id, quizPublish.quiz);

    const snapshot = {
      lesson_id: id,
      title,
      unit_id,
      blocks: sanitizeBlocksDeep(publishBlocks),
      published_at: publishedAt,
      schema_version: 1,
      ...(draft.cover ? { cover: draft.cover } : {}),
      ...(outcomeIds.length > 0 ? { outcome_ids: outcomeIds } : {}),
      ...(draft.feedback_off === true ? { feedback_off: true } : {}),
      ...(quizPublish.quiz ? { pedagogical_mode: 'quiz', quiz: quizPublish.quiz.snapshot } : {}),
      ...(!quizPublish.quiz && draft.pedagogical_mode === 'lecture' ? { pedagogical_mode: 'lecture' } : {})
    };

    await setJSON(store, publishedLessonKey(id), snapshot);
    await setJSON(store, draftLessonKey(id), {
      ...draft,
      published_at: publishedAt,
      updated_at: publishedAt
    });
    return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
  }, deps);
}

export default createLessonPublishHandler();
