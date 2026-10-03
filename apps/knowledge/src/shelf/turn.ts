/**
 * The Bookshelf's two faces are the same books turned: covers face out, or
 * page edges face out. Turning flies each book from where it stood to where it
 * lands while it rotates through edge-on, one after another along the shelf,
 * so the change reads as books being turned rather than a page swap.
 */

export type BookSnapshot = { rect: DOMRect; node: HTMLElement };

const DURATION = 640;
const STAGGER = 26;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Each visible book on the stage, by key, with a frozen copy of how it looks. */
export function snapshotBooks(stage: ParentNode): Map<string, BookSnapshot> {
  const out = new Map<string, BookSnapshot>();
  for (const el of stage.querySelectorAll<HTMLElement>("[data-book]")) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;
    const node = el.cloneNode(true) as HTMLElement;
    node.removeAttribute("id");
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
    out.set(el.dataset.book!, { rect, node });
  }
  return out;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function face(node: HTMLElement, w: number, h: number, back: boolean) {
  const holder = document.createElement("div");
  holder.className = `book-turn__face${back ? " is-back" : ""}`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  node.style.margin = "0";
  node.style.position = "absolute";
  node.style.left = "0";
  node.style.top = "0";
  node.style.transform = "none";
  holder.style.width = `${w}px`;
  holder.style.height = `${h}px`;
  holder.appendChild(node);
  return holder;
}

/**
 * Animates from `before` to the books now on `stage`. Real books stay hidden
 * until their twin lands. Resolves when every book has landed.
 */
export function turnBooks(layer: HTMLElement, before: Map<string, BookSnapshot>, stage: ParentNode): Promise<void> {
  const after = snapshotBooks(stage);
  const real = new Map([...stage.querySelectorAll<HTMLElement>("[data-book]")].map(el => [el.dataset.book!, el]));
  const pairs = [...after.keys()]
    .filter(key => before.has(key))
    .map(key => ({ key, from: before.get(key)!.rect, to: after.get(key)!.rect, a: before.get(key)!.node, b: after.get(key)!.node }))
    // Ripple along the shelf: row by row, left to right, from where the books start.
    .sort((p, q) => Math.round(p.from.top / 40) - Math.round(q.from.top / 40) || p.from.left - q.from.left);
  if (!pairs.length || prefersReducedMotion()) return Promise.resolve();

  const overlay = document.createElement("div");
  overlay.className = "book-turn";
  layer.appendChild(overlay);
  const cards = pairs.map((pair, index) => {
    real.get(pair.key)!.style.visibility = "hidden";
    const card = document.createElement("div");
    card.className = "book-turn__card";
    const front = face(pair.a, pair.from.width, pair.from.height, false);
    const back = face(pair.b, pair.to.width, pair.to.height, true);
    card.append(front, back);
    overlay.appendChild(card);
    return { ...pair, card, front, back, delay: index * STAGGER, done: false };
  });
  // Books that only exist after the turn (none today, but a repaint could add one) fade in.
  for (const [key, el] of real) if (!before.has(key)) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 300, fill: "backwards" });

  return new Promise(resolve => {
    const start = performance.now();
    const step = (now: number) => {
      let pending = 0;
      for (const c of cards) {
        if (c.done) continue;
        const raw = Math.min(1, Math.max(0, (now - start - c.delay) / DURATION));
        const t = ease(raw);
        const w = lerp(c.from.width, c.to.width, t);
        const h = lerp(c.from.height, c.to.height, t);
        const x = lerp(c.from.left, c.to.left, t);
        // A small lift mid-turn, as if the book is picked up and set down.
        const y = lerp(c.from.top, c.to.top, t) - Math.sin(Math.PI * t) * 14;
        c.card.style.width = `${w}px`;
        c.card.style.height = `${h}px`;
        c.card.style.transform = `translate(${x}px, ${y}px) rotateY(${180 * t}deg)`;
        c.front.style.transform = `translate(${(w - c.from.width) / 2}px, ${(h - c.from.height) / 2}px) scale(${w / c.from.width}, ${h / c.from.height})`;
        c.back.style.transform = `translate(${(w - c.to.width) / 2}px, ${(h - c.to.height) / 2}px) rotateY(180deg) scale(${w / c.to.width}, ${h / c.to.height})`;
        if (raw >= 1) {
          c.done = true;
          c.card.remove();
          const el = real.get(c.key);
          if (el) el.style.visibility = "";
        } else pending += 1;
      }
      if (pending) requestAnimationFrame(step);
      else {
        overlay.remove();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Opening a book from its cover: the cover flies to the middle of the screen
 * and swings open like a front board, then `open` paints the book underneath
 * and the page fades through.
 */
export function openCover(source: HTMLElement, openBook: () => void) {
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    openBook();
  };
  if (prefersReducedMotion()) {
    open();
    return;
  }
  const rect = source.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "book-open";
  const book = document.createElement("div");
  book.className = "book-open__book";
  book.style.width = `${rect.width}px`;
  book.style.height = `${rect.height}px`;
  book.style.setProperty("--c", getComputedStyle(source).getPropertyValue("--c") || "var(--shallow)");
  const pages = document.createElement("div");
  pages.className = "book-open__pages";
  const board = source.cloneNode(true) as HTMLElement;
  board.className = `${board.className} book-open__board`;
  board.style.cssText += ";position:absolute;inset:0;width:100%;height:100%;margin:0;transform:none";
  book.append(pages, board);
  overlay.appendChild(book);
  document.body.appendChild(overlay);

  const scale = Math.min(2.6, (window.innerHeight * 0.62) / rect.height);
  const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
  const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
  book.style.left = `${rect.left}px`;
  book.style.top = `${rect.top}px`;
  source.style.visibility = "hidden";

  const fly = book.animate(
    [{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
    { duration: 380, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
  );
  fly.finished
    .then(() => board.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(-150deg)" }], { duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished)
    .then(() => {
      open();
      return overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-out", fill: "forwards" }).finished;
    })
    .catch(() => open())
    .finally(() => overlay.remove());
}
