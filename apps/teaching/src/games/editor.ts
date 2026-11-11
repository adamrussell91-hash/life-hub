import type { Lesson } from '@/schemas/lesson';
import { el } from '@/quiz/dom';
import { ApiClientError } from '@/api/client';
import { createHubList, type HubListHandle } from '../../design-kit/js/hub-list.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { GAME_KINDS, GAME_KIND_INFO, GAME_LIMITS, GameLessonSchema, type Game, type GameItem, type GameKind, type GameLesson } from './core/schema';
import { gameIssues, gameWarnings, normaliseAnswer } from './core/model';
import { STRENGTH_LABELS } from './core/events';
import type { GameResults, GameTeacherApi, UnitSources } from './api';
import { GAME_KIND_BLURB, gameGlyph, modeChips } from './glyphs';
import { addItems, isListGame, listShapes, newGame, newGameId, seedGame } from './seed';
import { gameContent, settingsRow } from './content-editor';
import { pills, textInput } from './item-editors';
import { canvasShowsOn, createGameTabs, type GameTab } from './editor-tabs';
import './games.css';

export type GameEditorOptions = {
  getLesson: () => Lesson;
  emitLesson: (next: Lesson) => void;
  /** The classes that teach the unit, for Results. */
  classes?: Array<{ id: string; name: string }>;
  /** Teacher API (results, markbook, Build from this unit). Null in previews without a server. */
  api: GameTeacherApi | null;
  onTab?: (tab: GameTab) => void;
};

export type GameEditorHandle = {
  root: HTMLElement;
  tabs: ReturnType<typeof createGameTabs>;
  /** Redraw from the lesson, e.g. after an undo or a reload from elsewhere. Skips the redraw for the editor's own changes. */
  sync(): void;
  repaint(): void;
  dispose(): void;
};

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const secs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const score = (s: { right: number; answered: number } | null) => (s ? `${s.right}/${s.answered}` : '—');
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/**
 * The Game lesson's build: Games (the list, a kind picker, each game's
 * settings, content, issues), Settings (homework close date) and Results
 * (per item and per student, with strength tags, and Add to markbook). Games
 * live in `lesson.game`; the ordinary blocks are the "Before you play" page.
 */
export function mountGameEditor(o: GameEditorOptions): GameEditorHandle {
  const current = (): GameLesson => GameLessonSchema.parse(o.getLesson().game ?? seedGame());
  let lastEmitted: unknown = o.getLesson().game;
  let selectedId: string | null = current().games[0]?.id ?? null;
  /** The kind picker: open while `pending` waits for a kind. */
  let pending: ((game: Game) => void) | null = null;
  let buildOpen = false;
  let sources: UnitSources | null = null;
  let sourcesError = '';
  let resultsClass: string | null = o.classes?.[0]?.id ?? null;
  let disposed = false;

  const root = el('section', 'gm gm-edit');
  const tabs = createGameTabs({
    onTab: (tab) => {
      paint();
      o.onTab?.(tab);
    }
  });
  const body = el('div', 'gm-body');
  root.append(tabs.root, body);

  const emit = (game: GameLesson) => {
    lastEmitted = game;
    o.emitLesson({ ...o.getLesson(), game });
    markTabs();
  };
  const putGame = (id: string, next: Game) => {
    const g = current();
    emit({ ...g, games: g.games.map((x) => (x.id === id ? next : x)) });
    paintIssues();
  };

  function markTabs(): void {
    tabs.mark(gameIssues({ game: current() }).length ? ['games'] : []);
  }

  // ------------------------------------------------------------ games tab
  let gamesList: HubListHandle<Game> | null = null;
  const main = el('div', 'gm-main');
  let issuesHost: HTMLElement | null = null;

  function gameRow(game: Game): HTMLElement {
    const row = el('button', 'gm-game-row');
    row.type = 'button';
    row.dataset.gameId = game.id;
    row.classList.toggle('is-selected', game.id === selectedId);
    row.setAttribute('aria-pressed', String(game.id === selectedId));
    const text = el('span', 'gm-game-row__text');
    text.append(el('span', 'gm-game-row__title', game.title.trim() || 'Untitled game'), el('span', 'gm-game-row__kind', GAME_KIND_INFO[game.kind].label));
    row.append(gameGlyph(game.kind, 'sm'), text);
    row.addEventListener('click', () => {
      selectedId = game.id;
      buildOpen = false;
      gamesList?.setItems(current().games);
      paintMain();
    });
    return row;
  }

  function kindPicker(): HTMLElement {
    const box = el('div', 'gm-panel gm-picker');
    const head = el('div', 'gm-panel__head');
    head.append(el('h3', 'gm-h3', 'Add a game'));
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      pending = null;
      paintMain();
    });
    head.append(cancel);
    const grid = el('div', 'gm-picker__grid');
    for (const kind of GAME_KINDS) {
      const card = el('button', 'gm-kind');
      card.type = 'button';
      card.dataset.kind = kind;
      const text = el('span', 'gm-kind__text');
      text.append(el('span', 'gm-kind__label', GAME_KIND_INFO[kind].label), el('span', 'gm-kind__blurb', GAME_KIND_BLURB[kind]), modeChips(kind));
      card.append(gameGlyph(kind, 'md'), text);
      card.addEventListener('click', () => {
        const done = pending;
        pending = null;
        const game = newGame(kind, newGameId('g'));
        selectedId = game.id;
        if (done) done(game);
        else emit({ ...current(), games: [...current().games, game] });
        gamesList?.setItems(current().games);
        paintMain();
      });
      grid.append(card);
    }
    box.append(head, el('p', 'gm-note', 'Solo games can be set as homework. Live games run from Display with the class.'), grid);
    return box;
  }

  function paintIssues(): void {
    if (!issuesHost) return;
    const game = current().games.find((g) => g.id === selectedId);
    issuesHost.replaceChildren();
    if (!game) return;
    // Checked across the whole lesson so names match ("Game 3"), then kept to this game's lines.
    const all = current();
    const at = all.games.findIndex((g) => g.id === game.id);
    const where = game.title.trim() ? `“${game.title.trim()}”` : `Game ${at + 1}`;
    const mine = (m: string) => m.includes(where) || m === `Give game ${at + 1} a title.`;
    const issues = gameIssues({ game: all }).filter(mine);
    const warnings = gameWarnings({ game: all }).filter(mine);
    if (issues.length) {
      const box = el('div', 'gm-issues gm-issues--block');
      box.append(el('p', 'gm-issues__head', 'Before this game can publish'));
      const ul = el('ul');
      for (const i of issues.slice(0, 8)) ul.append(el('li', '', i));
      if (issues.length > 8) ul.append(el('li', '', `and ${issues.length - 8} more.`));
      box.append(ul);
      issuesHost.append(box);
    }
    if (warnings.length) {
      const box = el('div', 'gm-issues gm-issues--warn');
      box.append(el('p', 'gm-issues__head', 'Worth a look'));
      const ul = el('ul');
      for (const w of warnings) ul.append(el('li', '', w));
      box.append(ul);
      issuesHost.append(box);
    }
    if (!issues.length && !warnings.length) issuesHost.append(el('p', 'gm-ready', 'Ready to play.'));
  }

  function buildPanel(game: Game): HTMLElement {
    const box = el('div', 'gm-panel gm-sources');
    const head = el('div', 'gm-panel__head');
    head.append(el('h3', 'gm-h3', 'Build from this unit'));
    const close = el('button', 'btn btn--ghost', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => {
      buildOpen = false;
      paintMain();
    });
    head.append(close);
    box.append(head);
    if (!isListGame(game)) return box;
    if (!o.api) {
      box.append(el('p', 'gm-note', 'Open this lesson in the Teaching hub to pull from the unit.'));
      return box;
    }
    if (sourcesError) {
      box.append(el('p', 'gm-err', sourcesError));
      return box;
    }
    if (!sources) {
      box.append(el('p', 'gm-note', 'Loading the unit’s terms, questions and quotes…'));
      void o.api.sources().then(
        (s) => {
          sources = s;
          if (!disposed && buildOpen) paintMain();
        },
        (e) => {
          sourcesError = errText(e, 'The unit didn’t load. Try again.');
          if (!disposed && buildOpen) paintMain();
        }
      );
      return box;
    }
    const shapes = new Set(listShapes(game.kind));
    // Already in: the same source id, or a term the game already has under another id.
    const haveTerms = new Set(game.items.flatMap((i) => (i.shape === 'term' && i.term.trim() ? [normaliseAnswer(i.term)] : [])));
    const have = new Set([...game.items.map((i) => i.id), ...sources.terms.filter((t) => haveTerms.has(normaliseAnswer(t.item.term))).map((t) => t.item.id)]);
    const picked = new Map<string, GameItem>();
    const groups: Array<{ title: string; rows: Array<{ item: GameItem; label: string; sub: string }> }> = [];
    if (shapes.has('term')) {
      const bySection = new Map<string, Array<{ item: GameItem; label: string; sub: string }>>();
      for (const t of sources.terms) {
        const list = bySection.get(t.section) ?? [];
        list.push({ item: t.item, label: t.item.term, sub: t.item.clues[0]?.text ?? '' });
        bySection.set(t.section, list);
      }
      for (const [section, rows] of bySection) groups.push({ title: `Organiser · ${section}`, rows });
    }
    if (shapes.has('question') && sources.questions.length) groups.push({ title: 'Quiz questions', rows: sources.questions.map((q) => ({ item: q.item, label: String((q.item.question as { prompt?: string }).prompt ?? ''), sub: q.lesson_title })) });
    if (shapes.has('quote') && sources.quotes.length) groups.push({ title: 'Quotes', rows: sources.quotes.map((q) => ({ item: q.item, label: q.item.text, sub: [q.attribution, q.lesson_title].filter(Boolean).join(' · ') })) });
    if (!groups.length) {
      box.append(el('p', 'gm-note', sources.unit_id ? 'This unit has nothing this game can use yet. Organiser vocabulary, quiz questions and quote blocks show here.' : 'This lesson isn’t in a unit yet.'));
      return box;
    }
    const addBtn = el('button', 'btn btn--primary', 'Add 0');
    addBtn.type = 'button';
    addBtn.disabled = true;
    const status = el('p', 'gm-note');
    status.setAttribute('role', 'status');
    const paintAdd = () => {
      addBtn.textContent = picked.size ? `Add ${picked.size}` : 'Tick what to add';
      addBtn.disabled = picked.size === 0;
    };
    const listWrap = el('div', 'gm-sources__list');
    for (const g of groups) {
      const section = el('fieldset', 'gm-sources__group');
      section.append(el('legend', 'gm-h5', g.title));
      for (const r of g.rows) {
        const row = el('label', 'gm-source');
        const box2 = el('input');
        box2.type = 'checkbox';
        box2.dataset.itemId = r.item.id;
        const tags = 'pieces' in r.item && r.item.pieces.length ? el('span', 'gm-tag gm-tag--piece', 'Tagged') : null;
        if (have.has(r.item.id)) {
          box2.checked = true;
          box2.disabled = true;
        }
        box2.addEventListener('change', () => {
          if (box2.checked) picked.set(r.item.id, r.item);
          else picked.delete(r.item.id);
          paintAdd();
        });
        const text = el('span', 'gm-source__text');
        text.append(el('span', 'gm-source__label', r.label.slice(0, 160) || '(empty)'));
        if (r.sub) text.append(el('span', 'gm-source__sub', r.sub.slice(0, 160)));
        if (have.has(r.item.id)) text.append(el('span', 'gm-source__sub', 'Already in this game'));
        row.append(box2, text);
        if (tags) row.append(tags);
        section.append(row);
      }
      listWrap.append(section);
    }
    addBtn.addEventListener('click', () => {
      const g = current().games.find((x) => x.id === game.id);
      if (!g || !isListGame(g)) return;
      const result = addItems(g, [...picked.values()]);
      putGame(g.id, result.game);
      buildOpen = false;
      paintMain();
      flash(result.added ? `Added ${result.added}.${result.skipped ? ` ${result.skipped} skipped (already in, or the game is full).` : ''}` : 'Nothing new to add.');
    });
    paintAdd();
    const actions = el('div', 'gm-actions');
    actions.dataset.part = 'form-actions';
    const cancel = el('button', 'btn btn--secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      buildOpen = false;
      paintMain();
    });
    actions.append(cancel, addBtn);
    listWrap.append(status);
    box.append(listWrap, actions);
    return box;
  }

  let flashText = '';
  function flash(text: string): void {
    flashText = text;
    const node = main.querySelector('.gm-flash');
    if (node) node.textContent = text;
  }

  function paintMain(): void {
    issuesHost = null;
    main.replaceChildren();
    const flashNode = el('p', 'gm-flash', flashText);
    flashNode.setAttribute('role', 'status');
    flashText = '';
    if (pending) {
      main.append(kindPicker());
      return;
    }
    const game = current().games.find((g) => g.id === selectedId);
    if (!game) {
      const empty = el('div', 'gm-panel gm-empty');
      empty.append(el('h3', 'gm-h3', 'No game picked'), el('p', 'gm-note', 'Add a game from the list, or pick one to edit it.'));
      main.append(empty);
      return;
    }
    const head = el('div', 'gm-game-head');
    const titleWrap = el('div', 'gm-game-head__text');
    const title = textInput(game.title, GAME_LIMITS.title, 'Game title', (v) => {
      const g = current().games.find((x) => x.id === game.id);
      if (!g) return;
      putGame(g.id, { ...g, title: v });
      gamesList?.setItems(current().games);
    }, `${GAME_KIND_INFO[game.kind].label} title`);
    title.classList.add('gm-title-input');
    const kindLine = el('div', 'gm-game-head__kind');
    kindLine.append(el('span', '', GAME_KIND_INFO[game.kind].label), modeChips(game.kind));
    titleWrap.append(title, kindLine);
    head.append(gameGlyph(game.kind, 'lg'), titleWrap);
    const ctx = {
      onChange: (next: Game) => putGame(game.id, next),
      ...(isListGame(game) ? { openBuild: () => { buildOpen = true; paintMain(); } } : {})
    };
    issuesHost = el('div', 'gm-issues-host');
    main.append(head, flashNode, settingsRow(game, ctx), issuesHost);
    if (buildOpen && isListGame(game)) main.append(buildPanel(game));
    main.append(gameContent(game, ctx));
    paintIssues();
  }

  function gamesTab(): HTMLElement {
    const wrap = el('div', 'gm-build');
    const side = el('aside', 'gm-side');
    side.append(el('h3', 'gm-h3', 'Games'), el('p', 'gm-note', `Up to ${GAME_LIMITS.games}, in play order.`));
    gamesList?.dispose();
    gamesList = createHubList<Game>({
      items: current().games,
      noun: 'game',
      label: 'Games',
      variant: 'compact',
      max: GAME_LIMITS.games,
      maxReason: `A lesson holds up to ${GAME_LIMITS.games} games.`,
      getKey: (g) => g.id,
      describe: (g, i) => g.title.trim() || `${GAME_KIND_INFO[g.kind].label} ${i + 1}`,
      read: () => current().games,
      pick: (_anchor, done) => {
        pending = done;
        paintMain();
        main.querySelector<HTMLButtonElement>('.gm-kind')?.focus();
      },
      duplicate: (g) => ({ ...structuredClone(g), id: newGameId('g'), title: g.title ? `${g.title} (copy)`.slice(0, GAME_LIMITS.title) : '' }),
      onChange: (next) => {
        emit({ ...current(), games: next });
        if (!next.some((g) => g.id === selectedId)) selectedId = next[0]?.id ?? null;
        paintMain();
      },
      renderItem: (g) => gameRow(g),
      addLabel: 'Add a game',
      empty: (_insert, pick) => {
        const box = el('div', 'gm-empty-list');
        const b = el('button', 'btn btn--primary', 'Add your first game');
        b.type = 'button';
        b.addEventListener('click', () => pick(b));
        box.append(el('p', 'gm-note', 'Pick from twelve kinds: crosswords, Connections, Jeopardy and more.'), b);
        return box;
      }
    });
    side.append(gamesList.el);
    wrap.append(side, main);
    paintMain();
    return wrap;
  }

  // ------------------------------------------------------------ settings tab
  function settingsTab(): HTMLElement {
    const panel = el('div', 'gm-panel gm-settings-tab');
    panel.append(el('h3', 'gm-h3', 'Homework'), el('p', 'gm-note', 'Solo games (crossword, find-a-word, points rush, Connections, Who said it?) open as homework once the lesson is published. Each student keeps their best and latest try.'));
    const closes = current().homework_closes_at;
    const input = el('input', 'gm-input');
    input.type = 'datetime-local';
    input.setAttribute('aria-label', 'Homework closes');
    if (closes) {
      const d = new Date(closes);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      input.value = local;
    }
    const line = el('p', 'gm-note');
    const paintLine = () => {
      const c = current().homework_closes_at;
      line.textContent = c ? `Closes ${formatDisplayDate(c)} at ${new Date(c).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'No close date: homework stays open.';
    };
    input.addEventListener('change', () => {
      const g = current();
      const d = input.value ? new Date(input.value) : null;
      if (d && !Number.isNaN(d.getTime())) emit({ ...g, homework_closes_at: d.toISOString() });
      else {
        const { homework_closes_at: _h, ...rest } = g;
        emit(rest as GameLesson);
      }
      paintLine();
    });
    const clear = el('button', 'btn btn--ghost', 'No close date');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('change'));
    });
    const row = el('div', 'gm-row');
    const label = el('label', 'gm-field');
    label.append(el('span', 'gm-field__label', 'Homework closes'), input);
    row.append(label, clear);
    paintLine();
    panel.append(row, line);
    return panel;
  }

  // ------------------------------------------------------------ results tab
  let results: GameResults[] | null = null;
  let resultsError = '';
  let resultsLoading = false;

  async function loadResults(): Promise<void> {
    if (!o.api) return;
    resultsLoading = true;
    resultsError = '';
    paintResults();
    try {
      const r = await o.api.results(resultsClass);
      results = r.games;
    } catch (e) {
      results = null;
      resultsError = e instanceof ApiClientError && e.code === 'not_published' ? 'Publish this lesson to see results.' : errText(e, 'Results didn’t load. Try again.');
    } finally {
      resultsLoading = false;
      if (!disposed) paintResults();
    }
  }

  const resultsHost = el('div', 'gm-results');
  function table(head: string[], rows: Array<Array<string | Node>>, caption: string): HTMLElement {
    const scroll = el('div', 'gm-table-scroll');
    const t = el('table', 'gm-table');
    const cap = el('caption', '', caption);
    const thead = el('thead');
    const tr = el('tr');
    for (const h of head) tr.append(el('th', '', h));
    thead.append(tr);
    const tbody = el('tbody');
    for (const r of rows) {
      const row = el('tr');
      for (const c of r) {
        const td = el('td');
        if (typeof c === 'string') td.textContent = c;
        else td.append(c);
        row.append(td);
      }
      tbody.append(row);
    }
    t.append(cap, thead, tbody);
    scroll.append(t);
    return scroll;
  }

  function gameResultsCard(r: GameResults): HTMLElement {
    const card = el('section', 'gm-panel gm-result');
    const head = el('div', 'gm-panel__head');
    const title = el('div', 'gm-result__title');
    title.append(gameGlyph(r.kind, 'sm'), el('h3', 'gm-h3', r.title || GAME_KIND_INFO[r.kind].label), el('span', 'gm-count', `${r.plays} ${r.plays === 1 ? 'play' : 'plays'}`));
    head.append(title);
    const status = el('p', 'gm-note');
    status.setAttribute('role', 'status');
    const push = el('button', 'btn btn--secondary', 'Add to markbook');
    push.type = 'button';
    push.disabled = !resultsClass || !o.api || !r.students.some((s) => s.accuracy !== null);
    if (!resultsClass) push.title = 'Pick a class first.';
    push.addEventListener('click', async () => {
      if (!o.api || !resultsClass) return;
      push.disabled = true;
      status.textContent = 'Adding a column…';
      try {
        const res = await o.api.pushToMarkbook(resultsClass, r.game_id);
        status.textContent = `Added to the markbook: accuracy for ${res.count} ${res.count === 1 ? 'student' : 'students'}.`;
      } catch (e) {
        status.textContent = errText(e, 'That didn’t reach the markbook. Try again.');
        push.disabled = false;
      }
    });
    head.append(push);
    card.append(head, status);
    if (!r.plays) {
      card.append(el('p', 'gm-note', 'Nobody has played this game yet.'));
      return card;
    }
    card.append(
      table(
        ['Item', 'Right', 'Median time', 'Common wrong answers'],
        r.items.map((i) => [i.label || i.id, `${pct(i.accuracy)} (${i.right}/${i.answered})`, secs(i.median_ms), i.wrong.length ? i.wrong.map((w) => `${w.text} ×${w.count}`).join(', ') : '—']),
        'Per item'
      ),
      table(
        ['Student', 'Right', 'Missed', 'Played', 'Best', 'Latest'],
        r.students.map((s) => {
          const who = el('span', 'gm-who');
          who.append(el('span', '', s.name ?? s.initials ?? 'A student'));
          for (const st of s.strength) who.append(el('span', `gm-chip gm-chip--${st}`, STRENGTH_LABELS[st]));
          return [who, pct(s.accuracy), String(s.missed.length), String(s.plays), score(s.best), score(s.latest)];
        }),
        'Per student'
      )
    );
    return card;
  }

  function paintResults(): void {
    resultsHost.replaceChildren();
    const bar = el('div', 'gm-row gm-results__bar');
    const classes = o.classes ?? [];
    if (classes.length) {
      const wrap = el('div', 'gm-field');
      wrap.append(
        el('span', 'gm-field__label', 'Class'),
        pills(classes.map((c): [string, string] => [c.id, c.name]), resultsClass ?? '', 'Class', (v) => {
          resultsClass = v;
          void loadResults();
        })
      );
      bar.append(wrap);
    }
    const refresh = el('button', 'btn btn--ghost', resultsLoading ? 'Loading…' : 'Refresh');
    refresh.type = 'button';
    refresh.disabled = resultsLoading || !o.api;
    refresh.addEventListener('click', () => void loadResults());
    bar.append(refresh);
    resultsHost.append(bar);
    if (!o.api) {
      resultsHost.append(el('p', 'gm-note', 'Results show here once students play.'));
      return;
    }
    if (resultsError) {
      resultsHost.append(el('p', 'gm-note', resultsError));
      return;
    }
    if (!results) {
      resultsHost.append(el('p', 'gm-note', resultsLoading ? 'Loading results…' : 'No results yet.'));
      return;
    }
    if (!results.length) resultsHost.append(el('p', 'gm-note', 'No games in the published lesson.'));
    resultsHost.append(el('p', 'gm-note', 'Tags: Live is a live game alone, Team a live team game, Homework a solo try at home. Games never count toward mastery.'));
    for (const r of results) resultsHost.append(gameResultsCard(r));
  }

  // ------------------------------------------------------------ paint
  function paint(): void {
    const tab = tabs.current();
    body.replaceChildren();
    if (tab !== 'games') {
      gamesList?.dispose();
      gamesList = null;
    }
    if (tab === 'games') body.append(gamesTab());
    else if (tab === 'before') {
      const p = el('div', 'gm-panel gm-before');
      p.append(el('h3', 'gm-h3', 'Before you play'), el('p', 'gm-note', 'Optional. Blocks below show above the games for students: instructions, a model answer, a reminder. Quiz questions belong in a game.'));
      body.append(p);
    } else if (tab === 'settings') body.append(settingsTab());
    else {
      body.append(resultsHost);
      paintResults();
      if (!results && !resultsLoading && !resultsError) void loadResults();
    }
    markTabs();
  }
  paint();

  return {
    root,
    tabs,
    sync() {
      const game = o.getLesson().game;
      if (game === lastEmitted) return;
      lastEmitted = game;
      if (!current().games.some((g) => g.id === selectedId)) selectedId = current().games[0]?.id ?? null;
      paint();
    },
    repaint: paint,
    dispose() {
      disposed = true;
      gamesList?.dispose();
      root.remove();
    }
  };
}

export { canvasShowsOn };
export type { GameKind };
