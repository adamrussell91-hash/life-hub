export const CARD_SWIPE_ITEM_WIDTH: 320;
export const CARD_SWIPE_GAP: 16;
export const CARD_SWIPE_DRAG_BUFFER: 50;
export const CARD_SWIPE_VELOCITY_THRESHOLD: 500;

export type CardSwipeItem = {
  id?: string | number;
  title: string;
  description?: string;
  icon?: string | Node | (() => Node);
  actionLabel?: string;
  onAction?: (item: CardSwipeItem, event: Event) => void;
};

export const DEFAULT_CARD_SWIPE_ITEMS: CardSwipeItem[];

export function nextSwipeIndex(options?: {
  offset?: number;
  velocity?: number;
  currentIndex?: number;
  itemCount?: number;
  dragBuffer?: number;
  velocityThreshold?: number;
}): number;

export type CardSwipeApi = {
  el: HTMLElement;
  viewport: HTMLElement;
  track: HTMLElement;
  dots: HTMLElement;
  status: HTMLElement;
  appendSlide: (node: HTMLElement, options?: { title?: string }) => HTMLElement;
  setIndex: (next: number, options?: { silent?: boolean; animate?: boolean }) => number;
  getIndex: () => number;
  sync: () => void;
  destroy: () => void;
};

export function createCardSwipe(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  items?: CardSwipeItem[];
  slides?: HTMLElement[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  className?: string;
  label?: string;
  itemWidth?: number;
  gap?: number;
  tilt?: number;
  fluid?: boolean;
}): CardSwipeApi;

export function mountCardSwipe(
  el: HTMLElement,
  options?: {
    root?: Document;
    currentIndex?: number;
    onIndexChange?: (index: number) => void;
    itemWidth?: number;
    gap?: number;
    tilt?: number;
    fluid?: boolean;
    label?: string;
  }
): CardSwipeApi | null;

export function mountCardSwipes(scope?: ParentNode): CardSwipeApi[];
