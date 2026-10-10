import {
  BLOCK_GROUPS,
  EMBED_INSERT_PRESETS,
  INSERT_MENU_LABEL,
  createFromInsertMenu,
  expandGroupTypesForMenu,
  type InsertMenuValue,
  type NewBlockType
} from '@/blocks/create-block';
import { withAppBase } from '@/app/base-path';
import type { Block } from '@/schemas/block';
import { openHubInsertPicker } from '../../design-kit/js/hub-list.js';

export const INSERT_MENU_DESCRIPTION: Record<InsertMenuValue, string> = {
  rich_text: 'Write formatted paragraphs, lists, and inline links.',
  heading: 'Add a section title or subtitle to structure the page.',
  callout: 'Highlight a tip, warning, or key idea in a styled box.',
  quote: 'Feature a quotation with optional attribution.',
  divider: 'Insert a horizontal rule to separate sections.',
  definition: 'Define a term with its meaning in a glossary-style block.',
  code: 'Show syntax-highlighted source code with optional caption.',
  html: 'Embed custom HTML markup for advanced formatting.',
  html_app: 'Run a small interactive HTML app inside the lesson.',
  image: 'Display a single image with optional caption and alt text.',
  gallery: 'Show multiple images in a swipeable or grid gallery.',
  video: 'Embed a hosted or uploaded video with playback controls.',
  embed: 'Embed external content from a URL or oEmbed provider.',
  audio: 'Add an audio clip students can play inline.',
  attachment: 'Link a downloadable file such as a PDF or worksheet.',
  accordion: 'Collapse and expand sections to reduce visual clutter.',
  table: 'Present rows and columns of structured data.',
  question_set: 'Add multiple-choice or short-answer questions.',
  flashcards: 'Flip cards for vocabulary or quick recall practice.',
  cloze: 'Fill-in-the-blank sentences for guided retrieval.',
  self_check: 'Let students check their own answer against a model.',
  chart: 'Visualise data with bar, line, pie, or other chart types.',
  equation: 'Render mathematical notation with LaTeX-style formatting.',
  diagram: 'Draw flowcharts, labels, or simple vector diagrams.',
  mind_map: 'Branch ideas outward from a central concept node.',
  concept_map: 'Connect concepts with labelled relationships.',
  whiteboard: 'Sketch, annotate, and lay out ideas on a free canvas.',
  columns: 'Place blocks side by side in responsive columns.',
  section: 'Group related blocks inside a titled container.',
  spacer: 'Add vertical whitespace between blocks on the page.',
  timeline: 'Arrange events or steps along a chronological axis.',
  card_stack: 'Step through numbered case-study cards with image and copy.',
  tabs: 'Switch between labelled panels of content.',
  collection: 'Curate a set of related items students browse together.',
  outcomes: 'Show the outcomes tagged on this page as a readable list.',
  'embed:google_maps': 'Embed an interactive Google Map at a location.',
  'embed:google_slides': 'Embed a Google Slides presentation inline.',
  'embed:google_docs': 'Embed a Google Document for reading in place.',
  'embed:pdf': 'Embed a PDF document for inline viewing.'
};

/** Line-art block icons live in `public/assets/blocks/`, under the app base. */
export function blockIconSrc(type: InsertMenuValue): string {
  return withAppBase(`/assets/blocks/${type.replace(':', '-')}.png`);
}

/** The palette entry a block came from (embeds keep their provider preset). */
export function blockInsertValue(block: Block): InsertMenuValue {
  if (block.block_type === 'embed') {
    const provider = (block.content as { provider?: string }).provider;
    const preset = EMBED_INSERT_PRESETS.find((p) => p.provider === provider);
    if (preset) return preset.value;
  }
  return block.block_type as InsertMenuValue;
}

export function blockTypeLabel(block: Block): string {
  return INSERT_MENU_LABEL[blockInsertValue(block)] ?? block.block_type.replace(/_/g, ' ');
}

/** Icon + type name, used on every nested row and the selected page block. */
export function createBlockTypeLabel(block: Block): HTMLElement {
  const value = blockInsertValue(block);
  const wrap = document.createElement('span');
  wrap.className = 'block-type-label';
  const icon = document.createElement('img');
  icon.className = 'block-type-label__icon';
  icon.src = blockIconSrc(value);
  icon.alt = '';
  icon.onerror = () => icon.remove();
  const text = document.createElement('span');
  text.textContent = blockTypeLabel(block);
  wrap.append(icon, text);
  return wrap;
}

function pickerGroups(allowed: readonly NewBlockType[]) {
  return BLOCK_GROUPS.map((group) => ({
    label: group.label,
    options: expandGroupTypesForMenu(group.types.filter((t) => allowed.includes(t))).map((value) => ({
      value,
      label: INSERT_MENU_LABEL[value],
      description: INSERT_MENU_DESCRIPTION[value],
      iconSrc: blockIconSrc(value)
    }))
  })).filter((group) => group.options.length > 0);
}

/** Same searchable picker everywhere a nested list adds a block. */
export function openBlockPicker(
  anchor: HTMLElement,
  allowed: readonly NewBlockType[],
  onPick: (value: InsertMenuValue) => void
): void {
  openHubInsertPicker(anchor, {
    groups: pickerGroups(allowed),
    onPick: (value) => onPick(value as InsertMenuValue)
  });
}

const QUICK_ADD: InsertMenuValue[] = ['rich_text', 'image', 'question_set'];

/** Empty container prompt with one-tap starters and the full picker. */
export function createEmptyBlocksPrompt(options: {
  title: string;
  detail: string;
  allowed: readonly NewBlockType[];
  idFactory: () => string;
  insert: (block: Block) => void;
  pick: (anchor: HTMLElement) => void;
}): HTMLElement {
  const box = document.createElement('div');
  box.className = 'hub-list__empty';
  const copy = document.createElement('p');
  copy.style.margin = '0';
  const strong = document.createElement('strong');
  strong.textContent = options.title;
  copy.append(strong, document.createTextNode(options.detail));
  const quick = document.createElement('div');
  quick.className = 'hub-list__quick';
  for (const value of QUICK_ADD) {
    if (!options.allowed.includes(value as NewBlockType)) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'hub-list__chip';
    const icon = document.createElement('img');
    icon.src = blockIconSrc(value);
    icon.alt = '';
    icon.onerror = () => icon.remove();
    chip.append(icon, document.createTextNode(INSERT_MENU_LABEL[value]));
    chip.addEventListener('click', () => options.insert(createFromInsertMenu(value, options.idFactory())));
    quick.append(chip);
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'hub-list__chip';
  more.textContent = 'More blocks…';
  more.addEventListener('click', () => options.pick(more));
  quick.append(more);
  box.append(copy, quick);
  return box;
}
