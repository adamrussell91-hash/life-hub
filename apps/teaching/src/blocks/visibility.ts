import type { Block } from '@/schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;
type TabsBlock = Extract<Block, { block_type: 'tabs' }>;
type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;

function collectTeacherOnlyIds(blocks: Block[] | undefined, out: Set<string>): void {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (block.visibility === 'teacher_only') out.add(block.id);
    if (block.block_type === 'section') {
      collectTeacherOnlyIds(block.content.blocks as Block[], out);
    } else if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        collectTeacherOnlyIds(col.blocks as Block[], out);
      }
    } else if (block.block_type === 'tabs') {
      for (const panel of block.content.tabs) {
        collectTeacherOnlyIds(panel.blocks as Block[], out);
      }
    }
  }
}

/** Drop teacher layers / notes / attachments / draft voice that must never reach students. */
export function stripAnnotationTeacherContent(
  block: AnnotationBlock,
  teacherOnlyIds: Set<string>
): AnnotationBlock {
  const teacherLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === 'teacher').map((layer) => layer.id)
  );
  const annotations = block.content.annotations
    .filter((ann) => !teacherLayerIds.has(ann.layer_id))
    .map((ann) => ({
      ...ann,
      body: {
        ...ann.body,
        attachments: ann.body.attachments.filter(
          (att) => !(att.kind === 'block' && teacherOnlyIds.has(att.block_id))
        )
      }
    }));

  const voice_tracks = (block.content.voice_tracks ?? [])
    .filter((track) => track.status === 'published')
    .map((track) => ({
      ...track,
      transcript: { words: [] as typeof track.transcript.words, timing: track.transcript.timing },
      clips: track.clips.filter((clip) => clip.approved),
      extras: track.extras?.filter((extra) => extra.approved)
    }));

  const voiceLayerIdsWithTracks = new Set(voice_tracks.map((track) => track.layer_id));
  const layers = block.content.layers.filter((layer) => {
    if (layer.kind === 'teacher') return false;
    if (layer.kind === 'voice') return voiceLayerIdsWithTracks.has(layer.id);
    return true;
  });

  return {
    ...block,
    content: {
      ...block.content,
      layers,
      annotations,
      voice_tracks: voice_tracks.length > 0 ? voice_tracks : undefined
    }
  };
}

function filterBlocksForStudentInner(
  blocks: Block[],
  teacherOnlyIds: Set<string>
): Block[] {
  return blocks
    .filter((block) => block.visibility === 'student_teacher')
    .map((block) => {
      if (block.block_type === 'section') {
        return {
          ...block,
          content: {
            ...block.content,
            blocks: filterBlocksForStudentInner(
              block.content.blocks as Block[],
              teacherOnlyIds
            ) as SectionBlock['content']['blocks']
          }
        };
      }
      if (block.block_type === 'columns') {
        return {
          ...block,
          content: {
            ...block.content,
            columns: block.content.columns.map((col) => ({
              ...col,
              blocks: filterBlocksForStudentInner(
                col.blocks as Block[],
                teacherOnlyIds
              ) as ColumnsBlock['content']['columns'][number]['blocks']
            }))
          }
        };
      }
      if (block.block_type === 'tabs') {
        return {
          ...block,
          content: {
            tabs: block.content.tabs.map((panel) => ({
              ...panel,
              blocks: filterBlocksForStudentInner(
                panel.blocks as Block[],
                teacherOnlyIds
              ) as TabsBlock['content']['tabs'][number]['blocks']
            }))
          }
        };
      }
      if (block.block_type === 'annotation') {
        return stripAnnotationTeacherContent(block, teacherOnlyIds);
      }
      if (block.block_type === 'flashcards') {
        return {
          ...block,
          content: {
            ...block.content,
            cards: block.content.cards.map(({ source: _source, ...card }) => card)
          }
        };
      }
      return block;
    });
}

export function filterBlocksForStudent(blocks: Block[]): Block[] {
  const teacherOnlyIds = new Set<string>();
  collectTeacherOnlyIds(blocks, teacherOnlyIds);
  return filterBlocksForStudentInner(blocks, teacherOnlyIds);
}
