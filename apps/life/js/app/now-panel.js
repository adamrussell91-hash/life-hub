import {
  NOW_TASK_DOMAINS,
  addDays,
  bookHref,
  buildDayTimeline,
  classCodesFrom,
  formatClock,
  formatLessonWhen,
  formatTaskSummary,
  hubJumpLines,
  isOpenTask,
  nowTasks,
  readingNow,
  taskSummary,
  upcomingLesson
} from '../shell/now-panel-model.js';

/**
 * Home's Now panel: one capture bar (task, note, book page), the day as a
 * timeline, the tasks you can tick off, and one live line per hub.
 * Every save says what happened; every failure says why and keeps your text.
 */

const HOLD_MS = 5000;
const TOAST_MS = 8000;
const ERROR_TOAST_MS = 14000;
const MODES = ['task', 'note', 'book'];
const PLACEHOLDER = { task: 'Add a task…', note: "What's on your mind?", book: 'A thought from the book (or just log your page)' };
const SUBMIT_LABEL = { task: 'Add', note: 'Save', book: 'Log' };

export function failureReason(error) {
  const status = Number(error?.status);
  const code = String(error?.code ?? '');
  if (error instanceof TypeError || code === 'network_error') return "you look to be offline";
  if (status === 401 || status === 403) return 'your session has ended, so sign in again';
  if (/unbound/.test(code)) return "that store isn't connected yet";
  if (status === 400 && error?.message) return error.message;
  if (status >= 500) return "the server didn't answer";
  return 'something went wrong';
}

function statusFrom(result, unboundCode) {
  if (result.ok) return 'ready';
  return result.error?.code === unboundCode || /unbound/.test(String(result.error?.code ?? '')) ? 'unbound' : 'error';
}

const settle = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));

export function createNowPanel({
  root,
  bind,
  teachingApi,
  tasksApi,
  knowledgeApi,
  getToday,
  getNowMinutes,
  getEvents = () => [],
  getMeetingsThisWeek = () => null,
  isVisible = () => true,
  onTasksChanged = () => {},
  onLoaded = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  setRepeat = (fn, ms) => setInterval(fn, ms),
  clearRepeat = id => clearInterval(id)
}) {
  const doc = root?.ownerDocument ?? root;
  const $ = selector => root?.querySelector?.(selector) ?? null;
  const panel = $('[data-now-capture]')?.closest?.('.now-panel') ?? $('.now-panel');
  const state = { mode: 'task', due: 'today', domain: 'life', clementine: true, book: null, page: '', filter: 'all', day: 'today', busy: false };
  const data = { curriculum: null, tasks: [], books: [], status: { teaching: 'loading', tasks: 'loading', books: 'loading' } };
  const holds = new Map();
  let inFlight = null;
  let toastTimer = null;
  let toastToken = 0;
  let minuteTimer = null;
  let freshTaskId = null;

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  /* ---------------- Loading ---------------- */

  function load() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const [teaching, tasks, shelf] = await Promise.all([
        teachingApi?.getCurriculum ? settle(teachingApi.getCurriculum()) : Promise.resolve({ ok: false, error: null }),
        tasksApi?.listTasks ? settle(tasksApi.listTasks()) : Promise.resolve({ ok: false, error: null }),
        knowledgeApi?.getShelf ? settle(knowledgeApi.getShelf()) : Promise.resolve({ ok: false, error: null })
      ]);
      data.curriculum = teaching.ok ? teaching.value : null;
      data.status.teaching = statusFrom(teaching, 'blobs_unbound');
      if (tasks.ok) {
        const held = data.tasks.filter(task => holds.has(task.id));
        const fresh = (Array.isArray(tasks.value) ? tasks.value : []).filter(isOpenTask);
        data.tasks = [...fresh.filter(task => !holds.has(task.id)), ...held];
      }
      data.status.tasks = statusFrom(tasks, 'tasks_blobs_unbound');
      if (shelf.ok) data.books = readingNow(shelf.value);
      data.status.books = statusFrom(shelf, 'knowledge_repo_unbound');
      if (state.book && !data.books.some(book => book.label === state.book)) state.book = null;
      if (!state.book && data.books[0]) state.book = data.books[0].label;
      render();
      onLoaded({ curriculum: data.curriculum, tasks: tasks.ok ? tasks.value : null, status: { ...data.status } });
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /* ---------------- Rendering ---------------- */

  function render() {
    renderOptions();
    renderDay();
    renderTasks();
    renderJumps();
  }

  const visibleTasks = () => data.tasks.filter(task => !holds.has(task.id));

  function renderOptions() {
    const host = $('[data-now-options]');
    if (!host) return;
    for (const button of root.querySelectorAll('[data-now-mode]')) {
      const on = button.dataset.nowMode === state.mode;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    const input = $('[data-now-input]');
    if (input) input.placeholder = PLACEHOLDER[state.mode];
    const submit = $('[data-now-submit]');
    if (submit) submit.textContent = SUBMIT_LABEL[state.mode];
    host.replaceChildren();

    const chip = (label, pressed, onClick, extra) => {
      const button = el('button', 'now-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(pressed));
      button.append(doc.createTextNode(label));
      if (extra) button.append(el('small', null, extra));
      button.addEventListener('click', onClick);
      return button;
    };
    const label = text => el('span', 'now-capture__label', text);

    if (state.mode === 'task') {
      host.append(label('Due'));
      for (const [value, text] of [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['none', 'No date']]) {
        host.append(chip(text, state.due === value, () => { state.due = value; renderOptions(); }));
      }
      host.append(el('span', 'now-capture__sep'), label('Hub'));
      for (const domain of NOW_TASK_DOMAINS) {
        host.append(chip(domain.label, state.domain === domain.id, () => { state.domain = domain.id; renderOptions(); }));
      }
    } else if (state.mode === 'note') {
      host.append(
        chip('Clementine files it', state.clementine, () => { state.clementine = !state.clementine; renderOptions(); }),
        el('span', 'now-capture__help', state.clementine
          ? 'She picks the notebook and tags after it saves.'
          : 'It saves to your notes exactly as written.')
      );
    } else if (data.status.books === 'loading') {
      host.append(el('span', 'now-capture__help', 'Loading your books…'));
    } else if (data.status.books !== 'ready') {
      host.append(el('span', 'now-capture__help', data.status.books === 'unbound'
        ? "The Bookshelf isn't connected yet."
        : "Couldn't load your books. They'll retry when Home refreshes."));
    } else if (!data.books.length) {
      const link = el('a', 'now-capture__link', 'Open the Bookshelf →');
      link.href = '/knowledge/#bookshelf';
      host.append(el('span', 'now-capture__help', 'No book is marked as reading.'), link);
    } else {
      for (const book of data.books) {
        host.append(chip(book.label, state.book === book.label, () => {
          state.book = book.label;
          state.page = '';
          renderOptions();
        }, book.page ? `p. ${book.page}` : null));
      }
      const current = data.books.find(book => book.label === state.book);
      const pageLabel = el('label', 'now-capture__label', 'On page');
      pageLabel.htmlFor = 'now-capture-page';
      const page = el('input', 'now-capture__page');
      page.id = 'now-capture-page';
      page.inputMode = 'numeric';
      page.autocomplete = 'off';
      page.maxLength = 5;
      page.placeholder = current?.page ? String(current.page) : '—';
      page.value = state.page;
      page.addEventListener('input', () => {
        state.page = page.value.replace(/\D/g, '');
        page.value = state.page;
        syncSubmit();
      });
      host.append(el('span', 'now-capture__sep'), pageLabel, page);
    }
    syncSubmit();
  }

  function pageNumber() {
    const value = Number(state.page);
    return Number.isInteger(value) && value > 0 && value <= 20000 ? value : null;
  }

  function syncSubmit() {
    const submit = $('[data-now-submit]');
    if (!submit) return;
    const text = ($('[data-now-input]')?.value ?? '').trim();
    const ready = state.mode === 'book'
      ? Boolean(state.book && (text || pageNumber()))
      : Boolean(text);
    submit.disabled = state.busy || !ready;
  }

  function renderDay() {
    const track = $('[data-now-track]');
    const today = getToday();
    if (!track || !today) return;
    const nowMinutes = getNowMinutes();
    const next = data.curriculum ? upcomingLesson(data.curriculum, { date: today, nowMinutes }) : null;
    const nextDate = next && next.date !== today ? next.date : null;

    const tabs = $('[data-now-day-tabs]');
    if (tabs) {
      tabs.hidden = !nextDate;
      const nextTab = tabs.querySelector('[data-now-day="next"]');
      if (nextTab && nextDate) nextTab.textContent = formatLessonWhen({ date: nextDate, startTime: null }, today);
    }
    if (state.day === 'next' && !nextDate) state.day = 'today';
    for (const tab of root.querySelectorAll('[data-now-day]')) {
      const on = tab.dataset.nowDay === state.day;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }

    const date = state.day === 'next' ? nextDate : today;
    const isToday = date === today;
    const model = buildDayTimeline({
      events: getEvents(),
      tasks: visibleTasks(),
      date,
      nowMinutes: isToday ? nowMinutes : null,
      classCodes: classCodesFrom(data.curriculum)
    });
    const headline = $('[data-now-day-headline]');
    if (headline) headline.textContent = model.headline;
    const sub = $('[data-now-day-sub]');
    if (sub) sub.textContent = model.sub;

    const span = model.rangeEnd - model.rangeStart;
    const share = hours => `${((hours / span) * 100).toFixed(3)}%`;
    const pct = hour => share(hour - model.rangeStart);
    track.replaceChildren();
    track.style.setProperty('--now-lanes', String(model.lanes));
    track.style.setProperty('--now-hours', String(span));
    const field = el('div', 'now-day__field');
    if (isToday && model.nowHour > model.rangeStart) {
      const past = el('div', 'now-day__past');
      past.style.width = pct(Math.min(model.nowHour, model.rangeEnd));
      field.append(past);
    }
    for (const block of model.blocks) {
      const node = el('div', `now-block now-block--${block.tone}`);
      if (block.past) node.classList.add('is-past');
      if (block.done) node.classList.add('is-done');
      if (block.next) node.classList.add('is-next');
      const start = Math.max(block.start, model.rangeStart);
      node.style.left = pct(start);
      node.style.width = `calc(${share(block.end - start)} - 3px)`;
      node.style.setProperty('--lane', String(block.lane));
      const clock = `${formatClock(block.start)} to ${formatClock(block.end)}`;
      node.title = [block.title, block.meta || clock].filter(Boolean).join(' · ');
      node.append(el('b', null, block.title), el('span', null, block.meta || clock));
      field.append(node);
    }
    for (const pin of model.pins) {
      const node = el('span', 'now-pin');
      node.style.left = pct(pin.at);
      node.title = `Due ${formatClock(pin.at)}: ${pin.title}`;
      field.append(node);
    }
    if (isToday && model.nowHour >= model.rangeStart && model.nowHour <= model.rangeEnd) {
      const line = el('div', 'now-line');
      line.style.left = pct(model.nowHour);
      line.dataset.label = formatClock(model.nowHour);
      field.append(line);
    }
    if (!model.blocks.length && !model.pins.length) {
      field.append(el('p', 'now-day__empty', isToday ? 'Nothing on the calendar today.' : 'Nothing on the calendar.'));
    }
    const hours = el('div', 'now-day__hours');
    const step = span <= 10 ? 1 : 2;
    for (let hour = Math.ceil(model.rangeStart); hour <= model.rangeEnd; hour += step) {
      const tick = el('span', null, `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 || hour === 24 ? 'am' : 'pm'}`);
      tick.style.left = pct(hour);
      hours.append(tick);
    }
    const spoken = el('ul', 'sr-only');
    for (const block of model.blocks) spoken.append(el('li', null, `${formatClock(block.start)} to ${formatClock(block.end)}: ${block.title}`));
    track.append(field, hours, spoken);

    const card = $('[data-now-next]');
    if (card) {
      card.hidden = !(state.day === 'today' && nextDate);
      if (nextDate) {
        $('[data-now-next-when]').textContent = formatLessonWhen(next, today);
        $('[data-now-next-class]').textContent = next.classTitle;
        $('[data-now-next-lesson]').textContent = next.lessonTitle ? `Next lesson · ${next.lessonTitle}` : 'Next lesson';
      }
    }
  }

  function renderTasks() {
    const list = $('[data-now-task-list]');
    const summary = $('[data-now-task-summary]');
    const today = getToday();
    if (!list || !today) return;
    for (const button of root.querySelectorAll('[data-now-filter]')) {
      button.setAttribute('aria-pressed', String(button.dataset.nowFilter === state.filter));
    }
    list.replaceChildren();
    if (data.status.tasks !== 'ready' && !data.tasks.length) {
      const copy = data.status.tasks === 'loading'
        ? 'Checking your board…'
        : data.status.tasks === 'unbound'
          ? "The Tasks board isn't connected yet."
          : "Couldn't load your tasks. They'll retry when Home refreshes.";
      list.append(el('li', 'now-tasks__empty', copy));
      if (summary) summary.textContent = data.status.tasks === 'loading' ? 'Checking…' : '';
      return;
    }
    const rows = nowTasks(data.tasks, { today, domain: state.filter, limit: 5 });
    if (!rows.length) {
      const name = state.filter === 'all' ? '' : ` in ${NOW_TASK_DOMAINS.find(domain => domain.id === state.filter)?.label ?? 'this hub'}`;
      list.append(el('li', 'now-tasks__empty', `Nothing open${name}.`));
    }
    for (const row of rows) {
      const hold = holds.get(row.id);
      const item = el('li', 'now-task');
      item.dataset.taskId = row.id;
      if (hold) item.classList.add('is-done');
      if (row.id === freshTaskId) item.classList.add('is-fresh');
      const tick = el('button', 'now-task__tick');
      tick.type = 'button';
      tick.dataset.nowTick = row.id;
      tick.setAttribute('aria-pressed', String(Boolean(hold)));
      tick.setAttribute('aria-label', hold ? `Undo done: ${row.title}` : `Mark done: ${row.title}`);
      tick.disabled = Boolean(hold?.saving);
      tick.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
      const title = el('span', 'now-task__title', row.title);
      title.append(el('small', null, row.hub));
      item.append(tick, title);
      if (hold) {
        const undo = el('button', 'now-task__undo', 'Undo');
        undo.type = 'button';
        undo.dataset.nowTick = row.id;
        undo.disabled = Boolean(hold.saving);
        item.append(undo);
      } else if (row.due) {
        item.append(el('span', `now-task__due now-task__due--${row.tone}`, row.due));
      } else {
        item.append(el('span', 'now-task__due'));
      }
      list.append(item);
    }
    freshTaskId = null;
    if (summary) summary.textContent = formatTaskSummary(taskSummary(visibleTasks(), today));
  }

  function renderJumps() {
    const today = getToday();
    if (!today) return;
    const lines = hubJumpLines({
      curriculum: data.curriculum,
      tasks: data.status.tasks === 'ready' ? visibleTasks() : null,
      books: data.status.books === 'ready' ? data.books : null,
      meetingsThisWeek: getMeetingsThisWeek(),
      today,
      nowMinutes: getNowMinutes()
    });
    const fallback = status => (status === 'loading' ? 'Checking…' : status === 'unbound' ? 'Not connected yet' : "Couldn't load");
    const set = (key, text, status) => {
      const node = $(`[data-now-jump="${key}"]`);
      if (node) node.textContent = text ?? fallback(status);
    };
    set('teaching', lines.teaching, data.status.teaching);
    set('knowledge', lines.knowledge, data.status.books);
    set('tasks', lines.tasks, data.status.tasks);
    set('professional', lines.professional ?? 'People, meetings and PD', 'ready');
    const bar = $('[data-now-jump-bar]');
    if (bar) {
      bar.hidden = lines.readingProgress === null;
      bar.querySelector('i')?.style?.setProperty('width', `${Math.round((lines.readingProgress ?? 0) * 100)}%`);
    }
  }

  /* ---------------- Toast ---------------- */

  function toast(message, { tone = 'success', action = null } = {}) {
    const host = $('[data-now-toast]');
    if (!host) return 0;
    toastToken += 1;
    const token = toastToken;
    host.replaceChildren(el('span', null, message));
    host.dataset.tone = tone;
    if (action?.href) {
      const link = el('a', null, action.label);
      link.href = action.href;
      host.append(link);
    } else if (action?.onClick) {
      const button = el('button', null, action.label);
      button.type = 'button';
      button.addEventListener('click', action.onClick);
      host.append(button);
    }
    host.hidden = false;
    if (toastTimer) clearTimer(toastTimer);
    toastTimer = setTimer(() => {
      if (token === toastToken) host.hidden = true;
    }, tone === 'error' ? ERROR_TOAST_MS : TOAST_MS);
    return token;
  }

  /* ---------------- Actions ---------------- */

  function setBusy(busy) {
    state.busy = busy;
    const input = $('[data-now-input]');
    if (input) input.readOnly = busy;
    syncSubmit();
  }

  async function submit() {
    const input = $('[data-now-input]');
    const text = (input?.value ?? '').trim();
    if (state.busy) return;
    if (state.mode === 'task') return addTask(text, input);
    if (state.mode === 'note') return saveNote(text, input);
    return logBook(text, input);
  }

  async function addTask(title, input) {
    if (!title || !tasksApi?.createTask) return;
    const today = getToday();
    const dueDate = state.due === 'today' ? today : state.due === 'tomorrow' ? addDays(today, 1) : null;
    setBusy(true);
    try {
      const created = await tasksApi.createTask({ title, domain: state.domain, due_date: dueDate });
      data.tasks = [created, ...data.tasks.filter(task => task.id !== created.id)];
      if (state.filter !== 'all' && state.filter !== created.domain) state.filter = 'all';
      freshTaskId = created.id;
      if (input) input.value = '';
      onTasksChanged([created]);
      renderTasks();
      renderDay();
      renderJumps();
      toast(`Added to Tasks${dueDate ? ` · due ${state.due}` : ''}.`, {
        action: { label: 'Undo', onClick: () => void removeTask(created) }
      });
    } catch (error) {
      toast(`Couldn't add the task: ${failureReason(error)}. Your text is still in the box.`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(task) {
    try {
      await tasksApi.deleteTask(task.id);
      data.tasks = data.tasks.filter(item => item.id !== task.id);
      onTasksChanged([{ ...task, status: 'dead' }]);
      renderTasks();
      renderDay();
      renderJumps();
      toast('Removed from Tasks.');
    } catch (error) {
      toast(`Couldn't remove it: ${failureReason(error)}. Delete it on the board instead.`, {
        tone: 'error',
        action: { label: 'Open the board', href: '/tasks/' }
      });
    }
  }

  async function saveNote(body, input) {
    if (!body || !knowledgeApi?.createPage) return;
    const title = body.split('\n')[0].slice(0, 80).trim() || 'Quick note';
    const useClementine = state.clementine;
    setBusy(true);
    let saved;
    try {
      saved = await knowledgeApi.createPage({ title, body });
    } catch (error) {
      toast(`Couldn't save the note: ${failureReason(error)}. Your text is still in the box.`, { tone: 'error' });
      setBusy(false);
      return;
    }
    if (input) input.value = '';
    setBusy(false);
    const open = saved?.id ? { label: 'Open note', href: `/knowledge/#page/${encodeURIComponent(saved.id)}` } : null;
    if (!useClementine || !saved?.id || !knowledgeApi.tidyPage) {
      toast('Saved to your notes.', { action: open });
      return;
    }
    // The save is done; filing runs after it and only updates the message (I9).
    const token = toast('Saved. Clementine is filing it…', { action: open });
    try {
      await knowledgeApi.tidyPage(saved.id);
      if (token === toastToken) toast('Saved and filed by Clementine.', { action: open });
    } catch {
      if (token === toastToken) toast("Saved. Clementine couldn't file it, so it's in your notes as written.", { action: open });
    }
  }

  async function logBook(text, input) {
    const book = data.books.find(item => item.label === state.book);
    const page = pageNumber();
    if (!book || (!text && !page) || !knowledgeApi?.updateShelf) return;
    setBusy(true);
    const done = [];
    try {
      if (page) {
        await knowledgeApi.updateShelf({ op: 'book', book: { label: book.label, reading: { page } } });
        book.page = page;
        done.push(`now on p. ${page}`);
      }
      if (text) {
        const title = text.split('\n')[0].slice(0, 80).trim() || book.label;
        const saved = await knowledgeApi.createPage({ title, body: text, origins: [{ kind: 'book', label: book.label }] });
        const at = page ?? book.page;
        if (at && saved?.id) {
          await knowledgeApi.updateShelf({ op: 'place', placements: [{ pageId: saved.id, page: at }] });
          done.push(`note placed at p. ${at}`);
        } else {
          done.push('note saved');
        }
        if (input) input.value = '';
      }
      state.page = '';
      renderOptions();
      renderJumps();
      toast(`${book.label}: ${done.join(', ')}.`, { action: { label: 'Open book', href: bookHref(book.label) } });
    } catch (error) {
      const partial = done.length ? ` (${done.join(', ')} did save)` : '';
      toast(`Couldn't finish logging ${book.label}: ${failureReason(error)}${partial}.`, { tone: 'error' });
      renderOptions();
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(id) {
    const hold = holds.get(id);
    if (hold) return undoDone(id, hold);
    const task = data.tasks.find(item => item.id === id);
    if (!task || !tasksApi?.setTaskStatus) return;
    const next = { prev: task.status || 'open', saving: true, timer: null };
    holds.set(id, next);
    renderTasks();
    renderDay();
    try {
      const saved = await tasksApi.setTaskStatus(id, 'done');
      next.saving = false;
      onTasksChanged([saved ?? { ...task, status: 'done' }]);
      next.timer = setTimer(() => {
        holds.delete(id);
        data.tasks = data.tasks.filter(item => item.id !== id);
        renderTasks();
        renderJumps();
      }, HOLD_MS);
      renderTasks();
      renderJumps();
    } catch (error) {
      holds.delete(id);
      renderTasks();
      renderDay();
      toast(`Couldn't mark “${task.title}” done: ${failureReason(error)}.`, { tone: 'error' });
    }
  }

  async function undoDone(id, hold) {
    if (hold.saving) return;
    if (hold.timer) clearTimer(hold.timer);
    hold.saving = true;
    renderTasks();
    try {
      const restored = await tasksApi.setTaskStatus(id, hold.prev);
      holds.delete(id);
      data.tasks = data.tasks.map(item => (item.id === id ? { ...item, ...restored } : item));
      onTasksChanged([restored ?? { ...data.tasks.find(item => item.id === id) }]);
    } catch (error) {
      hold.saving = false;
      hold.timer = setTimer(() => {
        holds.delete(id);
        data.tasks = data.tasks.filter(item => item.id !== id);
        renderTasks();
      }, HOLD_MS);
      toast(`Couldn't undo: ${failureReason(error)}. Reopen it on the board.`, {
        tone: 'error',
        action: { label: 'Open the board', href: '/tasks/' }
      });
    }
    renderTasks();
    renderDay();
    renderJumps();
  }

  function setMode(mode, { focus = false } = {}) {
    if (!MODES.includes(mode)) return;
    state.mode = mode;
    renderOptions();
    if (focus) root.querySelector(`[data-now-mode="${mode}"]`)?.focus();
  }

  /* ---------------- Wiring ---------------- */

  function wire() {
    if (!panel || panel.dataset.nowBound === 'true') return;
    panel.dataset.nowBound = 'true';
    bind(panel, 'click', event => {
      const mode = event.target.closest?.('[data-now-mode]');
      if (mode) {
        setMode(mode.dataset.nowMode);
        $('[data-now-input]')?.focus();
        return;
      }
      const tick = event.target.closest?.('[data-now-tick]');
      if (tick) {
        void toggleTask(tick.dataset.nowTick);
        return;
      }
      const filter = event.target.closest?.('[data-now-filter]');
      if (filter) {
        state.filter = filter.dataset.nowFilter;
        renderTasks();
        return;
      }
      const day = event.target.closest?.('[data-now-day]');
      if (day) {
        state.day = day.dataset.nowDay;
        renderDay();
      }
    });
    bind($('[data-now-modes]'), 'keydown', event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      setMode(MODES[(MODES.indexOf(state.mode) + step + MODES.length) % MODES.length], { focus: true });
    });
    bind($('[data-now-day-tabs]'), 'keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      state.day = state.day === 'today' ? 'next' : 'today';
      renderDay();
      root.querySelector(`[data-now-day="${state.day}"]`)?.focus();
    });
    bind($('[data-now-input]'), 'input', () => syncSubmit());
    bind($('[data-now-capture]'), 'submit', event => {
      event.preventDefault?.();
      void submit();
    });
    bind(doc, 'keydown', event => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag = String(target?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      if (!isVisible()) return;
      event.preventDefault();
      $('[data-now-input]')?.focus();
    });
    minuteTimer = setRepeat(() => {
      if (isVisible()) renderDay();
    }, 60_000);
  }

  function destroy() {
    if (minuteTimer) clearRepeat(minuteTimer);
    minuteTimer = null;
    if (panel) delete panel.dataset.nowBound;
    if (toastTimer) clearTimer(toastTimer);
    for (const hold of holds.values()) if (hold.timer) clearTimer(hold.timer);
  }

  wire();
  render();

  return { load, render, renderDay, renderJumps, destroy, _state: state, _data: data };
}
