import {
  createAccordionEditor,
  createAttachmentEditor,
  createAudioEditor,
  createBlockEditor,
  createCalloutEditor,
  createChartEditor,
  createClozeEditor,
  createCodeEditor,
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
  createTimelineEditor,
  createVideoEditor,
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
  renderOutcomesBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderRichTextBlock,
  renderSelfCheckBlock,
  renderSectionBlock,
  renderSpacerBlock,
  renderTableBlock,
  renderTimelineBlock,
  renderTabsBlock,
  renderVideoBlock,
  type RenderMode
} from '@/blocks/render';
import type { Block } from '@/schemas/block';

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
  collection: {
    render: renderCollectionBlock,
    createEditor: createCollectionEditor
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
  }
};

export {
  createAccordionEditor,
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
  createTimelineEditor,
  createTabsEditor,
  createVideoEditor,
  renderAccordionBlock,
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
  renderTimelineBlock,
  renderTabsBlock,
  renderVideoBlock
};

export type { BlockChangeHandler, BlockEditorContext, RenderMode };
