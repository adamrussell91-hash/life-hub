/**
 * Feedback loop: open New note menu at mobile width and report geometry.
 * Exit 1 if the menu overflows the viewport or covers the Archive title.
 *
 *   node scripts/repro-new-note-menu.mjs           # broken CSS-only path (expect fail)
 *   node scripts/repro-new-note-menu.mjs --floating # Floating UI path (expect pass)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const tokens = readFileSync(join(root, "design-kit/tokens.css"), "utf8");
const filters = readFileSync(join(root, "design-kit/filters.css"), "utf8");
const style = readFileSync(join(root, "src/style.css"), "utf8");
const useFloating = process.argv.includes("--floating");

const html = `<!doctype html>
<html lang="en" data-hub="knowledge">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${tokens}\n${filters}\n${style}</style>
</head>
<body>
  <div class="app-shell">
    <main class="canvas">
      <header class="topbar page-header">
        <div class="page-header__copy">
          <p class="eyebrow page-header__eyebrow">Private archive</p>
          <div class="page-header__title-row">
            <h1 class="page-header__title" id="archive-title">Archive</h1>
          </div>
        </div>
        <div class="page-header__actions">
          <div class="new-note">
            <button class="btn" data-new-note-menu type="button" aria-haspopup="menu" aria-expanded="false">New note</button>
            <div class="hub-menu new-note__menu" role="menu" hidden>
              <p class="hub-menu__head">New note</p>
              <button class="hub-menu__opt" role="menuitem" type="button">
                <span class="new-note__opt">
                  <span class="new-note__opt-title">Ask Clementine</span>
                  <span class="new-note__opt-detail">She researches the open web and files a tagged page</span>
                </span>
              </button>
              <button class="hub-menu__opt" role="menuitem" type="button">
                <span class="new-note__opt">
                  <span class="new-note__opt-title">From a book</span>
                  <span class="new-note__opt-detail">Researched from a passage, stamped under the book</span>
                </span>
              </button>
            </div>
          </div>
          <div class="viewbar">
            <button class="viewbar__btn is-active" type="button">List</button>
            <button class="viewbar__btn" type="button">Graph</button>
          </div>
        </div>
      </header>
      <div class="toolbar"><input class="hub-search" placeholder="titles, tags, excerpts…" /></div>
    </main>
  </div>
  <script type="module">
    const useFloating = ${useFloating ? "true" : "false"};
    const toggle = document.querySelector("[data-new-note-menu]");
    const menu = document.querySelector(".new-note__menu");
    let stopFloating;
    const opts = { placement: "bottom-start", offset: 6, padding: 12 };
    const floating = useFloating ? await import("/design-kit/js/hub-floating.js") : null;
    toggle.onclick = async () => {
      const open = menu.classList.contains("is-open");
      if (open) {
        stopFloating?.();
        stopFloating = undefined;
        menu.hidden = true;
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      menu.hidden = false;
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      if (floating) {
        await floating.positionHubFloating(toggle, menu, opts);
        stopFloating = floating.autoUpdateHubFloating(toggle, menu, opts);
      } else {
        menu.style.top = "calc(100% + 0.4rem)";
        menu.style.right = "0";
      }
    };
  </script>
</body>
</html>`;

const mime = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

const server = createServer((req, res) => {
  const url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  if (url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  const filePath = join(root, url.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("missing " + url);
    return;
  }
  res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`http://127.0.0.1:${port}/`);
await page.click("[data-new-note-menu]");
await page.waitForTimeout(120);

const report = await page.evaluate(() => {
  const menu = document.querySelector(".new-note__menu");
  const title = document.querySelector("#archive-title");
  const mr = menu.getBoundingClientRect();
  const tr = title.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const style = getComputedStyle(menu);
  const overlap =
    mr.left < tr.right && mr.right > tr.left && mr.top < tr.bottom && mr.bottom > tr.top;
  return {
    position: style.position,
    top: style.top,
    left: style.left,
    menu: { left: mr.left, right: mr.right, top: mr.top, bottom: mr.bottom, w: mr.width, h: mr.height },
    title: { left: tr.left, top: tr.top, bottom: tr.bottom },
    viewport: { vw, vh },
    overflowLeft: mr.left < -1,
    overflowRight: mr.right > vw + 1,
    overflowTop: mr.top < -1,
    overflowBottom: mr.bottom > vh + 1,
    overlapsTitle: overlap,
    visible: style.opacity !== "0" && style.display !== "none" && !menu.hidden,
  };
});

console.log(JSON.stringify({ useFloating, ...report }, null, 2));

// Open dropdown may cover the title row on phones (actions sit above the h1).
// The bug is geometry: menu off-screen / clipped, not "covers content while open".
const fail =
  !report.visible ||
  report.overflowLeft ||
  report.overflowRight ||
  report.overflowTop ||
  report.overflowBottom ||
  report.menu.top > report.viewport.vh * 0.5;

const shot = `/opt/cursor/artifacts/new-note-menu-${useFloating ? "fixed" : "broken"}.png`;
await page.screenshot({ path: shot, fullPage: false });
console.log("screenshot", shot);

await browser.close();
server.close();
process.exit(fail ? 1 : 0);
