import { createBlock, NEW_BLOCK_TYPES } from '@/blocks/create-block';

export const BLOCK_BUILD_RECIPES = `## Block build recipes
Every proposed block must include all required metadata fields: id, type, block_type, variant, visibility, content, layout, print, settings, created_at, updated_at, schema_version:1.

- Prose: rich_text uses content { html }; heading { text }; callout { style, body }; quote { quote }; definition { term, definition }; code { code }. Use divider only as a structural separator.
- Media: image uses { url, alt_text }; gallery uses { layout, items:[{ id, url, alt_text }] }; video uses { provider, external_id }; embed uses { url, provider }; audio uses { url }; attachment uses { url, title }. Write meaningful alt_text. image/video/embed URLs must come from the search pack.
- Activities: question_set uses { questions }; flashcards { cards, shuffle }; cloze { text, case_sensitive }; self_check { mode, prompt, answer }; accordion { items }; table { headers, rows }.
- Visuals: chart uses { chart_type, title, series }; equation { latex }; diagram { source, image_url, image_alt }; timeline { events }. source=image requires a search-pack image_url and image_alt — a caption alone is not enough to publish. If no pack image, omit diagram or use source=svg with real SVG markup.
- mind_map content is { title?, nodes, edges }; nodes: 1–24. Each node needs a valid unique id and meaningful label; parent_id and edges must reference valid node ids. “10 point” means exactly 10 meaningful topic nodes with valid ids/connections.
- concept_map uses labelled concepts in nodes and valid directed relationships in edges; every from/to value must reference an existing node id and relationship labels must be meaningful.
- Layout fields must match the schema exactly: section content { title, blocks }; columns content { preset, columns:[{ width, blocks }] }; tabs content { tabs:[{ id, label, blocks }] }; spacer content { size }. Child blocks belong only in those blocks fields.
- Use html or html_app only when the teacher explicitly asks for HTML. collection is homepage-only and must not appear in lessons.`;

export function buildBlockSchemaExamples(): string {
  const examples = NEW_BLOCK_TYPES.filter((type) => type !== 'collection').map((type) =>
    createBlock(type, `${type}_example`)
  );

  return JSON.stringify(examples, (key, value) =>
    key === 'created_at' || key === 'updated_at' ? '<ISO timestamp>' : value
  );
}
