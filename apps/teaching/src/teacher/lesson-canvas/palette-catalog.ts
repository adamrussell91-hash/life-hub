import {
  HOMEPAGE_BLOCK_GROUPS,
  LESSON_BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  expandGroupTypesForMenu,
  type InsertMenuValue
} from '@/blocks/create-block';

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
  columns: 'Place blocks side by side in responsive columns.',
  section: 'Group related blocks inside a titled container.',
  spacer: 'Add vertical whitespace between blocks on the page.',
  timeline: 'Arrange events or steps along a chronological axis.',
  tabs: 'Switch between labelled panels of content.',
  collection: 'Curate a set of related items students browse together.',
  outcomes: 'Show the outcomes tagged on this page as a readable list.',
  'embed:google_maps': 'Embed an interactive Google Map at a location.',
  'embed:google_slides': 'Embed a Google Slides presentation inline.',
  'embed:google_docs': 'Embed a Google Document for reading in place.',
  'embed:pdf': 'Embed a PDF document for inline viewing.'
};

export function blockIconSrc(type: InsertMenuValue): string {
  return `/assets/blocks/${type.replace(':', '-')}.png`;
}

export type PaletteBlockCard = {
  kind: 'block';
  type: InsertMenuValue;
  title: string;
  description: string;
  iconSrc: string;
};

export type PaletteCompositionCard = {
  kind: 'composition';
  id: string;
  title: string;
};

export type PaletteCard = PaletteBlockCard | PaletteCompositionCard;

export type PaletteFamily = {
  id: string;
  disabled?: boolean;
  cards: PaletteCard[];
};

function familiesFromGroups(
  groups: typeof LESSON_BLOCK_GROUPS
): PaletteFamily[] {
  return groups.map((group) => ({
    id: group.label,
    cards: expandGroupTypesForMenu(group.types).map((type) => ({
      kind: 'block' as const,
      type,
      title: INSERT_MENU_LABEL[type],
      description: INSERT_MENU_DESCRIPTION[type],
      iconSrc: blockIconSrc(type)
    }))
  }));
}

export function homepagePaletteFamilies(): PaletteFamily[] {
  return familiesFromGroups(HOMEPAGE_BLOCK_GROUPS);
}

export function lessonPaletteFamilies(
  compositions: Array<{ id: string; title: string }>
): PaletteFamily[] {
  const families: PaletteFamily[] = familiesFromGroups(LESSON_BLOCK_GROUPS);

  families.push({
    id: 'Compositions',
    disabled: compositions.length === 0,
    cards: compositions.map((composition) => ({
      kind: 'composition' as const,
      id: composition.id,
      title: composition.title
    }))
  });

  return families;
}
