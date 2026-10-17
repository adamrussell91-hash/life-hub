import {
  createAccordionEditor,
  createAnnotationEditor,
  createAnthologyEditor,
  createAttachmentEditor,
  createAudioEditor,
  createBlockEditor,
  createCalloutEditor,
  createChartEditor,
  createClozeEditor,
  createCodeEditor,
  createAnthologyEditor,
  createCollectionEditor,
  createConceptMapEditor,
  createDefinitionEditor,
  createDiagramEditor,
  createDividerEditor,
  createEmbedEditor,
  createEquationEditor,
  createFlashcardsEditor,
  createGalleryEditor,
  createHeadingEditor,
  createHtmlAppEditor,
  createHtmlEditor,
  createImageEditor,
  createMindMapEditor,
  createOutcomesEditor,
  createQuestionSetEditor,
  createQuoteEditor,
  createRichTextEditor,
  createSelfCheckEditor,
  createTableEditor,
  createCardStackEditor,
  createTimelineEditor,
  createVideoEditor,
  createWhiteboardEditor,
  type BlockChangeHandler,
  type BlockEditorContext
} from '@/blocks/editors';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor,
  createTabsEditor
} from '@/blocks/layout-editors';
import {
  renderAccordionBlock,
  renderAnnotationBlock,
  renderAttachmentBlock,
  renderAudioBlock,
  renderBlock,
  renderCalloutBlock,
  renderChartBlock,
  renderClozeBlock,
  renderCodeBlock,
  renderAnthologyBlock,
  renderCollectionBlock,
  renderColumnsBlock,
  renderConceptMapBlock,
  renderDefinitionBlock,
  renderDiagramBlock,
  renderDividerBlock,
  renderEmbedBlock,
  renderEquationBlock,
  renderFlashcardsBlock,
  renderGalleryBlock,
  renderHeadingBlock,
  renderHtmlAppBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderMindMapBlock,
  renderOutcomesBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderRichTextBlock,
  renderSelfCheckBlock,
  renderSectionBlock,
  renderSpacerBlock,
  renderTableBlock,
  renderCardStackBlock,
  renderTimelineBlock,
  renderTabsBlock,
  renderVideoBlock,
  renderWhiteboardBlock,
  type RenderMode
} from '@/blocks/render';
import type { Block } from '@/schemas/block';
import {
  createAnalogyLadderEditor,
  createAnalogyLevelEditor,
  createConceptFeaturesEditor,
  createQuestionQuadrantEditor,
  createTeacherNoteBlockEditor,
  createThinkingIntentionsEditor,
  createThinkingMoveEditor,
  createThinkingReflectionEditor,
  createToolkitSkillEditor,
  createToolkitToolEditor,
  createToolkitValueEditor
} from '@/toolkit/editors';

type BlockByType = {
  [K in Block['block_type']]: Extract<Block, { block_type: K }>;
};

export interface BlockRegistryEntry<T extends Block = Block> {
  render: (block: T, mode: RenderMode) => HTMLElement;
  createEditor: (block: T, onChange: (block: T) => void) => HTMLElement;
}

export const blockRegistry: {
  [K in Block['block_type']]: BlockRegistryEntry<BlockByType[K]>;
} = {
  rich_text: {
    render: renderRichTextBlock,
    createEditor: createRichTextEditor
  },
  heading: {
    render: renderHeadingBlock,
    createEditor: createHeadingEditor
  },
  callout: {
    render: renderCalloutBlock,
    createEditor: createCalloutEditor
  },
  image: {
    render: renderImageBlock,
    createEditor: createImageEditor
  },
  gallery: {
    render: renderGalleryBlock,
    createEditor: createGalleryEditor
  },
  video: {
    render: renderVideoBlock,
    createEditor: createVideoEditor
  },
  embed: {
    render: renderEmbedBlock,
    createEditor: createEmbedEditor
  },
  html: {
    render: renderHtmlBlock,
    createEditor: createHtmlEditor
  },
  html_app: {
    render: (block, mode) => renderHtmlAppBlock(block, mode, {}),
    createEditor: createHtmlAppEditor
  },
  quote: {
    render: renderQuoteBlock,
    createEditor: createQuoteEditor
  },
  divider: {
    render: renderDividerBlock,
    createEditor: createDividerEditor
  },
  definition: {
    render: renderDefinitionBlock,
    createEditor: createDefinitionEditor
  },
  code: {
    render: renderCodeBlock,
    createEditor: createCodeEditor
  },
  columns: {
    render: renderColumnsBlock,
    createEditor: createColumnsEditor
  },
  audio: {
    render: renderAudioBlock,
    createEditor: createAudioEditor
  },
  attachment: {
    render: renderAttachmentBlock,
    createEditor: createAttachmentEditor
  },
  accordion: {
    render: renderAccordionBlock,
    createEditor: createAccordionEditor
  },
  table: {
    render: renderTableBlock,
    createEditor: createTableEditor
  },
  question_set: {
    render: renderQuestionSetBlock,
    createEditor: createQuestionSetEditor
  },
  flashcards: {
    render: renderFlashcardsBlock,
    createEditor: createFlashcardsEditor
  },
  cloze: {
    render: renderClozeBlock,
    createEditor: createClozeEditor
  },
  self_check: {
    render: renderSelfCheckBlock,
    createEditor: createSelfCheckEditor
  },
  timeline: {
    render: renderTimelineBlock,
    createEditor: createTimelineEditor
  },
  card_stack: {
    render: renderCardStackBlock,
    createEditor: createCardStackEditor
  },
  collection: {
    render: renderCollectionBlock,
    createEditor: createCollectionEditor
  },
  anthology: {
    render: (block, mode) => renderAnthologyBlock(block, mode, {}),
    createEditor: createAnthologyEditor
  },
  outcomes: {
    render: renderOutcomesBlock,
    createEditor: createOutcomesEditor
  },
  section: {
    render: renderSectionBlock,
    createEditor: createSectionEditor
  },
  spacer: {
    render: renderSpacerBlock,
    createEditor: createSpacerEditor
  },
  tabs: {
    render: renderTabsBlock,
    createEditor: createTabsEditor
  },
  chart: {
    render: renderChartBlock,
    createEditor: createChartEditor
  },
  equation: {
    render: renderEquationBlock,
    createEditor: createEquationEditor
  },
  diagram: {
    render: renderDiagramBlock,
    createEditor: createDiagramEditor
  },
  mind_map: {
    render: renderMindMapBlock,
    createEditor: createMindMapEditor
  },
  concept_map: {
    render: renderConceptMapBlock,
    createEditor: createConceptMapEditor
  },
  whiteboard: {
    render: renderWhiteboardBlock,
    createEditor: createWhiteboardEditor
  },
  annotation: {
    render: renderAnnotationBlock,
    createEditor: createAnnotationEditor
  },
  toolkit_skill: { render: (block, mode) => renderBlock(block, mode), createEditor: createToolkitSkillEditor },
  toolkit_tool: { render: (block, mode) => renderBlock(block, mode), createEditor: createToolkitToolEditor },
  toolkit_value: { render: (block, mode) => renderBlock(block, mode), createEditor: createToolkitValueEditor },
  thinking_move: { render: (block, mode) => renderBlock(block, mode), createEditor: createThinkingMoveEditor },
  question_quadrant: {
    render: (block, mode) => renderBlock(block, mode),
    createEditor: createQuestionQuadrantEditor
  },
  concept_features: {
    render: (block, mode) => renderBlock(block, mode),
    createEditor: createConceptFeaturesEditor
  },
  thinking_intentions: {
    render: (block, mode) => renderBlock(block, mode),
    createEditor: createThinkingIntentionsEditor
  },
  thinking_reflection: {
    render: (block, mode) => renderBlock(block, mode),
    createEditor: createThinkingReflectionEditor
  },
  analogy_level: { render: (block, mode) => renderBlock(block, mode), createEditor: createAnalogyLevelEditor },
  analogy_ladder: { render: (block, mode) => renderBlock(block, mode), createEditor: createAnalogyLadderEditor },
  teacher_note: { render: (block, mode) => renderBlock(block, mode), createEditor: createTeacherNoteBlockEditor }
};

export {
  createAccordionEditor,
  createAnnotationEditor,
  createAnthologyEditor,
  createAttachmentEditor,
  createAudioEditor,
  createBlockEditor,
  createCalloutEditor,
  createChartEditor,
  createClozeEditor,
  createCodeEditor,
  createCollectionEditor,
  createColumnsEditor,
  createConceptMapEditor,
  createDefinitionEditor,
  createDiagramEditor,
  createDividerEditor,
  createEmbedEditor,
  createEquationEditor,
  createFlashcardsEditor,
  createGalleryEditor,
  createHeadingEditor,
  createHtmlAppEditor,
  createHtmlEditor,
  createImageEditor,
  createMindMapEditor,
  createQuestionSetEditor,
  createQuoteEditor,
  createRichTextEditor,
  createSelfCheckEditor,
  createSectionEditor,
  createSpacerEditor,
  createTableEditor,
  createCardStackEditor,
  createTimelineEditor,
  createTabsEditor,
  createVideoEditor,
  createWhiteboardEditor,
  renderAccordionBlock,
  renderAnnotationBlock,
  renderAttachmentBlock,
  renderAudioBlock,
  renderBlock,
  renderCalloutBlock,
  renderChartBlock,
  renderClozeBlock,
  renderCodeBlock,
  renderCollectionBlock,
  renderColumnsBlock,
  renderConceptMapBlock,
  renderDefinitionBlock,
  renderDiagramBlock,
  renderDividerBlock,
  renderEmbedBlock,
  renderEquationBlock,
  renderFlashcardsBlock,
  renderGalleryBlock,
  renderHeadingBlock,
  renderHtmlAppBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderMindMapBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderRichTextBlock,
  renderSelfCheckBlock,
  renderSectionBlock,
  renderSpacerBlock,
  renderTableBlock,
  renderCardStackBlock,
  renderTimelineBlock,
  renderTabsBlock,
  renderVideoBlock,
  renderWhiteboardBlock
};

export type { BlockChangeHandler, BlockEditorContext, RenderMode };
