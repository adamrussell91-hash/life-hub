import type { Block, CardStackTint } from '@/schemas/block';

export const CARD_STACK_TINTS = [
  'navy',
  'wave',
  'marine',
  'depth',
  'high-sea',
  'lilac',
  'sage',
  'peach'
] as const satisfies readonly CardStackTint[];

export const CARD_STACK_TINT_LABEL: Record<CardStackTint, string> = {
  navy: 'Navy',
  wave: 'Wave',
  marine: 'Marine',
  depth: 'Depth',
  'high-sea': 'High sea',
  lilac: 'Lilac',
  sage: 'Sage',
  peach: 'Peach'
};

export const CARD_STACK_MAX_CARDS = 8;

export type CardStackCard = Extract<Block, { block_type: 'card_stack' }>['content']['cards'][number];

export function nextCardStackTint(index: number): CardStackTint {
  return CARD_STACK_TINTS[index % CARD_STACK_TINTS.length]!;
}

export function cardStackNumber(card: CardStackCard, index: number): string {
  const custom = card.number?.trim();
  return custom || String(index + 1).padStart(2, '0');
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function createCardStackArticle(card: CardStackCard, index: number): HTMLElement {
  const article = document.createElement('article');
  article.className = 'block-card-stack__card';
  article.dataset.tint = card.tint;
  article.dataset.cardId = card.id;

  const body = document.createElement('div');
  body.className = 'block-card-stack__body';

  const copy = document.createElement('div');
  copy.className = 'block-card-stack__copy';

  const number = document.createElement('span');
  number.className = 'block-card-stack__number';
  number.textContent = cardStackNumber(card, index);

  const text = document.createElement('div');
  text.className = 'block-card-stack__text';

  if (card.eyebrow.trim()) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'block-card-stack__eyebrow';
    eyebrow.textContent = card.eyebrow;
    text.append(eyebrow);
  }

  const title = document.createElement('h3');
  title.className = 'block-card-stack__title';
  title.textContent = card.title;
  text.append(title);

  if (card.description.trim()) {
    const description = document.createElement('p');
    description.className = 'block-card-stack__description';
    description.textContent = card.description;
    text.append(description);
  }

  copy.append(number, text);
  body.append(copy);

  const imageUrl = card.image_url?.trim();
  if (imageUrl) {
    const media = document.createElement('div');
    media.className = 'block-card-stack__media';
    const img = document.createElement('img');
    img.className = 'block-card-stack__image';
    img.src = imageUrl;
    img.alt = card.image_alt ?? '';
    img.loading = index < 2 ? 'eager' : 'lazy';
    img.draggable = false;
    media.append(img);
    body.append(media);
    article.classList.add('block-card-stack__card--has-image');
  }

  article.append(body);
  return article;
}

export function applyCardStackIndex(
  cards: HTMLElement[],
  activeIndex: number,
  reduceMotion = false
): void {
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(cards.length - 1, 0));
  cards.forEach((card, index) => {
    const state = index < safeIndex ? 'exited' : index === safeIndex ? 'active' : 'upcoming';
    card.dataset.state = reduceMotion && state === 'exited' ? 'exited-static' : state;
    card.style.setProperty('--depth', String(Math.max(index - safeIndex, 0)));
    card.setAttribute('aria-hidden', state === 'active' ? 'false' : 'true');
  });
}

export function mountCardStackControls(
  root: HTMLElement,
  cardEls: HTMLElement[],
  initialIndex = 0
): void {
  if (cardEls.length === 0) return;

  let index = Math.min(Math.max(initialIndex, 0), cardEls.length - 1);
  let wheelLock = false;
  const reduceMotion = prefersReducedMotion();

  const status = root.querySelector('.block-card-stack__status') as HTMLElement | null;
  const prev = root.querySelector('.block-card-stack__prev') as HTMLButtonElement | null;
  const next = root.querySelector('.block-card-stack__next') as HTMLButtonElement | null;

  const sync = () => {
    applyCardStackIndex(cardEls, index, reduceMotion);
    if (status) status.textContent = `${index + 1} / ${cardEls.length}`;
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= cardEls.length - 1;
    root.dataset.activeIndex = String(index);
  };

  const step = (delta: number) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= cardEls.length) return false;
    index = nextIndex;
    sync();
    return true;
  };

  prev?.addEventListener('click', () => {
    step(-1);
  });
  next?.addEventListener('click', () => {
    step(1);
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      if (step(1)) event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      if (step(-1)) event.preventDefault();
    }
  });

  root.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) < 8 || wheelLock) return;
      const moved = step(event.deltaY > 0 ? 1 : -1);
      if (!moved) return;
      event.preventDefault();
      wheelLock = true;
      window.setTimeout(() => {
        wheelLock = false;
      }, 360);
    },
    { passive: false }
  );

  let touchStartY: number | null = null;
  root.addEventListener(
    'touchstart',
    (event) => {
      touchStartY = event.changedTouches[0]?.clientY ?? null;
    },
    { passive: true }
  );
  root.addEventListener(
    'touchend',
    (event) => {
      if (touchStartY == null) return;
      const endY = event.changedTouches[0]?.clientY;
      if (endY == null) return;
      const delta = touchStartY - endY;
      touchStartY = null;
      if (Math.abs(delta) < 36) return;
      if (step(delta > 0 ? 1 : -1)) event.preventDefault();
    },
    { passive: false }
  );

  sync();
}
