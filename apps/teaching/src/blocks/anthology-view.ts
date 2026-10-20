import type { AnthologyData, AnthologyItem, AnthologyText } from '@/blocks/anthology-collect';
import { foldRows } from '@/blocks/annotation-thread';
import { lessonCollectionHref } from '@/blocks/collection-resolve';
import {
  FAMILY_PALETTE,
  loadLiteraryElements,
  lookupTechnique,
  type LiteraryElementsTable
} from '@/blocks/literary-elements';
import type { AnnotationBlock, AnnotationFamilyKey, AnthologyView, Block } from '@/schemas/block';

export type AnthologyViewMode = 'teacher' | 'student' | 'print';

export type BuildAnthologyViewOptions = {
  data: AnthologyData;
  mode: AnthologyViewMode;
  defaultView?: AnthologyView;
  title?: string;
  textBlocks?: Map<string, AnnotationBlock>;
  onMakeCards?: (request: { items: AnthologyItem[]; view: AnthologyView }) => void;
};

const VIEW_LABELS: Record<AnthologyView, string> = {
  text: 'By text',
  theme: 'By theme',
  technique: 'By technique',
  connections: 'Connections'
};

const FAMILY_ORDER: AnnotationFamilyKey[] = [
  'Descriptive',
  'Repetitive',
  'Comparative',
  'Structural',
  'Intertextual'
];

function noteHref(lessonId: string, annotationId: string): string {
  return `${lessonCollectionHref(lessonId)}#note=${encodeURIComponent(annotationId)}`;
}

function fingerprintWords(fp: AnthologyText['fingerprint']): string {
  const parts: string[] = [];
  for (const family of FAMILY_ORDER) {
    const n = fp[family];
    if (n && n > 0) parts.push(`${family} ${n}`);
  }
  return parts.join(', ') || 'No techniques tagged';
}

function allThemes(items: AnthologyItem[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const t of item.themes) {
      const key = t.toLowerCase();
      if (!seen.has(key)) seen.set(key, t);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function itemsForTheme(items: AnthologyItem[], theme: string): AnthologyItem[] {
  const key = theme.toLowerCase();
  return items.filter((item) => item.themes.some((t) => t.toLowerCase() === key));
}

export type AnthologyConnection = {
  kind: 'theme' | 'concept' | 'technique';
  key: string;
  label: string;
  items: AnthologyItem[];
};

export function anthologyConnections(items: AnthologyItem[]): AnthologyConnection[] {
  type Bucket = { kind: AnthologyConnection['kind']; label: string; items: AnthologyItem[] };
  const buckets = new Map<string, Bucket>();
  const add = (kind: AnthologyConnection['kind'], key: string, label: string, item: AnthologyItem) => {
    const id = `${kind}:${key.toLowerCase()}`;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { kind, label, items: [] };
      buckets.set(id, bucket);
    }
    bucket.items.push(item);
  };
  for (const item of items) {
    for (const theme of item.themes) add('theme', theme, theme, item);
    for (const concept of item.concepts) add('concept', concept, concept, item);
    if (item.technique_id) add('technique', item.technique_id, item.technique_id, item);
  }
  const out: AnthologyConnection[] = [];
  for (const [id, bucket] of buckets) {
    if (new Set(bucket.items.map((i) => i.block_id)).size < 2) continue;
    out.push({
      kind: bucket.kind,
      key: id.slice(id.indexOf(':') + 1),
      label: bucket.label,
      items: bucket.items
    });
  }
  out.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  return out;
}

function emptyMessage(): string {
  return 'Tick Add to unit anthology on a note in any lesson of this unit.';
}

function appendItemLink(host: HTMLElement, item: AnthologyItem, mode: AnthologyViewMode): void {
  const row = document.createElement('div');
  row.className = 'block-anthology__item';
  const link = document.createElement('a');
  link.className = 'block-anthology__item-link';
  link.href = noteHref(item.lesson_id, item.annotation_id);
  const quote = document.createElement('span');
  quote.className = 'block-anthology__quote';
  quote.textContent =
    item.line_number > 0 ? `l.${item.line_number} “${item.quote}”` : `“${item.quote}”`;
  quote.title = item.quote;
  const meta = document.createElement('span');
  meta.className = 'block-anthology__meta';
  meta.textContent = item.lesson_title;
  link.append(quote, meta);
  row.append(link);
  if (mode === 'teacher' && item.published === false) {
    const tag = document.createElement('span');
    tag.className = 'block-anthology__unpublished';
    tag.textContent = 'Not published';
    row.append(tag);
  }
  host.append(row);
}

export function buildAnthologyView(
  block: Extract<Block, { block_type: 'anthology' }>,
  options: BuildAnthologyViewOptions
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-anthology';
  root.dataset.blockId = block.id;

  const titleText = options.title ?? block.content.title;
  if (titleText?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-anthology__title block-title';
    title.textContent = titleText.trim();
    root.append(title);
  }

  let view: AnthologyView = options.defaultView ?? block.content.default_view ?? 'text';
  let theme: string | null = null;
  let table: LiteraryElementsTable | null = null;

  const pills = document.createElement('div');
  pills.className = 'hub-pills block-anthology__views';
  pills.setAttribute('role', 'toolbar');
  pills.setAttribute('aria-label', 'Anthology views');

  const body = document.createElement('div');
  body.className = 'block-anthology__body';

  const makeCardsBtn = document.createElement('button');
  makeCardsBtn.type = 'button';
  makeCardsBtn.className = 'btn btn--secondary block-anthology__make-cards';
  makeCardsBtn.textContent = 'Make cards from this view';
  makeCardsBtn.hidden = true;

  const paintPills = () => {
    pills.replaceChildren();
    for (const key of Object.keys(VIEW_LABELS) as AnthologyView[]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = VIEW_LABELS[key];
      btn.setAttribute('aria-pressed', key === view ? 'true' : 'false');
      btn.addEventListener('click', () => {
        view = key;
        paint();
      });
      pills.append(btn);
    }
  };

  const paintText = () => {
    if (options.data.texts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-anthology__empty block-empty';
      empty.textContent = emptyMessage();
      body.append(empty);
      return;
    }
    for (const text of options.data.texts) {
      const card = document.createElement('article');
      card.className = 'block-anthology__text-card';
      const title = document.createElement('h4');
      title.className = 'block-anthology__text-title block-subtitle';
      const titleLink = document.createElement('a');
      titleLink.href = lessonCollectionHref(text.lesson_id);
      titleLink.textContent = text.title;
      title.append(titleLink);
      card.append(title);
      if (text.attribution) {
        const attr = document.createElement('p');
        attr.className = 'block-anthology__attribution';
        attr.textContent = text.attribution;
        card.append(attr);
      }
      const strip = document.createElement('div');
      strip.className = 'block-anthology__fingerprint';
      strip.setAttribute('aria-label', fingerprintWords(text.fingerprint));
      for (const family of FAMILY_ORDER) {
        const n = text.fingerprint[family] ?? 0;
        if (n <= 0) continue;
        const cell = document.createElement('span');
        cell.className = `block-anthology__fp-cell block-anthology__fp-cell--${FAMILY_PALETTE[family]}`;
        cell.title = `${family} ${n}`;
        cell.textContent = String(n);
        strip.append(cell);
      }
      const words = document.createElement('p');
      words.className = 'block-anthology__fingerprint-words';
      words.textContent = fingerprintWords(text.fingerprint);
      card.append(strip, words);
      if (options.mode === 'teacher' && text.published === false) {
        const tag = document.createElement('span');
        tag.className = 'block-anthology__unpublished';
        tag.textContent = 'Not published';
        card.append(tag);
      }
      body.append(card);
    }
  };

  const paintTheme = () => {
    const themes = allThemes(options.data.items);
    if (themes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-anthology__empty block-empty';
      empty.textContent = emptyMessage();
      body.append(empty);
      return;
    }
    const themePills = document.createElement('div');
    themePills.className = 'hub-pills block-anthology__theme-pills';
    const active = theme && themes.includes(theme) ? theme : themes[0]!;
    for (const name of themes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = name;
      btn.title = name;
      btn.setAttribute('aria-pressed', name === active ? 'true' : 'false');
      btn.addEventListener('click', () => {
        theme = name;
        paint();
      });
      themePills.append(btn);
    }
    body.append(themePills);

    const themed = itemsForTheme(options.data.items, active);
    const byBlock = new Map<string, AnthologyItem[]>();
    for (const item of themed) {
      const list = byBlock.get(item.block_id) ?? [];
      list.push(item);
      byBlock.set(item.block_id, list);
    }

    for (const text of options.data.texts) {
      const group = byBlock.get(text.block_id);
      if (!group?.length) continue;
      const section = document.createElement('section');
      section.className = 'block-anthology__theme-text';
      const heading = document.createElement('h4');
      heading.className = 'block-anthology__text-title block-subtitle';
      heading.textContent = text.title;
      section.append(heading);

      const poem =
        options.textBlocks?.get(text.block_id)?.content.text ??
        (text.text_included ? text.poem : undefined);
      if (poem && text.text_included) {
        const fromBlocks = options.textBlocks?.get(text.block_id);
        const stopLines = new Set(
          group
            .map((item) => {
              if (fromBlocks) {
                const ann = fromBlocks.content.annotations.find(
                  (a) => a.id === item.annotation_id
                );
                return ann && 'line' in ann.anchor ? ann.anchor.line : undefined;
              }
              return text.stop_lines?.[item.annotation_id];
            })
            .filter((id): id is string => typeof id === 'string')
        );
        const rows = foldRows(poem, stopLines, {
          context: 0,
          expanded: new Set()
        });
        const foldHost = document.createElement('div');
        foldHost.className = 'block-anthology__fold';
        for (const row of rows) {
          if (row.kind === 'fold') {
            const bar = document.createElement('button');
            bar.type = 'button';
            bar.className = 'block-anthology__fold-bar';
            bar.textContent = `⋯ ${row.count} lines`;
            bar.setAttribute('aria-expanded', 'false');
            bar.addEventListener('click', () => {
              const open = bar.getAttribute('aria-expanded') === 'true';
              bar.setAttribute('aria-expanded', open ? 'false' : 'true');
              if (!open) {
                for (const lineId of row.lineIds) {
                  const line = poem.stanzas
                    .flatMap((s) => s.lines)
                    .find((l) => l.id === lineId);
                  if (!line) continue;
                  const p = document.createElement('p');
                  p.className = 'block-anthology__fold-line';
                  p.dataset.foldId = row.id;
                  p.textContent = line.text;
                  bar.after(p);
                }
              } else {
                foldHost.querySelectorAll(`[data-fold-id="${row.id}"]`).forEach((el) => el.remove());
              }
            });
            foldHost.append(bar);
          } else {
            const line = poem.stanzas
              .flatMap((s) => s.lines)
              .find((l) => l.id === row.lineId);
            const p = document.createElement('p');
            p.className = 'block-anthology__fold-line';
            p.textContent = `${row.number} ${line?.text ?? ''}`;
            foldHost.append(p);
          }
        }
        section.append(foldHost);
      } else {
        const staticBar = document.createElement('p');
        staticBar.className = 'block-anthology__fold-static';
        staticBar.textContent = `⋯ ${Math.max(group.length, 1)} lines`;
        section.append(staticBar);
      }

      for (const item of group) appendItemLink(section, item, options.mode);
      body.append(section);
    }
  };

  const paintTechnique = () => {
    const grouped = new Map<string, AnthologyItem[]>();
    for (const item of options.data.items) {
      if (!item.technique_id) continue;
      const list = grouped.get(item.technique_id) ?? [];
      list.push(item);
      grouped.set(item.technique_id, list);
    }
    if (grouped.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-anthology__empty block-empty';
      empty.textContent = emptyMessage();
      body.append(empty);
      return;
    }
    const entries = [...grouped.entries()].map(([id, items]) => {
      const tech = table ? lookupTechnique(table, id) : undefined;
      const family =
        table && tech
          ? table.subgroups.find((sg) => sg.id === tech.subgroup)?.family
          : undefined;
      return {
        id,
        items,
        name: tech?.name ?? id,
        family: (family ?? 'Structural') as AnnotationFamilyKey,
        definition: tech?.definition ?? ''
      };
    });
    entries.sort(
      (a, b) =>
        FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) ||
        a.name.localeCompare(b.name)
    );
    let lastFamily = '';
    for (const entry of entries) {
      if (entry.family !== lastFamily) {
        lastFamily = entry.family;
        const fam = document.createElement('h4');
        fam.className = 'block-anthology__family';
        fam.textContent = entry.family;
        body.append(fam);
      }
      const section = document.createElement('section');
      section.className = 'block-anthology__technique';
      const heading = document.createElement('h5');
      heading.className = 'block-anthology__technique-name';
      heading.textContent = entry.name;
      heading.title = entry.name;
      section.append(heading);
      if (entry.definition) {
        const def = document.createElement('p');
        def.className = 'block-anthology__technique-def';
        def.textContent = entry.definition;
        section.append(def);
      }
      for (const item of entry.items) appendItemLink(section, item, options.mode);
      body.append(section);
    }
  };

  const paintConnections = () => {
    const connections = anthologyConnections(options.data.items);
    if (connections.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-anthology__empty block-empty';
      empty.textContent =
        'Shared themes, concepts or techniques across two or more texts will appear here.';
      body.append(empty);
      return;
    }
    for (const conn of connections) {
      const section = document.createElement('section');
      section.className = 'block-anthology__connection';
      const heading = document.createElement('h4');
      heading.className = 'block-anthology__connection-title';
      let label = conn.label;
      if (conn.kind === 'technique' && table) {
        label = lookupTechnique(table, conn.key)?.name ?? conn.label;
      }
      heading.textContent = `${conn.kind}: ${label}`;
      section.append(heading);
      const texts = [...new Set(conn.items.map((i) => i.lesson_title))];
      const list = document.createElement('p');
      list.className = 'block-anthology__connection-texts';
      list.textContent = texts.join(' · ');
      section.append(list);
      for (const item of conn.items) appendItemLink(section, item, options.mode);
      body.append(section);
    }
  };

  const paint = () => {
    paintPills();
    body.replaceChildren();
    if (options.mode === 'print' || view === 'text') paintText();
    else if (view === 'theme') paintTheme();
    else if (view === 'technique') paintTechnique();
    else paintConnections();

    const canMake =
      options.mode === 'teacher' &&
      Boolean(options.onMakeCards) &&
      (view === 'theme' || view === 'technique');
    makeCardsBtn.hidden = !canMake;
  };

  makeCardsBtn.addEventListener('click', () => {
    if (!options.onMakeCards) return;
    let items = options.data.items;
    if (view === 'theme') {
      const themes = allThemes(items);
      const active = theme && themes.includes(theme) ? theme : themes[0];
      items = active ? itemsForTheme(items, active) : [];
    } else if (view === 'technique') {
      items = items.filter((item) => Boolean(item.technique_id));
    }
    options.onMakeCards({ items, view });
  });

  if (options.mode === 'print') {
    paintText();
    root.append(body);
    return root;
  }

  root.append(pills, body, makeCardsBtn);
  paint();
  void loadLiteraryElements().then((loaded) => {
    table = loaded;
    if (view === 'technique' || view === 'connections') paint();
  });
  return root;
}
