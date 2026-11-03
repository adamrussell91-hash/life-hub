// Built-in starting layouts for a new whiteboard. Each gives students' attention
// a job: sort things into groups, compare two things, or contrast them and say
// why it matters. Plain Excalidraw elements, so the browser and the publish
// functions build the same board without loading the editor.

export const WHITEBOARD_STARTERS = [
  {
    id: 'sort_groups',
    label: 'Sort into groups',
    description: 'Three labelled groups to sort ideas, examples or cards into.'
  },
  {
    id: 'venn',
    label: 'Venn: compare and contrast',
    description: 'Two overlapping circles: A, Both and B.'
  },
  {
    id: 'same_different',
    label: 'Same / Different / So what',
    description: 'Three columns: what is shared, what differs and why it matters.'
  }
];

export const WHITEBOARD_STARTER_IDS = WHITEBOARD_STARTERS.map((starter) => starter.id);

export function isWhiteboardStarterId(value) {
  return typeof value === 'string' && WHITEBOARD_STARTER_IDS.includes(value);
}

const INK = '#1e1e1e';
const MUTED = '#868e96';
const FONT = 5; // Excalifont
const LINE_HEIGHT = 1.25;

function base(id, type, x, y, width, height, seed, extra = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: INK,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce: seed,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra
  };
}

// Excalidraw re-measures text once its font loads; this estimate only has to
// be close enough for the first static picture.
function text(id, value, x, y, fontSize, seed, extra = {}) {
  const lines = value.split('\n');
  const longest = Math.max(...lines.map((line) => line.length));
  const width = Math.ceil(longest * fontSize * 0.55);
  const height = Math.ceil(lines.length * fontSize * LINE_HEIGHT);
  const left = extra.textAlign === 'center' ? x - width / 2 : x;
  return base(id, 'text', left, y, width, height, seed, {
    text: value,
    originalText: value,
    fontSize,
    fontFamily: FONT,
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
    ...extra
  });
}

function box(id, x, y, width, height, seed, extra = {}) {
  return base(id, 'rectangle', x, y, width, height, seed, {
    roundness: { type: 3 },
    ...extra
  });
}

function columns(prefix, title, headings, prompts) {
  const width = 300;
  const gap = 40;
  const top = 80;
  const height = 440;
  const elements = [text(`${prefix}_title`, title, 0, 0, 36, 101)];
  headings.forEach((heading, i) => {
    const x = i * (width + gap);
    elements.push(box(`${prefix}_col${i + 1}`, x, top, width, height, 201 + i));
    elements.push(text(`${prefix}_head${i + 1}`, heading, x + 20, top + 20, 28, 301 + i));
    if (prompts[i]) {
      elements.push(
        text(`${prefix}_hint${i + 1}`, prompts[i], x + 20, top + 64, 18, 401 + i, {
          strokeColor: MUTED
        })
      );
    }
  });
  return elements;
}

function sortGroups() {
  return columns(
    'starter_sort',
    'Sort into groups',
    ['Group 1', 'Group 2', 'Group 3'],
    ['Name this group', 'Name this group', 'Name this group']
  );
}

function sameDifferent() {
  return columns(
    'starter_sds',
    'Same / Different / So what',
    ['Same', 'Different', 'So what?'],
    ['What do they share?', 'Where do they part ways?', 'Why does it matter?']
  );
}

function venn() {
  const size = 420;
  const overlap = 150;
  const top = 80;
  const rightX = size - overlap;
  const midY = top + size / 2;
  return [
    text('starter_venn_title', 'Compare and contrast', 0, 0, 36, 101),
    base('starter_venn_a', 'ellipse', 0, top, size, size, 201, { strokeColor: '#1971c2' }),
    base('starter_venn_b', 'ellipse', rightX, top, size, size, 202, { strokeColor: '#e8590c' }),
    text('starter_venn_label_a', 'A', (size - overlap) / 2, midY - 18, 36, 301, {
      textAlign: 'center',
      strokeColor: '#1971c2'
    }),
    text('starter_venn_label_both', 'Both', size - overlap / 2, midY - 18, 28, 302, {
      textAlign: 'center'
    }),
    text('starter_venn_label_b', 'B', size + (size - overlap) / 2, midY - 18, 36, 303, {
      textAlign: 'center',
      strokeColor: '#e8590c'
    })
  ];
}

const BUILDERS = {
  sort_groups: sortGroups,
  venn,
  same_different: sameDifferent
};

/** A fresh board scene for a built-in layout, or null for an unknown id. */
export function whiteboardStarterScene(starterId) {
  const build = isWhiteboardStarterId(starterId) ? BUILDERS[starterId] : null;
  if (!build) return null;
  return {
    format: 'excalidraw',
    version: 1,
    elements: build(),
    appState: { viewBackgroundColor: '#ffffff' },
    files: {}
  };
}
