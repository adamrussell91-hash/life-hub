// Generated from apps/teaching/src/games/core/room-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/games/core/room-rules.ts
var registry = /* @__PURE__ */ new Map();
function registerRules(rules) {
  registry.set(rules.kind, rules);
}
function rulesFor(kind) {
  return registry.get(kind);
}

// apps/teaching/src/games/kinds/articulate/rules.ts
var ARTICULATE_KIND = "articulate";
function articulateSettings(s) {
  const num = (v, d, lo, hi) => typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d;
  return { seconds: num(s?.seconds, 45, 30, 60), passes: num(s?.passes, 2, 0, 3), quick_check: s?.quick_check !== false, quick_check_items: num(s?.quick_check_items, 4, 3, 5) };
}
function cardsOf(keys) {
  const live2 = keys.live?.cards ?? {};
  const out = [];
  for (const [id, key] of Object.entries(keys.items)) {
    if (key.shape !== "term") continue;
    const extra = live2?.[id];
    const def = extra?.clues.find((c) => c.kind === "definition")?.text;
    const ex = extra?.clues.find((c) => c.kind === "example")?.text;
    out.push({ id, term: key.label || key.answers[0] || "", banned: extra?.banned ?? [], ...def ? { definition: def } : {}, ...ex ? { example: ex } : {} });
  }
  return out.filter((c) => c.term);
}
var cardMap = (keys) => new Map(cardsOf(keys).map((c) => [c.id, c]));
function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function teamsOf(ctx) {
  const t = ctx.teams();
  return t.length ? t : [0];
}
function membersOf(ctx, team) {
  if (ctx.teams().length) return ctx.members(team).filter((o) => ctx.seat(o));
  return ctx.seats().map((s) => s.owner);
}
var teamOf = (ctx, owner) => ctx.teams().length ? ctx.seat(owner)?.team : 0;
function captainOf(ctx, team) {
  const list = membersOf(ctx, team);
  return list.find((o) => ctx.seat(o)?.connected) ?? list[0];
}
function nextDescriber(ctx, k, team) {
  const list = membersOf(ctx, team);
  if (!list.length) return void 0;
  const start = (k.rot[team] ?? 0) % list.length;
  for (let i = 0; i < list.length; i++) {
    const o = list[(start + i) % list.length];
    if (ctx.seat(o)?.connected) return o;
  }
  return list[start];
}
var isCaptainAgainst = (ctx, k, owner) => {
  if (!k.turn || k.phase !== "turn" || !ctx.teams().length) return false;
  const team = teamOf(ctx, owner);
  return team !== void 0 && team !== k.turn.team && captainOf(ctx, team) === owner;
};
var err = (code, message) => ({ error: { code, message } });
function draw(ctx, k) {
  const next = k.deck.shift() ?? null;
  k.current = next;
  k.card_at = ctx.now;
  if (next && !k.seen.includes(next)) k.seen.push(next);
  if (!next) endTurn(ctx, k, "deck");
}
function endTurn(ctx, k, why) {
  if (k.phase !== "turn" || !k.turn) return;
  if (k.current) k.deck.unshift(k.current);
  k.current = null;
  k.turn.why = why;
  k.log.push({ ...k.turn, cards: [...k.turn.cards], round: k.round });
  k.rot[k.turn.team] = (k.rot[k.turn.team] ?? 0) + 1;
  k.phase = "end";
  ctx.setTimer(void 0);
  const got = k.turn.cards.filter((c) => c.result === "got").length;
  ctx.ticker(got ? `+${got} card${got === 1 ? "" : "s"}` : "no cards this time");
}
function startTurn(ctx, k) {
  if (k.phase !== "ready") return err("not_now", "Wait for the next turn.");
  const team = k.order[k.at] ?? 0;
  const describer = nextDescriber(ctx, k, team);
  if (!describer) return err("no_describer", "This team has nobody to describe.");
  if (!k.deck.length) return err("deck_empty", "The deck is empty.");
  k.phase = "turn";
  k.turn = { team, describer, cards: [], passes: 0 };
  ctx.setTimer(ctx.now + articulateSettings(ctx.game.settings).seconds * 1e3);
  draw(ctx, k);
}
function resolve(ctx, k, result, by) {
  if (!k.turn || !k.current) return;
  const item = k.current;
  const ms = Math.max(0, ctx.now - k.card_at);
  k.turn.cards.push({ item, result, ms });
  const describer = k.turn.describer;
  const team = k.turn.team;
  if (result === "got") {
    ctx.addTeamScore(team, 1);
    ctx.addScore(describer, 1);
    ctx.record(describer, { item, move: "describe", response: { result: "got" }, time_ms: ms, extra: { result: "got", team }, strength: "live_team" });
  } else if (result === "pass") {
    k.turn.passes += 1;
    k.deck.push(item);
    ctx.record(describer, { item, move: "pass", response: { result: "pass" }, time_ms: ms, extra: { result: "pass", team }, strength: "live_team" });
  } else {
    ctx.record(describer, { item, move: "buzz", response: { result: "buzz" }, time_ms: ms, extra: { result: "buzz", team, by: by ?? "teacher" }, strength: "live_team" });
  }
  draw(ctx, k);
}
var OPTION_IDS = ["a", "b", "c", "d"];
function buildCheck(ctx, k) {
  const s = articulateSettings(ctx.game.settings);
  const cards = cardsOf(ctx.keys);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const askable = (c) => !!c && (!!c.definition || !!c.example);
  const picks = [];
  for (const id of k.seen) {
    const c = byId.get(id);
    if (askable(c) && !picks.includes(c)) picks.push(c);
  }
  if (picks.length < 3) {
    for (const c of shuffle(cards, ctx.random)) if (picks.length < 3 && askable(c) && !picks.includes(c)) picks.push(c);
  }
  const out = [];
  for (const c of picks) {
    if (out.length >= s.quick_check_items) break;
    const kind = c.definition ? "definition" : "example";
    const right = kind === "definition" ? c.definition : c.example;
    const others = shuffle(
      cards.filter((o) => o.id !== c.id && (kind === "definition" ? o.definition : o.example) && (kind === "definition" ? o.definition : o.example) !== right),
      ctx.random
    ).slice(0, 3);
    if (others.length < 2) continue;
    const pool = shuffle([{ card: c.id, text: right }, ...others.map((o) => ({ card: o.id, text: kind === "definition" ? o.definition : o.example }))], ctx.random);
    const options = pool.map((p, i) => ({ id: OPTION_IDS[i], text: p.text }));
    const from = Object.fromEntries(pool.map((p, i) => [OPTION_IDS[i], p.card]));
    const why = kind === "definition" ? c.example : c.definition;
    out.push({ item: c.id, term: c.term, kind, options, right: OPTION_IDS[pool.findIndex((p) => p.card === c.id)], from, ...why ? { why } : {} });
  }
  return out;
}
function startCheck(ctx, k) {
  if (k.phase === "turn") endTurn(ctx, k, "ended");
  const s = articulateSettings(ctx.game.settings);
  const questions = s.quick_check ? buildCheck(ctx, k) : [];
  k.check = { questions, answers: {}, revealed: !questions.length };
  k.phase = questions.length ? "check" : "checked";
  ctx.setTimer(void 0);
}
function checkStats(ctx, k) {
  const qs = k.check?.questions ?? [];
  const students = ctx.seats().map((s) => s.owner);
  return qs.map((q, i) => {
    const answered = students.filter((o) => k.check?.answers[o]?.[i]);
    const right = answered.filter((o) => k.check?.answers[o]?.[i]?.correct).length;
    return { answered: answered.length, right, pct: answered.length ? Math.round(right / answered.length * 100) : 0 };
  });
}
var articulateRules = {
  kind: ARTICULATE_KIND,
  teams: { min: 2, max: 4, default: 4 },
  init(ctx) {
    return { phase: "ready", round: 0, order: [], at: 0, deck: [], current: null, card_at: 0, turn: null, log: [], seen: [], rot: {}, check: null };
  },
  start(ctx, k) {
    k.order = teamsOf(ctx);
    k.deck = shuffle(
      cardsOf(ctx.keys).map((c) => c.id),
      ctx.random
    );
    k.phase = "ready";
  },
  move(ctx, k, owner, e) {
    if (e.move === "answer") {
      if (k.phase !== "check" || !k.check) return err("not_now", "The quick check isn\u2019t open.");
      const index = k.check.questions.findIndex((q2) => q2.item === e.item);
      const q = k.check.questions[index];
      if (!q) return err("bad_item", "That isn\u2019t in this quick check.");
      const mine = k.check.answers[owner] ??= {};
      if (mine[index]) return { item: e.item, correct: mine[index].correct };
      const option = typeof e.response?.option === "string" ? e.response.option : "";
      const picked = q.from[option];
      if (!picked) return err("bad_option", "Pick one of the answers.");
      const pickedTerm = cardMap(ctx.keys).get(picked)?.term ?? "";
      const marked = ctx.mark(owner, { item: q.item, move: "answer", response: { text: pickedTerm }, ...e.time_ms !== void 0 ? { time_ms: e.time_ms } : {}, extra: { check: q.kind, option, ...picked !== q.item ? { picked } : {} } }, "live_solo");
      if ("error" in marked) return marked;
      const correct = marked.result.correct === true;
      mine[index] = { option, correct };
      if (correct) ctx.addScore(owner, 1);
      const answeredAll = k.check.questions.every((_, i) => mine[i]);
      ctx.setProgress(owner, { done: Object.keys(mine).length, total: k.check.questions.length });
      if (answeredAll) ctx.ticker("finished the quick check", ctx.seat(owner)?.initials);
      return { item: q.item, correct };
    }
    if (e.move === "describe" || e.move === "pass") {
      if (k.phase !== "turn" || !k.turn) return err("not_now", "Wait for your turn.");
      if (k.turn.describer !== owner) return err("not_describer", "Only the describer can do that.");
      if (!k.current || e.item !== k.current) return err("stale", "That card has changed.");
      const result = e.move === "pass" ? "pass" : e.response?.result === "pass" ? "pass" : "got";
      if (result === "pass" && k.turn.passes >= articulateSettings(ctx.game.settings).passes) return err("no_passes", "No passes left this turn.");
      resolve(ctx, k, result);
      return { item: e.item };
    }
    if (e.move === "buzz") {
      const out = buzz(ctx, k, { owner, role: "student" }, e.item);
      return out ? out : { item: e.item };
    }
    return err("bad_move", "That move isn\u2019t part of Articulate.");
  },
  control(ctx, k, op, from) {
    const staff = from.role === "teacher" || from.role === "board";
    if (op.name === "buzz") {
      const item = typeof op.data?.item === "string" ? op.data.item : void 0;
      return buzz(ctx, k, from, item) ?? void 0;
    }
    if (!staff) return err("not_allowed", "Only your teacher can do that.");
    switch (op.name) {
      case "start_turn":
        return startTurn(ctx, k);
      case "end_turn":
        if (k.phase !== "turn") return err("not_now", "No turn is running.");
        endTurn(ctx, k, "ended");
        return;
      case "next":
      case "next_turn": {
        if (k.phase !== "end") return err("not_now", "Finish this turn first.");
        if (k.at + 1 >= k.order.length) return startCheck(ctx, k);
        k.at += 1;
        k.turn = null;
        k.phase = "ready";
        return;
      }
      case "check":
        if (k.phase !== "ready" && k.phase !== "end" && k.phase !== "turn") return err("not_now", "The quick check is already open.");
        startCheck(ctx, k);
        return;
      case "reveal":
      case "reveal_check":
        if (k.phase !== "check" || !k.check) return err("not_now", "Open the quick check first.");
        k.check.revealed = true;
        k.phase = "checked";
        return;
      case "next_round": {
        if (k.phase !== "checked") return err("not_now", "Finish the quick check first.");
        k.round += 1;
        k.at = 0;
        k.turn = null;
        k.seen = [];
        k.check = null;
        k.order = teamsOf(ctx);
        if (!k.deck.length) k.deck = shuffle(cardsOf(ctx.keys).map((c) => c.id), ctx.random);
        k.phase = "ready";
        return;
      }
      case "final":
        ctx.end();
        return;
      default:
        return err("bad_control", "Unknown control.");
    }
  },
  tick(ctx, k) {
    if (k.phase === "turn") endTurn(ctx, k, "time");
  },
  finish(ctx, k) {
    if (k.phase === "turn") endTurn(ctx, k, "ended");
  },
  view(ctx, k, role, owner) {
    return articulateView(ctx, k, role, owner);
  }
};
function buzz(ctx, k, from, item) {
  const staff = from.role === "teacher" || from.role === "board";
  if (!staff && !isCaptainAgainst(ctx, k, from.owner)) return err("not_allowed", "Only the other teams\u2019 captains can buzz.");
  if (k.phase !== "turn" || !k.current) return err("not_now", "No card to buzz.");
  if (item && item !== k.current) return err("stale", "That card has gone.");
  resolve(ctx, k, "buzz", staff ? "teacher" : "captain");
  return null;
}
var initialsOf = (ctx, owner) => owner ? ctx.seat(owner)?.initials ?? "" : "";
function publicCards(ctx, cards) {
  const map = cardMap(ctx.keys);
  return cards.map((c) => ({ item: c.item, term: map.get(c.item)?.term ?? "", result: c.result }));
}
function articulateView(ctx, k, role, owner) {
  const s = articulateSettings(ctx.game.settings);
  const team = k.turn?.team ?? k.order[k.at] ?? 0;
  const turnCards = k.turn?.cards ?? [];
  if (role !== "student") {
    const describer = k.turn?.describer ?? (k.phase === "ready" ? nextDescriber(ctx, k, team) : void 0);
    const stats = k.check ? checkStats(ctx, k) : [];
    const avg = stats.length ? Math.round(stats.reduce((a, x) => a + x.pct, 0) / stats.length) : void 0;
    const hardest = stats.length ? stats.findIndex((x) => x.pct === Math.min(...stats.map((y) => y.pct))) : void 0;
    const view3 = {
      who: "board",
      phase: k.phase,
      round: k.round,
      order: k.order,
      at: k.at,
      team,
      ...describer ? { describer: initialsOf(ctx, describer) } : {},
      guessers: membersOf(ctx, team).filter((o) => o !== describer).map((o) => initialsOf(ctx, o)),
      cards: publicCards(ctx, turnCards),
      dealt: turnCards.length + (k.current ? 1 : 0),
      ...k.turn?.why ? { why: k.turn.why } : {},
      ...k.at + 1 < k.order.length ? { next_team: k.order[k.at + 1] } : {},
      last_turn: k.at + 1 >= k.order.length,
      deck_left: k.deck.length + (k.current ? 1 : 0),
      seconds: s.seconds,
      ...k.check ? {
        check: {
          questions: k.check.questions.map((q, i) => ({ term: q.term, kind: q.kind, answered: stats[i]?.answered ?? 0, ...k.check?.revealed ? { pct: stats[i]?.pct ?? 0 } : {} })),
          seats: ctx.seats().length,
          revealed: k.check.revealed,
          ...k.check.revealed && avg !== void 0 ? { avg, hardest } : {}
        }
      } : {}
    };
    if (role === "teacher" && (k.phase === "checked" || k.phase === "check")) {
      view3.describers = k.log.map((t) => {
        const n = (r) => t.cards.filter((c) => c.result === r).length;
        return {
          initials: initialsOf(ctx, t.describer),
          team: t.team,
          got: n("got"),
          passed: n("pass"),
          buzzed: n("buzz"),
          avg_s: t.cards.length ? Math.round(t.cards.reduce((a, c) => a + c.ms, 0) / t.cards.length / 1e3) : 0,
          terms: publicCards(ctx, t.cards)
        };
      });
    }
    return view3;
  }
  const myTeam = teamOf(ctx, owner);
  const describing = k.phase === "turn" && k.turn?.describer === owner;
  const captain = isCaptainAgainst(ctx, k, owner);
  const myRole = describing ? "describer" : captain ? "captain" : myTeam === team ? "team" : "watch";
  const cardMapNow = k.current && (describing || captain) ? cardMap(ctx.keys).get(k.current) : void 0;
  const lastTurn = k.log[k.log.length - 1];
  const upNext = k.phase === "ready" && nextDescriber(ctx, k, team) === owner;
  const view2 = {
    who: "phone",
    phase: k.phase,
    round: k.round,
    ...myTeam !== void 0 ? { my_team: myTeam } : {},
    team,
    ...k.turn?.describer || k.phase === "ready" ? { describer: initialsOf(ctx, k.turn?.describer ?? nextDescriber(ctx, k, team)) } : {},
    role: myRole,
    ...cardMapNow ? { card: { item: cardMapNow.id, term: cardMapNow.term, banned: cardMapNow.banned } } : {},
    got: turnCards.filter((c) => c.result === "got").length,
    passes: s.passes,
    passes_left: Math.max(0, s.passes - (k.turn?.passes ?? 0)),
    up_next: upNext,
    ...lastTurn && (k.phase === "end" || k.phase === "ready") ? { last: { team: lastTurn.team, describer: initialsOf(ctx, lastTurn.describer), mine: lastTurn.describer === owner, cards: publicCards(ctx, lastTurn.cards) } } : {}
  };
  if (k.check) {
    const mine = k.check.answers[owner] ?? {};
    view2.check = {
      revealed: k.check.revealed,
      questions: k.check.questions.map((q, i) => {
        const a = mine[i];
        return { item: q.item, term: q.term, kind: q.kind, options: q.options, ...a ? { answer: { ...a, right: q.right, ...q.why ? { why: q.why } : {} } } : {} };
      })
    };
    if (k.phase === "checked") {
      view2.mine = {
        described: k.log.filter((t) => t.describer === owner).reduce((a, t) => a + t.cards.filter((c) => c.result === "got").length, 0),
        check_right: Object.values(mine).filter((a) => a.correct).length,
        check_of: k.check.questions.length
      };
    }
  }
  return view2;
}
registerRules(articulateRules);

// apps/teaching/src/games/kinds/jeopardy/shared.ts
var TEAM_NAMES = ["Kestrels", "Otters", "Foxes", "Herons", "Wrens", "Magpies"];
var teamName = (team) => TEAM_NAMES[team % TEAM_NAMES.length] ?? `Team ${team + 1}`;
var round10 = (n) => Math.round(n / 10) * 10 || 0;
var choicesOf = (q) => {
  const r = q;
  for (const k of ["options", "segments", "items", "labels", "right"]) if (Array.isArray(r[k])) return r[k];
  return [];
};
function answerText(item, key) {
  if (!key) return "";
  if (key.shape === "term") return key.label || key.answers[0] || "";
  if (key.shape === "quote") return key.speaker_name || key.speaker;
  if (key.shape === "wall") return key.label;
  const q = item?.shape === "question" ? item.question : null;
  const a = key.key.answer;
  const opts = q ? choicesOf(q) : [];
  const text = (id) => opts.find((o) => o.id === id)?.text ?? "";
  switch (a.type) {
    case "choice":
      return a.ids.map(text).filter(Boolean).join(" \xB7 ");
    case "boolean":
      return a.value ? "True" : "False";
    case "text":
      return a.accepted[0] ?? "";
    case "gaps":
      return Object.values(a.gaps).map((g) => g[0] ?? "").join(" \xB7 ");
    case "order":
      return a.ids.map(text).filter(Boolean).join(" \u2192 ");
    case "map": {
      const all = q ? [...choicesOf(q), ...q.left ?? [], ...q.groups ?? []] : [];
      const t = (id) => all.find((o) => o.id === id)?.text ?? id;
      return Object.entries(a.map).map(([k, v]) => `${t(k)} \u2192 ${t(v)}`).join(" \xB7 ");
    }
    case "spots": {
      const words2 = a.passage.split(/\s+/).filter(Boolean);
      return a.targets.map((s) => words2.slice(s.from, s.to + 1).join(" ")).join(" \xB7 ");
    }
    default:
      return "";
  }
}
function singleChoice(item, key) {
  if (!item || item.shape !== "question" || key?.shape !== "question" || key.key.answer.type !== "choice" || key.key.answer.ids.length !== 1) return null;
  const opts = choicesOf(item.question);
  const rightId = key.key.answer.ids[0];
  const right = opts.find((o) => o.id === rightId)?.text;
  if (!right) return null;
  return { right, others: opts.filter((o) => o.id !== rightId).map((o) => o.text) };
}

// apps/teaching/src/games/kinds/jeopardy/rules.ts
var WAGER_SECONDS = 30;
var MIN_WAGER = 100;
var err2 = (code, message) => ({ error: { code, message } });
function content(ctx) {
  return { items: ctx.keys.live?.items ?? [], jeopardy: ctx.keys.live?.jeopardy };
}
var itemOf = (ctx, id) => content(ctx).items.find((i) => i.id === id);
var tiles = (ctx) => (content(ctx).jeopardy?.categories ?? []).flatMap((c) => c.tiles.map((t) => ({ ...t, cat: c.id, cat_title: c.title })));
var tileOf = (ctx, id) => tiles(ctx).find((t) => t.id === id);
var topValue = (ctx) => Math.max(500, ...tiles(ctx).map((t) => t.value));
var seconds = (ctx) => Number(ctx.game.settings?.seconds) || 30;
var bonus = (ctx) => Number(ctx.game.settings?.picker_bonus) || 1.5;
var connected = (ctx, owner) => !!ctx.seat(owner)?.connected;
function order(ctx, k) {
  for (const t of ctx.teams()) if (!k.order.includes(t)) k.order.push(t);
  return k.order.filter((t) => ctx.members(t).length > 0);
}
function pickingTeam(ctx, k) {
  const o = order(ctx, k);
  return o.length ? o[k.turn % o.length] : null;
}
function captainOf2(ctx, k, team) {
  const live2 = ctx.members(team).filter((o) => connected(ctx, o));
  if (!live2.length) return null;
  return live2[(k.picks[team] ?? 0) % live2.length];
}
function tileGain(opts) {
  const { value, n, r, answered, pick: pick2, wager } = opts;
  if (!n || !answered) return 0;
  if (pick2 && wager !== void 0) return round10(wager * (2 * r - n) / n);
  return round10(value * (r / n) * (pick2 ? opts.bonus : 1));
}
function counted(ctx, team, answers) {
  return ctx.members(team).filter((o) => connected(ctx, o) || answers[o]);
}
function results(ctx, k, answers, score) {
  return order(ctx, k).map((team) => {
    const who = counted(ctx, team, answers);
    const r = who.filter((o) => answers[o]?.correct).length;
    const answered = who.filter((o) => answers[o]).length;
    return score(team, who.length, r, answered);
  });
}
function everyoneIn(ctx, answers) {
  const live2 = ctx.seats().filter((s) => s.connected && s.team !== void 0);
  return live2.length > 0 && live2.every((s) => answers[s.owner]);
}
function openClue(ctx, k) {
  const cur = k.cur;
  if (!cur) return;
  k.phase = "clue";
  cur.opened_at = ctx.now;
  cur.ends_at = ctx.now + seconds(ctx) * 1e3;
  ctx.setTimer(cur.ends_at);
}
function close(ctx, k) {
  if (k.phase === "clue") k.phase = "closed";
  else if (k.phase === "final_clue") k.phase = "final_closed";
  else return;
  ctx.setTimer(void 0);
}
function reveal(ctx, k) {
  const cur = k.cur;
  if (!cur || k.phase !== "closed" && k.phase !== "clue") return;
  close(ctx, k);
  cur.results = results(ctx, k, cur.answers, (team, n, r, answered) => {
    const pick2 = team === cur.team;
    const wager = pick2 && cur.double ? cur.wager ?? 0 : void 0;
    return { team, n, r, pick: pick2, gain: tileGain({ value: cur.value, n, r, answered, pick: pick2, bonus: bonus(ctx), ...wager !== void 0 ? { wager } : {} }), ...wager !== void 0 ? { wager } : {} };
  });
  for (const x of cur.results) if (x.gain) ctx.addTeamScore(x.team, x.gain);
  const best = [...cur.results].sort((a, b) => b.gain - a.gain)[0];
  k.used[cur.tile] = best && best.gain > 0 ? { team: best.team, gain: best.gain } : { team: null, gain: 0 };
  const right = Object.values(cur.answers).filter((a) => a.correct).length;
  k.tally[cur.tile] = { right, answered: Object.keys(cur.answers).length };
  for (const [o, a] of Object.entries(cur.answers)) {
    if (!a.correct) continue;
    const row = k.ceil[o] ??= {};
    row[cur.cat] = Math.max(row[cur.cat] ?? 0, cur.value);
  }
  if (best && best.gain > 0) ctx.ticker(`${teamName(best.team)} +${best.gain}`);
  k.phase = "revealed";
}
function backToBoard(ctx, k) {
  if (k.phase !== "revealed" || !k.cur) return;
  k.picks[k.cur.team] = (k.picks[k.cur.team] ?? 0) + 1;
  k.turn += 1;
  k.cur = null;
  k.aim = null;
  k.phase = "pick";
  if (tiles(ctx).every((t) => k.used[t.id])) {
    if (content(ctx).jeopardy?.final && itemOf(ctx, content(ctx).jeopardy?.final)) startFinal(ctx, k);
    else k.phase = "done";
  }
}
function pick(ctx, k, tileId) {
  if (k.phase !== "pick") return err2("not_now", "Pick when the board is showing.");
  const t = tileOf(ctx, tileId);
  if (!t) return err2("bad_tile", "That tile isn\u2019t on the board.");
  if (k.used[t.id]) return err2("used", "That tile has been played.");
  const team = pickingTeam(ctx, k);
  if (team === null) return err2("no_team", "No team is ready to pick.");
  k.aim = null;
  k.cur = { tile: t.id, item: t.item, cat: t.cat, value: t.value, double: t.double, team, answers: {} };
  if (t.double) {
    k.phase = "wager";
    k.cur.max_wager = Math.max(ctx.teamScore(team), topValue(ctx));
    ctx.setTimer(ctx.now + WAGER_SECONDS * 1e3);
  } else openClue(ctx, k);
}
function clampWager(n, max, min = MIN_WAGER) {
  const v = Math.round(Number(n) / 10) * 10;
  const lo = Math.min(min, max);
  return Number.isFinite(v) ? Math.max(lo, Math.min(max, v)) : lo;
}
function startFinal(ctx, k) {
  const id = content(ctx).jeopardy?.final;
  if (!id) return;
  k.cur = null;
  k.final = { item: id, wagers: {}, answers: {}, shown: 0 };
  k.phase = "final_wager";
  ctx.setTimer(ctx.now + WAGER_SECONDS * 1e3);
}
var finalMax = (ctx, team) => Math.max(0, ctx.teamScore(team));
function finalWagersIn(ctx, k) {
  return order(ctx, k).every((t) => k.final?.wagers[t] !== void 0 || captainOf2(ctx, k, t) === null);
}
function openFinal(ctx, k) {
  const f = k.final;
  if (!f) return;
  for (const t of order(ctx, k)) if (f.wagers[t] === void 0) f.wagers[t] = 0;
  k.phase = "final_clue";
  f.opened_at = ctx.now;
  f.ends_at = ctx.now + seconds(ctx) * 1e3;
  ctx.setTimer(f.ends_at);
}
function revealFinalNext(ctx, k) {
  const f = k.final;
  if (!f) return;
  if (k.phase === "final_clue") close(ctx, k);
  if (k.phase === "final_closed") {
    f.results = results(ctx, k, f.answers, (team, n, r, answered) => {
      const wager = f.wagers[team] ?? 0;
      return { team, n, r, pick: true, wager, gain: tileGain({ value: 0, n, r, answered, pick: true, bonus: 1, wager }) };
    });
    f.results.sort((a, b) => ctx.teamScore(a.team) - ctx.teamScore(b.team));
    k.phase = "final_reveal";
    k.tally[f.item] = { right: Object.values(f.answers).filter((a) => a.correct).length, answered: Object.keys(f.answers).length };
  }
  if (k.phase !== "final_reveal" || !f.results) return;
  const next = f.results[f.shown];
  if (!next) {
    k.phase = "done";
    return;
  }
  if (next.gain) ctx.addTeamScore(next.team, next.gain);
  ctx.ticker(`${teamName(next.team)} ${next.gain >= 0 ? "+" : "\u2212"}${Math.abs(next.gain)}`);
  f.shown += 1;
  if (f.shown >= f.results.length) k.phase = "done";
}
function answer(ctx, k, owner, e) {
  const seat = ctx.seat(owner);
  if (!seat || seat.team === void 0) return err2("no_seat", "Join a team first.");
  const final = k.phase === "final_clue";
  if (k.phase !== "clue" && !final) return err2("closed", "Answers are closed.");
  const itemId = final ? k.final?.item : k.cur?.item;
  const answers = final ? k.final?.answers : k.cur?.answers;
  if (!itemId || !answers || e.item !== itemId) return err2("bad_item", "That clue isn\u2019t open.");
  if (answers[owner]) return { item: itemId };
  const opened = (final ? k.final?.opened_at : k.cur?.opened_at) ?? ctx.now;
  const t = k.cur ? tileOf(ctx, k.cur.tile) : void 0;
  const extra = final ? { final: true, wager: k.final?.wagers[seat.team] ?? 0 } : { tile: k.cur?.tile ?? "", cat: k.cur?.cat ?? "", value: k.cur?.value ?? 0, ...t?.double ? { double: true } : {}, ...k.cur?.team === seat.team ? { picked: true } : {} };
  const marked = ctx.mark(owner, { item: itemId, move: "answer", response: e.response, time_ms: Math.max(0, ctx.now - opened), extra, ...e.cid ? { cid: e.cid } : {} }, "live_solo");
  if ("error" in marked) return marked;
  const r = e.response;
  answers[owner] = {
    correct: marked.result.correct === true,
    at: ctx.now,
    ...Array.isArray(r?.selected) ? { choice: r.selected.filter((x) => typeof x === "string").slice(0, 12) } : {},
    ...typeof r?.text === "string" ? { text: r.text.slice(0, 80) } : {}
  };
  if (marked.result.correct) ctx.addScore(owner, final ? 0 : k.cur?.value ?? 0);
  if (everyoneIn(ctx, answers)) close(ctx, k);
  return { item: itemId };
}
var jeopardyRules = {
  kind: "jeopardy",
  teams: { min: 2, max: 6, default: 4 },
  init: () => ({ phase: "pick", order: [], turn: 0, picks: {}, used: {}, aim: null, cur: null, final: null, tally: {}, ceil: {} }),
  start(ctx, k) {
    k.order = ctx.teams();
    k.phase = tiles(ctx).length ? "pick" : content(ctx).jeopardy?.final ? "final_wager" : "done";
    if (k.phase === "final_wager") startFinal(ctx, k);
  },
  move(ctx, k, owner, e) {
    if (e.move !== "answer") return err2("bad_move", "Answer the clue on your phone.");
    return answer(ctx, k, owner, e);
  },
  control(ctx, k, op, from) {
    const data = op.data ?? {};
    const staff = from.role === "teacher" || from.role === "board";
    switch (op.name) {
      case "aim":
      case "pick": {
        if (typeof data.tile !== "string") return err2("bad_tile", "Pick a tile.");
        if (!staff) {
          const team = pickingTeam(ctx, k);
          if (team === null || captainOf2(ctx, k, team) !== from.owner) return err2("not_captain", "Your captain picks this turn.");
        }
        if (op.name === "aim") {
          if (k.phase !== "pick" || !tileOf(ctx, data.tile) || k.used[data.tile]) return err2("bad_tile", "Pick a tile still on the board.");
          k.aim = data.tile;
          return;
        }
        return pick(ctx, k, data.tile);
      }
      case "wager": {
        if (k.phase === "wager" && k.cur) {
          if (!staff && captainOf2(ctx, k, k.cur.team) !== from.owner) return err2("not_captain", "Your captain wagers.");
          k.cur.wager = clampWager(data.amount, k.cur.max_wager ?? MIN_WAGER);
          openClue(ctx, k);
          return;
        }
        if (k.phase === "final_wager" && k.final) {
          const team = staff ? Number(data.team) : ctx.seat(from.owner)?.team;
          if (team === void 0 || !Number.isInteger(team) || !order(ctx, k).includes(team)) return err2("bad_team", "No such team.");
          if (!staff && captainOf2(ctx, k, team) !== from.owner) return err2("not_captain", "Your captain wagers.");
          k.final.wagers[team] = clampWager(data.amount, finalMax(ctx, team), 0);
          if (finalWagersIn(ctx, k)) openFinal(ctx, k);
          return;
        }
        return err2("not_now", "No wager is open.");
      }
      case "close":
        if (!staff) return err2("teacher_only", "Only the teacher can do that.");
        if (k.phase === "wager" && k.cur) {
          k.cur.wager = clampWager(k.cur.wager ?? MIN_WAGER, k.cur.max_wager ?? MIN_WAGER);
          openClue(ctx, k);
        } else if (k.phase === "final_wager") openFinal(ctx, k);
        else close(ctx, k);
        return;
      case "reveal":
        if (!staff) return err2("teacher_only", "Only the teacher can do that.");
        if (k.phase === "clue" || k.phase === "closed") reveal(ctx, k);
        else if (k.phase === "final_clue" || k.phase === "final_closed" || k.phase === "final_reveal") revealFinalNext(ctx, k);
        return;
      case "next":
      case "back":
        if (!staff) return err2("teacher_only", "Only the teacher can do that.");
        if (k.phase === "revealed") backToBoard(ctx, k);
        else if (k.phase === "clue" || k.phase === "closed") reveal(ctx, k);
        else if (k.phase.startsWith("final_")) revealFinalNext(ctx, k);
        else if (k.phase === "done") ctx.end();
        return;
      case "final":
        if (!staff) return err2("teacher_only", "Only the teacher can do that.");
        if (k.phase !== "pick" && k.phase !== "done") return err2("not_now", "Finish this tile first.");
        if (!content(ctx).jeopardy?.final) return err2("no_final", "This game has no Final.");
        startFinal(ctx, k);
        return;
      default:
        return err2("bad_control", "That isn\u2019t a Jeopardy control.");
    }
  },
  tick(ctx, k) {
    if (k.phase === "wager" && k.cur) {
      k.cur.wager = clampWager(k.cur.wager ?? MIN_WAGER, k.cur.max_wager ?? MIN_WAGER);
      openClue(ctx, k);
    } else if (k.phase === "final_wager") openFinal(ctx, k);
    else close(ctx, k);
  },
  finish(ctx, k) {
    if (k.phase === "clue" || k.phase === "closed") reveal(ctx, k);
    while (k.phase === "final_clue" || k.phase === "final_closed" || k.phase === "final_reveal") {
      const before = k.final?.shown ?? 0;
      revealFinalNext(ctx, k);
      if (k.phase === "final_reveal" && (k.final?.shown ?? 0) === before) break;
    }
  },
  seatChanged(ctx, k) {
    if (k.phase === "clue" && k.cur && everyoneIn(ctx, k.cur.answers)) close(ctx, k);
    if (k.phase === "final_clue" && k.final && everyoneIn(ctx, k.final.answers)) close(ctx, k);
    if (k.phase === "final_wager" && k.final && finalWagersIn(ctx, k)) openFinal(ctx, k);
  },
  view(ctx, k, role, owner) {
    return jeopardyView(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    const seat = ctx.seat(owner);
    if (!seat || seat.team === void 0) return null;
    const captain = captainOf2(ctx, k, seat.team) === owner;
    if (k.phase === "pick" && captain && pickingTeam(ctx, k) === seat.team) {
      const free = tiles(ctx).filter((t2) => !k.used[t2.id]);
      const t = free[Math.floor(ctx.random() * free.length)];
      if (!t) return null;
      return { control: { name: k.aim === t.id || ctx.random() < 0.5 ? "pick" : "aim", data: { tile: k.aim && !k.used[k.aim] ? k.aim : t.id } } };
    }
    if (k.phase === "wager" && captain && k.cur?.team === seat.team) return { control: { name: "wager", data: { amount: Math.round((k.cur.max_wager ?? 100) * (0.3 + ctx.random() * 0.5) / 100) * 100 } } };
    if (k.phase === "final_wager" && captain && k.final && k.final.wagers[seat.team] === void 0) return { control: { name: "wager", data: { amount: Math.round(finalMax(ctx, seat.team) * ctx.random() / 10) * 10 } } };
    const open = k.phase === "clue" ? k.cur : k.phase === "final_clue" ? k.final : null;
    if (!open || open.answers[owner]) return null;
    return { move: { item: open.item, move: "answer", response: botResponse(ctx, open.item, ctx.random() < 0.65) } };
  }
};
function botResponse(ctx, item, right) {
  const key = ctx.keys.items[item];
  if (key?.shape === "term") return { text: right ? key.answers[0] : key.decoys[0] ?? "not sure" };
  if (key?.shape === "question") {
    const a = key.key.answer;
    const pub = itemOf(ctx, item);
    const q = pub?.shape === "question" ? pub.question : {};
    if (a.type === "choice") {
      const wrong = (q.options ?? []).map((o) => o.id).filter((id) => !a.ids.includes(id));
      return { selected: right || !wrong.length ? a.ids : [wrong[Math.floor(ctx.random() * wrong.length)]] };
    }
    if (a.type === "boolean") return { value: right ? a.value : !a.value };
    if (a.type === "text") return { text: right ? a.accepted[0] ?? "" : "not sure" };
  }
  return { text: "" };
}
function answeredBy(ctx, k, answers, names, myTeam) {
  const out = {};
  for (const t of order(ctx, k)) {
    const who = ctx.members(t).filter((o) => answers[o]);
    out[t] = names ? who.map((o) => ctx.seat(o)?.initials ?? "") : t === myTeam ? who.length : who.length;
  }
  return out;
}
function jeopardyView(ctx, k, role, owner) {
  const staff = role === "teacher" || role === "board";
  const layout = content(ctx).jeopardy;
  const me = role === "student" ? ctx.seat(owner) : void 0;
  const turnTeam = k.phase === "pick" ? pickingTeam(ctx, k) : k.cur?.team ?? null;
  const captains = {};
  for (const t of order(ctx, k)) {
    const c = captainOf2(ctx, k, t);
    captains[t] = c ? ctx.seat(c)?.initials ?? null : null;
  }
  const v = {
    phase: k.phase,
    categories: (layout?.categories ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      tiles: c.tiles.map((t) => ({ id: t.id, value: t.value, ...k.used[t.id] ? { used: k.used[t.id] } : {}, ...k.used[t.id] && t.double ? { double: true } : {} }))
    })),
    has_final: !!layout?.final,
    bonus: bonus(ctx),
    turn: turnTeam === null ? null : { team: turnTeam, captain: captains[turnTeam] ?? null },
    captains,
    aim: k.aim,
    cur: null,
    final: null
  };
  const cur = k.cur;
  if (cur) {
    const open = k.phase !== "wager";
    const revealed = k.phase === "revealed";
    const item = open ? itemOf(ctx, cur.item) : void 0;
    const live2 = {};
    for (const t of order(ctx, k)) live2[t] = counted(ctx, t, cur.answers).length;
    v.cur = {
      tile: cur.tile,
      cat: cur.cat,
      value: cur.value,
      double: cur.double,
      team: cur.team,
      ...cur.wager !== void 0 ? { wager: cur.wager } : {},
      ...cur.max_wager !== void 0 ? { max_wager: cur.max_wager } : {},
      ...k.phase === "clue" && cur.ends_at ? { ends_at: cur.ends_at } : {},
      ...item ? { item } : {},
      answered: answeredBy(ctx, k, cur.answers, staff, me?.team),
      live: live2,
      ...revealed && cur.results ? { results: cur.results } : {}
    };
    if (revealed) {
      v.cur.answer = answerText(item, ctx.keys.items[cur.item]);
      const all = Object.values(cur.answers);
      v.cur.right = all.filter((a) => a.correct).length;
      v.cur.total = all.length;
      if (staff) {
        const counts = {};
        for (const a of all) for (const c of a.choice ?? []) counts[c] = (counts[c] ?? 0) + 1;
        v.cur.counts = counts;
        const misses = /* @__PURE__ */ new Map();
        for (const a of all) if (!a.correct && a.text?.trim()) misses.set(a.text.trim().toLowerCase(), (misses.get(a.text.trim().toLowerCase()) ?? 0) + 1);
        const top = [...misses.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) v.cur.miss = top[0];
      }
    }
  }
  const f = k.final;
  if (f) {
    const open = k.phase !== "final_wager";
    const item = open ? itemOf(ctx, f.item) : void 0;
    const wagered = Object.keys(f.wagers).map(Number);
    const wagersFor = {};
    for (const [t, w] of Object.entries(f.wagers)) if (staff || Number(t) === me?.team || k.phase === "final_reveal" || k.phase === "done") wagersFor[Number(t)] = w;
    const max = {};
    for (const t of order(ctx, k)) max[t] = finalMax(ctx, t);
    v.final = {
      ...item ? { item } : {},
      ...k.phase === "final_clue" && f.ends_at ? { ends_at: f.ends_at } : {},
      wagered,
      wagers: wagersFor,
      max,
      answered: answeredBy(ctx, k, f.answers, staff, me?.team),
      shown: f.shown,
      ...f.results ? { results: f.results.slice(0, f.shown) } : {},
      ...(k.phase === "final_reveal" || k.phase === "done") && f.results ? { answer: answerText(itemOf(ctx, f.item), ctx.keys.items[f.item]) } : {}
    };
  }
  if (me && me.team !== void 0) {
    const answers = k.phase.startsWith("final") ? f?.answers : cur?.answers;
    const mine = answers?.[owner];
    const revealed = k.phase === "revealed" || (k.phase === "final_reveal" || k.phase === "done") && !!f?.results?.slice(0, f.shown).some((x) => x.team === me.team);
    const captain = captainOf2(ctx, k, me.team) === owner;
    v.me = {
      team: me.team,
      captain,
      answered: !!mine,
      ...mine?.choice ? { choice: mine.choice } : {},
      ...mine?.text !== void 0 ? { text: mine.text } : {},
      ...mine && revealed ? { correct: mine.correct } : {},
      ...captain && k.phase === "final_wager" ? { max_wager: finalMax(ctx, me.team) } : {}
    };
  }
  if (role === "teacher" || role === "board") {
    const all = tiles(ctx);
    v.insight = { cells: all.filter((t) => k.tally[t.id]).map((t) => ({ tile: t.id, cat: t.cat, value: t.value, ...k.tally[t.id] })) };
    if (role === "teacher") v.insight.ceilings = ceilings(ctx, k);
  }
  return v;
}
function ceilings(ctx, k) {
  return ctx.seats().map((s) => ({ initials: s.initials, ...s.team !== void 0 ? { team: s.team } : {}, by_cat: { ...k.ceil[s.owner] ?? {} } }));
}
registerRules(jeopardyRules);

// apps/teaching/src/quiz/core.ts
import { z as z2 } from "zod";

// apps/teaching/src/quiz/writing.ts
import { z } from "zod";
var WRITING_CHECKS = ["off", "flag", "block"];
var WritingCheckSchema = z.enum(WRITING_CHECKS);

// apps/teaching/src/quiz/core.ts
var QUIZ_QUESTION_KINDS = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "short_answer",
  "fill_gap",
  "odd_one_out",
  "matching",
  "ordering",
  "categorise",
  "quote_technique",
  "find_it",
  "spot_technique",
  "label_image",
  "extended_response",
  "explain_effect"
];
var QuizQuestionKindSchema = z2.enum(QUIZ_QUESTION_KINDS);
var QUIZ_KIND_INFO = {
  multiple_choice: { label: "Multiple choice", blurb: "Pick the one right answer.", tier: 1, manual: false },
  multi_select: { label: "Multi-select", blurb: "Pick every answer that applies.", tier: 1, manual: false },
  true_false: { label: "True or false", blurb: "Is the statement true or false?", tier: 1, manual: false },
  short_answer: { label: "Short answer", blurb: "Type a word or a short phrase.", tier: 1, manual: false },
  fill_gap: { label: "Fill the gap", blurb: "Fill the missing words in a sentence or quote.", tier: 1, manual: false },
  odd_one_out: { label: "Odd one out", blurb: "Spot the one that doesn\u2019t belong.", tier: 1, manual: false },
  matching: { label: "Matching pairs", blurb: "Match each item to its partner.", tier: 2, manual: false },
  ordering: { label: "Put in order", blurb: "Put the items in the right order.", tier: 2, manual: false },
  categorise: { label: "Sort into groups", blurb: "Sort each item into its group.", tier: 2, manual: false },
  quote_technique: { label: "Quote \u2192 technique", blurb: "Name the technique in a quote.", tier: 2, manual: false },
  find_it: { label: "Find it in the text", blurb: "Tap the line that answers the question.", tier: 2, manual: false },
  spot_technique: { label: "Spot the technique", blurb: "Select the words in a passage, then name the technique.", tier: 2, manual: false },
  label_image: { label: "Label the image", blurb: "Match each label to its pin on the image.", tier: 2, manual: false },
  extended_response: { label: "Extended response", blurb: "Write a paragraph. Your teacher marks it.", tier: 3, manual: true },
  explain_effect: { label: "Explain the effect", blurb: "Explain the effect of a technique. Your teacher marks it.", tier: 3, manual: true }
};
var QUIZ_LIMITS = {
  prompt: 1e3,
  option: 300,
  hint: 500,
  explanation: 1e3,
  passage: 4e3,
  /** A short answer's "Looking for" note, and a teacher's comment on a marked answer. */
  note: 1e3,
  answer: 200,
  model: 3e3,
  response: 6e3,
  marksMax: 20
};
var Id = z2.string().min(1).max(64);
var Text = (max) => z2.string().trim().min(1).max(max);
var OptionalText = (max) => z2.string().trim().max(max).optional();
var QuizImageSchema = z2.object({
  url: z2.string().min(1).max(2e3),
  alt: z2.string().max(300).default("")
});
var QuizChoiceSchema = z2.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z2.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z2.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z2.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z2.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z2.array(Id).min(1).max(10)
});
var QuizPinSchema = z2.object({
  id: Id,
  x: z2.number().min(0).max(1),
  y: z2.number().min(0).max(1),
  label: Text(120)
});
var NextStepEntrySchema = z2.object({
  lines: z2.array(z2.string().max(160)).length(5),
  /** Lines the teacher changed by hand; Regenerate keeps these. */
  edited: z2.array(z2.boolean()).length(5),
  /** Hash of the question, skills and ladder it was built from (bankSource), for the stale note. */
  source: z2.string().max(32)
});
var NextStepBankSchema = z2.record(z2.string().min(1).max(64), NextStepEntrySchema);
var SkillRefPattern = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z2.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z2.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z2.array(z2.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z2.array(z2.string().regex(SkillRefPattern, "Pick a skill from the list.")).max(8).optional(),
  /** Knowledge pieces this question checks (deep understandings), for the unit's tracking. */
  pieces: z2.array(z2.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).optional()
};
var QuizQuestionSchema = z2.discriminatedUnion("kind", [
  z2.object({ ...base, kind: z2.literal("multiple_choice"), options: z2.array(QuizChoiceSchema).min(2).max(6), correct: z2.array(Id).length(1) }),
  z2.object({ ...base, kind: z2.literal("multi_select"), options: z2.array(QuizChoiceSchema).min(2).max(8), correct: z2.array(Id).min(1).max(8) }),
  z2.object({ ...base, kind: z2.literal("true_false"), answer: z2.boolean() }),
  z2.object({
    ...base,
    kind: z2.literal("short_answer"),
    accepted: z2.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z2.boolean().optional(),
    /** What a right answer says, for the AI marker. Optional. */
    looking_for: OptionalText(QUIZ_LIMITS.note),
    ai_mark: z2.boolean().optional()
  }),
  z2.object({ ...base, kind: z2.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z2.boolean().optional(), ai_mark: z2.boolean().optional() }),
  z2.object({ ...base, kind: z2.literal("odd_one_out"), options: z2.array(QuizChoiceSchema).min(3).max(6), correct: z2.array(Id).length(1) }),
  z2.object({ ...base, kind: z2.literal("matching"), pairs: z2.array(QuizPairSchema).min(2).max(8) }),
  z2.object({ ...base, kind: z2.literal("ordering"), items: z2.array(QuizChoiceSchema).min(3).max(8) }),
  z2.object({
    ...base,
    kind: z2.literal("categorise"),
    groups: z2.array(QuizGroupSchema).min(2).max(4),
    items: z2.array(QuizSortItemSchema).min(2).max(16)
  }),
  z2.object({
    ...base,
    kind: z2.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z2.array(QuizChoiceSchema.extend({ technique_id: z2.string().max(64).optional() })).min(2).max(6),
    correct: z2.array(Id).length(1)
  }),
  z2.object({
    ...base,
    kind: z2.literal("find_it"),
    segments: z2.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z2.array(Id).min(1).max(40)
  }),
  z2.object({
    ...base,
    kind: z2.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z2.array(
      QuizChoiceSchema.extend({
        technique_id: z2.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z2.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z2.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z2.number().int().min(1).max(12).optional()
  }),
  z2.object({ ...base, kind: z2.literal("label_image"), image: QuizImageSchema, pins: z2.array(QuizPinSchema).min(2).max(8) }),
  z2.object({
    ...base,
    kind: z2.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z2.boolean().optional()
  }),
  z2.object({
    ...base,
    kind: z2.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z2.boolean().optional()
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z2.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z2.custom(
  (value) => !!value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && QUIZ_QUESTION_KINDS.includes(value.kind),
  { message: "A quiz question needs an id and a known kind." }
);
function questionProblems(q) {
  const out = [];
  const needsPrompt = q.kind !== "fill_gap";
  if (needsPrompt && !q.prompt.trim()) out.push("Write the question.");
  const unique = (ids, what) => {
    if (new Set(ids).size !== ids.length) out.push(`Two ${what} share an id.`);
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      unique(q.options.map((o) => o.id), "options");
      const ids = new Set(q.options.map((o) => o.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tick the right answer.");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two options say the same thing.");
      break;
    }
    case "find_it": {
      unique(q.segments.map((s) => s.id), "lines");
      const ids = new Set(q.segments.map((s) => s.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tap the line or lines that answer the question.");
      if (q.correct.length >= q.segments.length) out.push("Leave at least one line that isn\u2019t an answer.");
      break;
    }
    case "spot_technique": {
      unique(q.options.map((o) => o.id), "techniques");
      unique(q.targets.map((t) => t.id), "answers");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two techniques say the same thing.");
      const ids = new Set(q.options.map((o) => o.id));
      for (const target of q.targets) {
        if (!locateQuote(q.passage, target.quote)) out.push(`\u201C${target.quote}\u201D isn\u2019t in the passage. Copy the words exactly.`);
        if (!target.correct.length || target.correct.some((id) => !ids.has(id))) out.push("Name the technique for every answer.");
      }
      if ((q.find ?? q.targets.length) > q.targets.length) out.push("Students can\u2019t be asked to find more than there are answers.");
      if ((q.find ?? q.targets.length) > 1) {
        for (const option of q.options) {
          const needed = q.targets.filter((t) => t.correct.length === 1 && t.correct[0] === option.id).length;
          if (needed > (option.uses ?? 1)) out.push(`${option.text.trim() || "A technique"} is the answer ${needed} times. Set it to \xD7${needed}.`);
        }
      }
      break;
    }
    case "fill_gap":
      if (!parseGapPassage(q.passage).some((part) => part.type === "gap")) out.push("Blank out at least one word.");
      break;
    case "matching":
      unique(q.pairs.map((p) => p.id), "pairs");
      if (new Set(q.pairs.map((p) => norm(p.right))).size !== q.pairs.length) out.push("Two pairs have the same right-hand side.");
      break;
    case "ordering":
      unique(q.items.map((i) => i.id), "items");
      break;
    case "categorise": {
      unique(q.groups.map((g) => g.id), "groups");
      unique(q.items.map((i) => i.id), "items");
      const groups = new Set(q.groups.map((g) => g.id));
      if (q.items.some((i) => !groups.has(i.group))) out.push("Put every item in a group.");
      break;
    }
    case "label_image":
      unique(q.pins.map((p) => p.id), "pins");
      if (new Set(q.pins.map((p) => norm(p.label))).size !== q.pins.length) out.push("Two pins have the same label.");
      break;
    default:
      break;
  }
  return out;
}
function parseGapPassage(passage) {
  const parts = [];
  const re = /\[\[([^\]]*)\]\]/g;
  let last = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    if (m.index > last) parts.push({ type: "text", text: passage.slice(last, m.index) });
    const answers = (m[1] ?? "").split("|").map((a) => a.trim()).filter(Boolean);
    if (answers.length) parts.push({ type: "gap", answers });
    else parts.push({ type: "text", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < passage.length) parts.push({ type: "text", text: passage.slice(last) });
  return parts;
}
function passageWords(passage) {
  const words2 = [];
  const re = /\S+/g;
  let line = 0;
  let seen = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    line += (passage.slice(seen, m.index).match(/\n/g) ?? []).length;
    seen = m.index;
    words2.push({ text: m[0], start: m.index, end: m.index + m[0].length, line });
  }
  return words2;
}
function wordKey(word) {
  return norm(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
function locateQuote(passage, quote) {
  const words2 = passageWords(passage);
  const keyed = words2.map((w, i) => ({ i, key: wordKey(w.text) })).filter((w) => w.key);
  const wanted = passageWords(quote).map((w) => wordKey(w.text)).filter(Boolean);
  if (!wanted.length) return null;
  for (let s = 0; s + wanted.length <= keyed.length; s++) {
    if (wanted.every((key, j) => keyed[s + j].key === key)) return { from: keyed[s].i, to: keyed[s + wanted.length - 1].i };
  }
  return null;
}
var FILLER = new Set(
  "a an the and or but of to in on at by for with from as is are was were be been it its this that these those i you he she we they his her their our my your so then than".split(" ")
);
function spanFinds(words2, spot, target) {
  const content2 = (i) => {
    const key = wordKey(words2[i]?.text ?? "");
    return !!key && !FILLER.has(key);
  };
  const targetWords = [];
  for (let i = target.from; i <= target.to; i++) targetWords.push(i);
  const meaningful = targetWords.filter(content2);
  const pool = meaningful.length ? meaningful : targetWords;
  const caught = pool.filter((i) => i >= spot.from && i <= spot.to).length;
  if (caught < Math.max(1, Math.ceil(pool.length / 3))) return false;
  const overlap = Math.max(0, Math.min(spot.to, target.to) - Math.max(spot.from, target.from) + 1);
  const spill = spot.to - spot.from + 1 - overlap;
  return spill <= Math.max(4, targetWords.length);
}
function matchSpots(words2, spots, targets) {
  const pairs = [];
  spots.forEach(
    (spot, s) => targets.forEach((target, t) => {
      if (!spanFinds(words2, spot, target)) return;
      const overlap = Math.min(spot.to, target.to) - Math.max(spot.from, target.from) + 1;
      const union = Math.max(spot.to, target.to) - Math.min(spot.from, target.from) + 1;
      pairs.push({ s, t, fit: overlap / union });
    })
  );
  pairs.sort((a, b) => b.fit - a.fit || a.s - b.s);
  const out = spots.map(() => null);
  const taken = /* @__PURE__ */ new Set();
  for (const pair of pairs) {
    if (out[pair.s] !== null || taken.has(pair.t)) continue;
    out[pair.s] = pair.t;
    taken.add(pair.t);
  }
  return out;
}
var QuizFeedbackSchema = z2.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z2.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z2.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z2.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z2.boolean().optional(),
  shuffle_questions: z2.boolean().optional(),
  shuffle_options: z2.boolean().optional(),
  attempts: z2.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z2.number().min(0).max(1).optional(),
  confidence: z2.boolean().optional(),
  /** Written answers: off, flag how they were typed, or also block paste. Blank means flag. */
  writing_check: WritingCheckSchema.optional(),
  closes_at: z2.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z2.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z2.array(z2.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z2.string().max(64).optional(),
  follow_up_flag: z2.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z2.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}
function matchText(given, accepted, caseSensitive = false) {
  const g = norm(given, caseSensitive);
  if (!g) return "wrong";
  const options = accepted.map((a) => norm(a, caseSensitive));
  if (options.includes(g)) return "exact";
  const near = options.some((a) => a.length >= 5 && editDistance(g, a) <= (a.length >= 10 ? 2 : 1));
  return near ? "near" : "wrong";
}
function roundMarks(value) {
  return Math.round(value * 2) / 2;
}
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var strings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
var stringMap = (v) => isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e) => typeof e[1] === "string")) : {};
function hasAnswer(response) {
  if (!isRecord(response)) return false;
  if (typeof response.value === "boolean") return true;
  if (typeof response.text === "string") return response.text.trim().length > 0;
  if (Array.isArray(response.selected)) return response.selected.length > 0;
  if (Array.isArray(response.order)) return response.order.length > 0;
  if (Array.isArray(response.spots)) return response.spots.length > 0;
  for (const field of ["gaps", "map"]) {
    if (isRecord(response[field])) return Object.values(response[field]).some((v) => typeof v === "string" && v.trim());
  }
  return false;
}
function markResponse(key, response) {
  const max = key.marks;
  const r = isRecord(response) ? response : {};
  const full = (ok, parts) => ({ score: ok ? max : 0, max, correct: ok, ...parts ? { parts } : {} });
  const share = (right, total, parts) => {
    const score = total ? roundMarks(Math.max(0, right) / total * max) : 0;
    return { score, max, correct: score === max, parts };
  };
  const a = key.answer;
  switch (a.type) {
    case "boolean":
      return full(typeof r.value === "boolean" && r.value === a.value);
    case "text": {
      const match = matchText(typeof r.text === "string" ? r.text : "", a.accepted, a.case_sensitive);
      if (match === "exact") return full(true);
      if (key.ai && hasAnswer(r)) return { score: null, max, correct: null, pending: "ai" };
      if (match === "near") return { score: null, max, correct: null, pending: "near_miss" };
      return full(false);
    }
    case "manual":
      return hasAnswer(r) ? { score: null, max, correct: null, pending: key.ai ? "ai" : "manual" } : full(false);
    case "choice": {
      const picked = new Set(strings(r.selected));
      const right = new Set(a.ids);
      const parts = Object.fromEntries([...picked].map((id) => [id, right.has(id)]));
      const single = key.kind === "multiple_choice" || key.kind === "odd_one_out" || key.kind === "quote_technique";
      if (single) return full(picked.size === 1 && right.has([...picked][0]), parts);
      let hits = 0;
      let misses = 0;
      for (const id of picked) {
        if (right.has(id)) hits++;
        else misses++;
      }
      return share(hits - misses, right.size, parts);
    }
    case "gaps": {
      const given = stringMap(r.gaps);
      const parts = {};
      let right = 0;
      let waiting = false;
      for (const [id, accepted] of Object.entries(a.gaps)) {
        const exact = matchText(given[id] ?? "", accepted) === "exact";
        if (!exact && key.ai && (given[id] ?? "").trim()) {
          waiting = true;
          continue;
        }
        parts[id] = exact;
        if (exact) right++;
      }
      if (waiting) return { score: null, max, correct: null, pending: "ai", parts };
      return share(right, Object.keys(a.gaps).length, parts);
    }
    case "map": {
      const given = stringMap(r.map);
      const parts = {};
      let right = 0;
      for (const [from, to] of Object.entries(a.map)) {
        parts[from] = given[from] === to;
        if (parts[from]) right++;
      }
      return share(right, Object.keys(a.map).length, parts);
    }
    case "spots": {
      const words2 = passageWords(a.passage);
      const spots = spotList(r.spots).slice(0, a.pick);
      const found = matchSpots(words2, spots, a.targets);
      const parts = {};
      let credit = 0;
      spots.forEach((spot, i) => {
        const t = found[i];
        const named = t !== null && t !== void 0 && !!a.targets[t]?.ids.includes(spot.option);
        parts[`s${i}`] = named;
        parts[`s${i}.found`] = t !== null && t !== void 0;
        credit += named ? 1 : parts[`s${i}.found`] ? 0.5 : 0;
      });
      return share(credit, a.pick, parts);
    }
    case "order": {
      const given = strings(r.order);
      const parts = {};
      let right = 0;
      a.ids.forEach((id, i) => {
        parts[id] = given[i] === id;
        if (parts[id]) right++;
      });
      return share(right, a.ids.length, parts);
    }
  }
}
function spotList(v) {
  if (!Array.isArray(v)) return [];
  const at = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 5e3 ? n : null;
  return v.flatMap((x) => {
    if (!isRecord(x) || typeof x.option !== "string") return [];
    const a = at(x.from);
    const b = at(x.to);
    if (a === null || b === null) return [];
    return [{ from: Math.min(a, b), to: Math.max(a, b), option: x.option.slice(0, 64) }];
  });
}
function cleanResponse(kind, response) {
  if (!isRecord(response)) return null;
  const cap = (s) => s.slice(0, QUIZ_LIMITS.response);
  switch (kind) {
    case "true_false":
      return typeof response.value === "boolean" ? { value: response.value } : null;
    case "short_answer":
    case "extended_response":
    case "explain_effect":
      return typeof response.text === "string" ? { text: cap(response.text) } : null;
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique":
    case "find_it":
      return { selected: [...new Set(strings(response.selected))].slice(0, 40) };
    case "fill_gap":
      return { gaps: Object.fromEntries(Object.entries(stringMap(response.gaps)).slice(0, 60).map(([k, v]) => [k, v.slice(0, 200)])) };
    case "matching":
    case "categorise":
    case "label_image":
      return { map: Object.fromEntries(Object.entries(stringMap(response.map)).slice(0, 60)) };
    case "ordering":
      return { order: strings(response.order).slice(0, 40) };
    case "spot_technique":
      return { spots: spotList(response.spots).slice(0, 12) };
  }
}

// apps/teaching/src/games/core/schema.ts
import { z as z3 } from "zod";
var GAME_KINDS = [
  "crossword",
  "find_a_word",
  "jeopardy",
  "wheel",
  "team_match",
  "points_rush",
  "battles",
  "wager",
  "connections",
  "articulate",
  "pictionary",
  "who_said_it"
];
var GameKindSchema = z3.enum(GAME_KINDS);
var GAME_LIMITS = {
  games: 8,
  title: 80,
  term: 60,
  clue: 300,
  clues: 4,
  accept: 6,
  banned: 5,
  decoys: 3,
  word: 60,
  drawPrompt: 200,
  quote: 600,
  source: 120,
  whyFake: 300,
  label: 80,
  tile: 60,
  why: 300,
  cast: 8,
  castName: 60,
  category: 40,
  /** Letters in a Wheel puzzle (A–Z only). */
  wheelLetters: 60,
  wheelText: 120,
  message: 40,
  prompt: 1e3,
  criterion: 200,
  chips: 6,
  chip: 60
};
var GAME_COUNTS = {
  crossword: { min: 6, max: 30 },
  find_a_word: { min: 6, max: 20 },
  jeopardy_categories: { min: 3, max: 6 },
  jeopardy_tiles: { min: 3, max: 5 },
  wheel: { min: 3, max: 8 },
  wheel_bank: { min: 1, max: 20 },
  team_match: { min: 12, max: 40 },
  points_rush: { min: 10, max: 60 },
  wager: { min: 5, max: 15 },
  connections_walls: { min: 1, max: 6 },
  articulate: { min: 6, max: 60 },
  pictionary: { min: 3, max: 40 },
  who_said_it: { min: 8, max: 30 },
  cast: { min: 2, max: 8 }
};
var ItemIdSchema = z3.string().regex(/^[a-z0-9_-]{1,40}$/);
var Text2 = (max) => z3.string().max(max).default("");
var OptText = (max) => z3.string().max(max).optional();
var ItemTagsShape = {
  /** Knowledge pieces (`kp_…`) this item checks. */
  pieces: z3.array(z3.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).default([]),
  /** Syllabus outcome ids. */
  outcomes: z3.array(z3.string().min(1).max(64)).max(8).default([]),
  /** Skills-continuum sub-strands, `strand.sub`. */
  skills: z3.array(z3.string().regex(SkillRefPattern)).max(8).default([]),
  /** Technique catalogue ids. */
  tech: z3.array(z3.string().min(1).max(64)).max(6).default([])
};
var CLUE_KINDS = ["definition", "example", "quote"];
var ClueSchema = z3.object({ kind: z3.enum(CLUE_KINDS).default("definition"), text: Text2(GAME_LIMITS.clue) });
var TermItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("term"),
  term: Text2(GAME_LIMITS.term),
  /** Other spellings that count as right ("colour", "color"). */
  accept: z3.array(z3.string().max(GAME_LIMITS.term)).max(GAME_LIMITS.accept).default([]),
  clues: z3.array(ClueSchema).max(GAME_LIMITS.clues).default([]),
  /** Which clue this game uses (crossword, find-a-word). Absent: the first. */
  use_clue: z3.number().int().min(0).max(GAME_LIMITS.clues - 1).optional(),
  /** Articulate: words the describer can't say. */
  banned: z3.array(z3.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.banned).default([]),
  /** Find-a-word: plausible wrong terms placed in the grid for this clue. */
  decoys: z3.array(z3.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.decoys).default([]),
  /** Pictionary: what to draw, when it isn't the term itself. */
  draw_prompt: OptText(GAME_LIMITS.drawPrompt),
  ...ItemTagsShape
});
var GAME_QUESTION_KINDS = QUIZ_QUESTION_KINDS.filter((k) => !QUIZ_KIND_INFO[k].manual);
var QuestionItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("question"),
  question: QuizQuestionDraftSchema,
  ...ItemTagsShape
});
var FAKE_SPEAKER = "fake";
var QuoteItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("quote"),
  text: Text2(GAME_LIMITS.quote),
  /** A cast member's id, or 'fake'. Empty while being written. */
  speaker: z3.string().max(40).default(""),
  /** Act, scene, chapter. */
  source: OptText(GAME_LIMITS.source),
  why_fake: OptText(GAME_LIMITS.whyFake),
  /** Pictionary and Wheel: other answers that count (key words of the line). */
  accept: z3.array(z3.string().max(GAME_LIMITS.quote)).max(GAME_LIMITS.accept).default([]),
  ...ItemTagsShape
});
var CastMemberSchema = z3.object({
  id: ItemIdSchema,
  name: Text2(GAME_LIMITS.castName),
  /** A letter or emoji for the card. */
  emblem: OptText(8),
  image_url: OptText(2e3)
});
var GroupItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("group"),
  label: Text2(GAME_LIMITS.label),
  tiles: z3.array(z3.string().max(GAME_LIMITS.tile)).max(4).default([]),
  difficulty: z3.number().int().min(1).max(4).default(1),
  why: Text2(GAME_LIMITS.why),
  ...ItemTagsShape
});
var ItemSchema = z3.discriminatedUnion("shape", [TermItemSchema, QuestionItemSchema, QuoteItemSchema, GroupItemSchema]);
var TermOrQuestion = z3.discriminatedUnion("shape", [TermItemSchema, QuestionItemSchema]);
var TermQuoteOrQuestion = z3.discriminatedUnion("shape", [TermItemSchema, QuoteItemSchema, QuestionItemSchema]);
var TermOrQuote = z3.discriminatedUnion("shape", [TermItemSchema, QuoteItemSchema]);
var Seconds = (min, max, dflt) => z3.number().int().min(min).max(max).default(dflt);
var Seed = z3.number().int().min(0).max(2 ** 31 - 1).default(1);
var RESERVED_GAME_IDS = ["keys", "current"];
var GameIdSchema = ItemIdSchema.refine((id) => !RESERVED_GAME_IDS.includes(id), "That game id is reserved.");
var base2 = { id: GameIdSchema, title: Text2(GAME_LIMITS.title) };
var CrosswordSchema = z3.object({
  ...base2,
  kind: z3.literal("crossword"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.crossword.max).default([]),
  settings: z3.object({ seed: Seed, locked: z3.boolean().default(false), hints: z3.boolean().default(true) }).prefault({})
});
var FindAWordSchema = z3.object({
  ...base2,
  kind: z3.literal("find_a_word"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.find_a_word.max).default([]),
  /** Optional hidden message spelled by the leftover letters, and the question asked about it. */
  message: z3.object({ text: Text2(GAME_LIMITS.message), question: QuizQuestionDraftSchema.optional() }).optional(),
  settings: z3.object({ seed: Seed, locked: z3.boolean().default(false), directions: z3.enum(["easy", "all"]).default("all"), hints: z3.boolean().default(true) }).prefault({})
});
var JEOPARDY_VALUES = [100, 200, 300, 400, 500];
var JeopardyTileSchema = z3.object({
  id: ItemIdSchema,
  value: z3.number().int().refine((v) => JEOPARDY_VALUES.includes(v), "Pick 100 to 500."),
  double: z3.boolean().default(false),
  item: TermOrQuestion
});
var JeopardySchema = z3.object({
  ...base2,
  kind: z3.literal("jeopardy"),
  categories: z3.array(z3.object({ id: ItemIdSchema, title: Text2(GAME_LIMITS.category), tiles: z3.array(JeopardyTileSchema).max(GAME_COUNTS.jeopardy_tiles.max).default([]) })).max(GAME_COUNTS.jeopardy_categories.max).default([]),
  final: QuestionItemSchema.optional(),
  settings: z3.object({ seconds: Seconds(10, 120, 30), picker_bonus: z3.number().min(1).max(2).default(1.5) }).prefault({})
});
var WheelPuzzleSchema = z3.object({
  id: ItemIdSchema,
  category: Text2(GAME_LIMITS.category),
  /** The line to solve: a quote or a short key line. */
  text: Text2(GAME_LIMITS.wheelText),
  /** Questions that earn letters. */
  bank: z3.array(TermOrQuestion).max(GAME_COUNTS.wheel_bank.max).default([]),
  /** Everyone answers this once the puzzle is solved. */
  explain: QuestionItemSchema.optional(),
  ...ItemTagsShape
});
var WheelSchema = z3.object({
  ...base2,
  kind: z3.literal("wheel"),
  puzzles: z3.array(WheelPuzzleSchema).max(GAME_COUNTS.wheel.max).default([]),
  settings: z3.object({ vowel_cost: z3.number().int().min(0).max(1e3).default(250), lockout_seconds: Seconds(5, 60, 20) }).prefault({})
});
var WRONG_TAPS = ["back3", "start"];
var TeamMatchSchema = z3.object({
  ...base2,
  kind: z3.literal("team_match"),
  items: z3.array(TermQuoteOrQuestion).max(GAME_COUNTS.team_match.max).default([]),
  settings: z3.object({
    /** A wrong tap by any member: back 3 steps (default) or back to the start (Adam, 11 Nov). */
    wrong_tap: z3.enum(WRONG_TAPS).default("back3"),
    track: z3.number().int().min(6).max(20).default(12),
    team_size: z3.number().int().min(3).max(4).default(4)
  }).prefault({})
});
var PointsRushSchema = z3.object({
  ...base2,
  kind: z3.literal("points_rush"),
  items: z3.array(TermOrQuestion).max(GAME_COUNTS.points_rush.max).default([]),
  settings: z3.object({ minutes: z3.number().int().min(5).max(15).default(8), class_goal: z3.number().int().min(0).max(1e6).default(0) }).prefault({})
});
var BattlesSchema = z3.object({
  ...base2,
  kind: z3.literal("battles"),
  prompt: Text2(GAME_LIMITS.prompt),
  criterion: Text2(GAME_LIMITS.criterion),
  chips: z3.array(z3.string().max(GAME_LIMITS.chip)).max(GAME_LIMITS.chips).default([]),
  /** Or point at an existing question, as comparative judgement does. */
  question_ref: z3.object({ lesson_id: z3.string().min(1).max(80), block_id: z3.string().min(1).max(80) }).optional(),
  settings: z3.object({ write_minutes: z3.number().int().min(2).max(8).default(4) }).prefault({}),
  ...ItemTagsShape
});
var WagerSchema = z3.object({
  ...base2,
  kind: z3.literal("wager"),
  items: z3.array(QuestionItemSchema).max(GAME_COUNTS.wager.max).default([]),
  settings: z3.object({
    start: z3.number().int().min(10).max(1e4).default(100),
    min_bet: z3.number().int().min(1).max(1e3).default(10),
    seconds: Seconds(10, 120, 30),
    /** Right answers get this share of their bet on top. */
    house_bonus: z3.number().min(0).max(2).default(0.5),
    rescue: z3.boolean().default(true),
    final_all_in: z3.boolean().default(true)
  }).prefault({})
});
var ConnectionsWallSchema = z3.object({ id: ItemIdSchema, title: Text2(GAME_LIMITS.title), groups: z3.array(GroupItemSchema).max(4).default([]) });
var ConnectionsSchema = z3.object({
  ...base2,
  kind: z3.literal("connections"),
  walls: z3.array(ConnectionsWallSchema).max(GAME_COUNTS.connections_walls.max).default([]),
  settings: z3.object({ mistakes: z3.number().int().min(1).max(8).default(4) }).prefault({})
});
var ArticulateSchema = z3.object({
  ...base2,
  kind: z3.literal("articulate"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.articulate.max).default([]),
  settings: z3.object({ seconds: Seconds(30, 60, 45), passes: z3.number().int().min(0).max(3).default(2), quick_check: z3.boolean().default(true), quick_check_items: z3.number().int().min(3).max(5).default(4) }).prefault({})
});
var PictionarySchema = z3.object({
  ...base2,
  kind: z3.literal("pictionary"),
  items: z3.array(TermOrQuote).max(GAME_COUNTS.pictionary.max).default([]),
  settings: z3.object({ seconds: Seconds(60, 90, 75), drawers: z3.enum(["team", "class"]).default("class") }).prefault({})
});
var WhoSaidItSchema = z3.object({
  ...base2,
  kind: z3.literal("who_said_it"),
  cast: z3.array(CastMemberSchema).max(GAME_COUNTS.cast.max).default([]),
  items: z3.array(QuoteItemSchema).max(GAME_COUNTS.who_said_it.max).default([]),
  settings: z3.object({ seconds: Seconds(10, 60, 20) }).prefault({})
});
var GameSchema = z3.discriminatedUnion("kind", [
  CrosswordSchema,
  FindAWordSchema,
  JeopardySchema,
  WheelSchema,
  TeamMatchSchema,
  PointsRushSchema,
  BattlesSchema,
  WagerSchema,
  ConnectionsSchema,
  ArticulateSchema,
  PictionarySchema,
  WhoSaidItSchema
]);
var GameLessonSchema = z3.object({
  games: z3.array(GameSchema).max(GAME_LIMITS.games).default([]),
  /** Solo play (homework) closes at this time. Absent: open. */
  homework_closes_at: z3.string().datetime().optional()
});
var PublicTermSchema = z3.object({
  id: z3.string(),
  shape: z3.literal("term"),
  clues: z3.array(ClueSchema),
  lengths: z3.array(z3.number().int())
});
var PublicQuestionItemSchema = z3.object({ id: z3.string(), shape: z3.literal("question"), question: z3.record(z3.string(), z3.unknown()) });
var PublicQuoteSchema = z3.object({ id: z3.string(), shape: z3.literal("quote"), text: z3.string() });
var PublicItemSchema = z3.discriminatedUnion("shape", [PublicTermSchema, PublicQuestionItemSchema, PublicQuoteSchema]);
var PublicWallSchema = z3.object({ id: z3.string(), title: z3.string(), tiles: z3.array(z3.object({ id: z3.string(), text: z3.string() })) });
var PublicCrosswordGridSchema = z3.object({
  kind: z3.literal("crossword"),
  width: z3.number().int(),
  height: z3.number().int(),
  entries: z3.array(z3.object({ item: z3.string(), number: z3.number().int(), dir: z3.enum(["across", "down"]), x: z3.number().int(), y: z3.number().int(), length: z3.number().int() }))
});
var PublicWordGridSchema = z3.object({ kind: z3.literal("wordsearch"), size: z3.number().int(), rows: z3.array(z3.string()) });
var PublicGridSchema = z3.discriminatedUnion("kind", [PublicCrosswordGridSchema, PublicWordGridSchema]);
var PublicGameSchema = z3.object({
  id: z3.string(),
  title: z3.string(),
  kind: GameKindSchema,
  solo: z3.boolean(),
  live: z3.boolean(),
  /** Questions, clues or tiles in the game, for the card. */
  count: z3.number().int(),
  /** Settings students may see (timers, mistakes allowed, wrong tap rule…). */
  settings: z3.record(z3.string(), z3.union([z3.string(), z3.number(), z3.boolean()])),
  /** Solo kinds only. */
  items: z3.array(PublicItemSchema).optional(),
  walls: z3.array(PublicWallSchema).optional(),
  cast: z3.array(CastMemberSchema.pick({ id: true, name: true, emblem: true, image_url: true })).optional(),
  message: z3.object({ length: z3.number().int(), question: z3.record(z3.string(), z3.unknown()).optional() }).optional(),
  /** Crossword and find-a-word: the grid, built at publish. */
  grid: PublicGridSchema.optional()
});
var PublicGameLessonSchema = z3.object({
  games: z3.array(PublicGameSchema).max(GAME_LIMITS.games),
  homework_closes_at: z3.string().optional(),
  /** The publish version the keys are stored under. */
  version: z3.string()
});

// apps/teaching/src/games/generators/wordsearch.ts
function lineBetween(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return Array.from({ length: n + 1 }, (_, i) => [from[0] + sx * i, from[1] + sy * i]);
}
function readSelection(rows, from, to) {
  const size = rows.length;
  const cells = lineBetween(from, to);
  if (!cells) return null;
  let out = "";
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    out += rows[y]?.[x] ?? "";
  }
  return out;
}
function fullLine(size, p) {
  let { dx, dy } = p;
  if (dx < 0 || dx === 0 && dy < 0) {
    dx = -dx;
    dy = -dy;
  }
  let x = p.x;
  let y = p.y;
  while (x - dx >= 0 && x - dx < size && y - dy >= 0 && y - dy < size) {
    x -= dx;
    y -= dy;
  }
  return { x, y, dx, dy };
}

// apps/teaching/src/games/core/model.ts
function normaliseAnswer(value) {
  return norm(String(value ?? "")).normalize("NFD").replace(/\p{M}+/gu, "").replace(/^(?:a|an|the)\s+/, "").replace(/[\s\-‐-―_]+/g, "");
}
function gameTotal(keys) {
  return Object.values(keys.items).reduce((n, key) => n + (key.shape === "wall" ? key.groups.length : 1), 0);
}
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var textOf = (r) => isRecord2(r) && typeof r.text === "string" ? r.text.slice(0, 400) : "";
function checkAnswer(key, response) {
  switch (key.shape) {
    case "term": {
      const given = normaliseAnswer(textOf(response));
      const kept = { text: textOf(response) };
      if (!given) return { correct: false, response: kept };
      if (key.answers.some((a) => normaliseAnswer(a) === given)) return { correct: true, response: kept };
      const decoy = key.decoys.find((d) => normaliseAnswer(d) === given);
      return { correct: false, response: kept, ...decoy ? { decoy } : {} };
    }
    case "question": {
      const cleaned = cleanResponse(key.key.kind, response);
      const mark = markResponse(key.key, cleaned);
      return { correct: mark.correct === true, mark, response: cleaned };
    }
    case "quote": {
      if (isRecord2(response) && typeof response.speaker === "string") {
        const speaker = response.speaker.slice(0, 40);
        return { correct: speaker === key.speaker, response: { speaker } };
      }
      const given = normaliseAnswer(textOf(response));
      return { correct: !!given && key.answers.some((a) => normaliseAnswer(a) === given), response: { text: textOf(response) } };
    }
    case "wall": {
      const picked = isRecord2(response) && Array.isArray(response.tiles) ? [...new Set(response.tiles.filter((t) => typeof t === "string" && t in key.tiles))].slice(0, 4) : [];
      const kept = { tiles: picked };
      if (picked.length !== 4) return { correct: false, response: kept };
      const hit = key.groups.find((g) => picked.every((t) => g.tiles.includes(t)));
      if (hit) return { correct: true, group: hit.id, response: kept };
      const oneAway = key.groups.some((g) => picked.filter((t) => g.tiles.includes(t)).length === 3);
      return { correct: false, one_away: oneAway, response: kept };
    }
  }
}
var cellKey = (x, y) => `${x},${y}`;
function crosswordHint(grid, itemId, step2, typed) {
  const e = grid.entries.find((x) => x.id === itemId);
  if (!e) return [];
  const cellsOf = (x) => Array.from(x.word, (ch, i) => ({ x: x.dir === "across" ? x.x + i : x.x, y: x.dir === "down" ? x.y + i : x.y, ch }));
  const mine = cellsOf(e);
  if (step2 >= 3) return mine;
  if (step2 === 2) {
    const at = new Set(mine.map((c) => cellKey(c.x, c.y)));
    return grid.entries.filter((x) => x.dir !== e.dir && cellsOf(x).some((c) => at.has(cellKey(c.x, c.y)))).map((x) => cellsOf(x)[0]);
  }
  const given = typed.toUpperCase();
  return [mine.find((c, i) => given[i] !== c.ch) ?? mine[0]];
}
function wordHint(grid, itemId, step2) {
  const p = grid.placements.find((x) => !x.decoy && x.id === itemId);
  if (!p) return {};
  return { first: p.word[0], ...step2 >= 2 ? { length: p.word.length } : {}, ...step2 >= 3 ? { line: fullLine(grid.size, p) } : {} };
}
var point = (v, size) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < size) ? [v[0], v[1]] : null;
function checkSelection(grid, clue, response) {
  const r = isRecord2(response) ? response : {};
  const from = point(r.from, grid.size);
  const to = point(r.to, grid.size);
  const text = from && to ? readSelection(grid.rows, from, to) : null;
  if (!from || !to || !text || text.length < 2) return { item: null, correct: null, response: null };
  const kept = { from, to, text };
  const reversed = [...text].reverse().join("");
  const hit = grid.placements.filter((p) => p.word === text || p.word === reversed);
  const own = clue ? hit.find((p) => !p.decoy && p.id === clue) : hit.find((p) => !p.decoy);
  if (own) return { item: own.id, correct: true, response: kept };
  const other = hit[0];
  if (!other) return { item: clue, correct: null, response: kept };
  if (clue) return { item: clue, correct: false, decoy: other.label, response: kept };
  return { item: other.owner, correct: null, decoy: other.label, response: kept };
}
var COUNT_OF = {
  crossword: GAME_COUNTS.crossword,
  find_a_word: GAME_COUNTS.find_a_word,
  team_match: GAME_COUNTS.team_match,
  points_rush: GAME_COUNTS.points_rush,
  wager: GAME_COUNTS.wager,
  articulate: GAME_COUNTS.articulate,
  pictionary: GAME_COUNTS.pictionary,
  who_said_it: GAME_COUNTS.who_said_it,
  wheel: GAME_COUNTS.wheel
};

// apps/teaching/src/games/kinds/pictionary/rules.ts
var PICTIONARY_KIND = "pictionary";
var CANVAS = 1e3;
var STROKE_LIMITS = { strokes: 300, points: 9e3, perMove: 600, colours: 4, widths: 2 };
var HINT_AFTER_MS = 4e4;
function pictionarySettings(s, items) {
  const sec = typeof s?.seconds === "number" && Number.isFinite(s.seconds) ? Math.round(Math.min(90, Math.max(60, s.seconds))) : 75;
  return { seconds: sec, rounds: items };
}
var STOP = /* @__PURE__ */ new Set(["the", "and", "a", "an", "of", "to", "in", "on", "it", "is", "was", "i", "my", "me", "he", "she", "his", "her", "they", "we", "you", "that", "this", "with", "for", "as", "at", "by", "from", "out", "up", "be", "or", "but", "not", "so", "all", "only", "into"]);
var words = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/'/g, "")).filter(Boolean);
var keyWords = (s) => words(s).filter((w) => w.length >= 4 && !STOP.has(w));
function promptsOf(keys) {
  const out = /* @__PURE__ */ new Map();
  const cards = keys.live?.cards ?? {};
  for (const [id, key] of Object.entries(keys.items)) {
    if (key.shape === "term") {
      const term = key.label || key.answers[0] || "";
      if (!term) continue;
      out.set(id, { id, shape: "term", prompt: cards[id]?.draw || term, answer: term, answers: key.answers, blanks: term, key: [] });
    } else if (key.shape === "quote") {
      const text = key.label || key.answers[0] || "";
      if (!text) continue;
      const phrases = key.answers.slice(1);
      const blanks = phrases[0] || keyWords(text).sort((a, b) => b.length - a.length).slice(0, 2).join(" ");
      out.set(id, { id, shape: "quote", prompt: text, answer: text, answers: key.answers, blanks, key: keyWords(blanks) });
    }
  }
  return out;
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const row = d[i];
      const up = d[i - 1];
      row[j] = Math.min(up[j] + 1, row[j - 1] + 1, up[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  return d[a.length][b.length];
}
function judgeGuess(p, raw) {
  const g = normaliseAnswer(raw);
  if (!g) return { right: null, close: false };
  for (const a of p.answers) {
    const n = normaliseAnswer(a);
    if (!n) continue;
    if (n === g) return { right: a, close: false };
    if (p.shape === "term" && n.length >= 4 && lev(n, g) <= (n.length >= 8 ? 2 : 1)) return { right: a, close: false };
  }
  const gw = new Set(words(raw));
  if (p.shape === "quote" && p.key.length && p.key.every((k) => gw.has(k) || [...gw].some((w) => w.length >= 5 && lev(w, k) <= 1))) return { right: p.answers[1] ?? p.answers[0] ?? "", close: false };
  const pool = /* @__PURE__ */ new Set([...p.answers.flatMap(keyWords), ...p.key]);
  const close2 = [...gw].some((w) => pool.has(w) || w.length >= 6 && [...pool].some((k) => k.startsWith(w.slice(0, 6))));
  return { right: null, close: close2 };
}
var guessPoints = (ms) => Math.max(40, Math.round((200 - ms / 1e3 * 2.4) / 10) * 10);
var DRAWER_POINTS = 20;
function blanksOf(p, hinted) {
  const ws = p.blanks.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, ""));
  return { lengths: ws.map((w) => w.length), ...hinted ? { first: ws.map((w) => (w[0] ?? "").toUpperCase()) } : {} };
}
function shuffle2(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
var err3 = (code, message) => ({ error: { code, message } });
var pointCount = (r) => r.strokes.reduce((a, s) => a + s.p.length / 2, 0);
function applyStroke(r, data) {
  const d = data ?? {};
  if (d.clear === true) {
    r.strokes = [];
    return null;
  }
  if (d.undo === true) {
    r.strokes.pop();
    return null;
  }
  const id = Number(d.s);
  const pts = Array.isArray(d.p) ? d.p : [];
  if (!Number.isInteger(id) || id < 0 || id > 1e6) return "bad_stroke";
  if (pts.length % 2 || pts.length > STROKE_LIMITS.perMove * 2 || pts.some((v) => typeof v !== "number" || !Number.isFinite(v))) return "bad_stroke";
  const clean = pts.map((v) => Math.round(Math.min(CANVAS, Math.max(0, v))));
  const c = Math.min(STROKE_LIMITS.colours - 1, Math.max(0, Math.round(Number(d.c) || 0)));
  const w = Math.min(STROKE_LIMITS.widths - 1, Math.max(0, Math.round(Number(d.w) || 0)));
  let s = r.strokes.find((x) => x.id === id);
  if (!s) {
    if (r.strokes.length >= STROKE_LIMITS.strokes) return "too_much";
    s = { id, c, w, p: [] };
    r.strokes.push(s);
  }
  const room = STROKE_LIMITS.points * 2 - (pointCount(r) * 2 - s.p.length);
  if (d.full === true) s.p = clean.slice(0, Math.max(0, room));
  else {
    const from = Number(d.from) || 0;
    const fresh = clean.slice(Math.max(0, (s.p.length / 2 - from) * 2));
    s.p = [...s.p, ...fresh].slice(0, Math.max(0, room));
  }
  return null;
}
var guesserOwners = (ctx, r) => ctx.seats().map((s) => s.owner).filter((o) => o !== r.drawer);
function nextDrawer(ctx, k) {
  const seats = ctx.seats();
  const online = seats.filter((s) => s.connected);
  const pool = online.length ? online : seats;
  const fresh = pool.find((s) => !k.drawn.includes(s.owner));
  if (fresh) return fresh.owner;
  k.drawn = [];
  return pool[0]?.owner;
}
function startRound(ctx, k) {
  if (k.phase === "draw") return err3("not_now", "A round is running.");
  const prompts = promptsOf(ctx.keys);
  const item = k.deck.shift();
  if (!item || !prompts.has(item)) return err3("deck_empty", "Every prompt has been drawn.");
  const drawer = k.teacher_next ? "teacher" : nextDrawer(ctx, k);
  if (!drawer) return err3("no_drawer", "Nobody is here to draw.");
  k.teacher_next = false;
  if (drawer !== "teacher") k.drawn.push(drawer);
  const s = pictionarySettings(ctx.game.settings, 0);
  k.round = { n: (k.round?.n ?? 0) + 1, item, drawer, started_at: ctx.now, seconds: s.seconds, strokes: [], guessers: {}, order: [], guesses: 0, gains: {} };
  k.phase = "draw";
  ctx.setTimer(ctx.now + s.seconds * 1e3);
}
function gain(ctx, r, owner, points) {
  if (owner === "teacher" || !ctx.seat(owner)) return;
  ctx.addScore(owner, points);
  r.gains[owner] = (r.gains[owner] ?? 0) + points;
}
function closeRound(ctx, k, why) {
  const r = k.round;
  if (!r || k.phase !== "draw") return;
  r.closed = why;
  k.phase = "reveal";
  ctx.setTimer(void 0);
  const p = promptsOf(ctx.keys).get(r.item);
  const of = guesserOwners(ctx, r).length;
  if (why === "void") {
    for (const [owner, pts] of Object.entries(r.gains)) ctx.addScore(owner, -pts);
    r.gains = {};
  } else {
    for (const [owner, g] of Object.entries(r.guessers)) {
      if (!ctx.seat(owner)) continue;
      const n = g.tries.length + (g.ms !== void 0 ? 1 : 0);
      if (g.ms !== void 0) ctx.mark(owner, { item: r.item, move: "guess", response: { text: g.matched ?? p?.answer ?? "" }, time_ms: g.ms, extra: { guesses: n } }, "live_solo");
      else if (g.tries.length) ctx.mark(owner, { item: r.item, move: "guess", response: { text: g.tries[g.tries.length - 1]?.text ?? "" }, extra: { guesses: n, close: g.tries.some((t) => t.close) } }, "live_solo");
    }
  }
  if (r.drawer !== "teacher" && ctx.seat(r.drawer)) ctx.record(r.drawer, { item: r.item, move: "draw", extra: { got: r.order.length, of, void: why === "void", strokes: r.strokes.length } });
  const first = r.order[0];
  k.gallery.push({
    n: r.n,
    item: r.item,
    answer: p?.answer ?? "",
    drawer: r.drawer === "teacher" ? "Teacher" : ctx.seat(r.drawer)?.initials ?? "",
    got: r.order.length,
    of,
    void: why === "void",
    ...first && r.guessers[first]?.ms !== void 0 ? { fast: Math.round((r.guessers[first]?.ms ?? 0) / 1e3) } : {}
  });
  k.speed.push({
    n: r.n,
    item: r.item,
    drawer: r.drawer === "teacher" ? "Teacher" : ctx.seat(r.drawer)?.initials ?? "",
    void: why === "void",
    times: Object.fromEntries(r.order.map((o) => [ctx.seat(o)?.initials ?? o, Math.round((r.guessers[o]?.ms ?? 0) / 1e3)])),
    guesses: Object.fromEntries(Object.entries(r.guessers).map(([o, g]) => [ctx.seat(o)?.initials ?? o, g.tries.length + (g.ms !== void 0 ? 1 : 0)]))
  });
}
var pictionaryRules = {
  kind: PICTIONARY_KIND,
  // Strokes arrive about ten times a second while someone draws, plus a stroke end each lift of the finger.
  burst: 200,
  init() {
    return { phase: "ready", deck: [], round: null, drawn: [], gallery: [], speed: [], teacher_next: false };
  },
  start(ctx, k) {
    k.deck = shuffle2([...promptsOf(ctx.keys).keys()], ctx.random);
    k.phase = "ready";
  },
  move(ctx, k, owner, e) {
    const r = k.round;
    if (e.move === "draw") {
      if (k.phase !== "draw" || !r) return err3("not_now", "The round is over.");
      if (r.drawer !== owner) return err3("not_drawer", "Only the drawer can draw.");
      if (e.item !== r.item) return err3("stale", "That round has finished.");
      const bad = applyStroke(r, e.response);
      return bad ? err3(bad, bad === "too_much" ? "That drawing is full." : "That stroke didn\u2019t go through.") : { item: e.item };
    }
    if (e.move === "guess" || e.move === "answer") {
      if (k.phase !== "draw" || !r) return err3("not_now", "Wait for the next drawing.");
      if (r.drawer === owner) return err3("not_guesser", "You\u2019re drawing this one.");
      if (e.item !== r.item) return err3("stale", "That drawing has finished.");
      const g = r.guessers[owner] ??= { tries: [] };
      if (g.ms !== void 0) return { item: e.item, correct: true };
      const raw = typeof e.response?.text === "string" ? e.response.text.slice(0, 120) : "";
      if (!raw.trim()) return err3("empty", "Type a guess.");
      if (g.tries.length >= 60) return err3("slow_down", "That\u2019s a lot of guesses. Watch the drawing.");
      const p = promptsOf(ctx.keys).get(r.item);
      if (!p) return err3("bad_item", "That isn\u2019t in this game.");
      r.guesses += 1;
      const verdict = judgeGuess(p, raw);
      if (!verdict.right) {
        g.tries.push({ text: raw.trim().slice(0, 40), close: verdict.close });
        return { item: e.item, correct: false };
      }
      g.ms = Math.max(0, ctx.now - r.started_at);
      g.matched = verdict.right;
      g.points = guessPoints(g.ms);
      r.order.push(owner);
      gain(ctx, r, owner, g.points);
      gain(ctx, r, r.drawer, DRAWER_POINTS);
      ctx.ticker("got it", ctx.seat(owner)?.initials);
      if (r.order.length >= guesserOwners(ctx, r).length) closeRound(ctx, k, "all");
      return { item: e.item, correct: true };
    }
    return err3("bad_move", "That move isn\u2019t part of Pictionary.");
  },
  control(ctx, k, op, from) {
    const staff = from.role === "teacher" || from.role === "board";
    if (op.name === "stroke") {
      if (!staff || k.round?.drawer !== "teacher" || k.phase !== "draw") return err3("not_drawer", "Only the drawer can draw.");
      const bad = applyStroke(k.round, op.data);
      return bad ? err3(bad, "That stroke didn\u2019t go through.") : void 0;
    }
    if (!staff) return err3("not_allowed", "Only your teacher can do that.");
    switch (op.name) {
      case "next":
      case "next_round":
        return startRound(ctx, k);
      case "teacher_draws":
        if (k.phase === "draw") return err3("not_now", "A round is running.");
        k.teacher_next = true;
        return startRound(ctx, k);
      case "end_round":
      case "reveal":
        if (k.phase !== "draw") return err3("not_now", "No round is running.");
        closeRound(ctx, k, "time");
        return;
      case "disqualify":
        if (k.phase !== "draw") return err3("not_now", "No round is running.");
        closeRound(ctx, k, "void");
        return;
      case "more_time":
        if (k.phase !== "draw" || !k.round) return err3("not_now", "No round is running.");
        k.round.seconds += 15;
        ctx.setTimer(k.round.started_at + k.round.seconds * 1e3);
        return;
      case "standings":
        if (k.phase !== "reveal") return err3("not_now", "Finish the round first.");
        k.phase = "standings";
        return;
      case "final":
        ctx.end();
        return;
      default:
        return err3("bad_control", "Unknown control.");
    }
  },
  tick(ctx, k) {
    if (k.phase === "draw") closeRound(ctx, k, "time");
  },
  finish(ctx, k) {
    if (k.phase === "draw") closeRound(ctx, k, "ended");
  },
  seatChanged(ctx, k, owner) {
    const r = k.round;
    if (k.phase === "draw" && r && r.order.length && r.order.length >= guesserOwners(ctx, r).length) closeRound(ctx, k, "all");
    void owner;
  },
  view(ctx, k, role, owner) {
    return pictionaryView(ctx, k, role, owner);
  }
};
function pictionaryView(ctx, k, role, owner) {
  const r = k.round;
  const p = r ? promptsOf(ctx.keys).get(r.item) : void 0;
  const open = k.phase === "draw";
  const hinted = !!r && open && ctx.now - r.started_at >= HINT_AFTER_MS;
  const revealed = !!r && !open && r.closed !== void 0;
  const total = promptsOf(ctx.keys).size;
  const drawerIni = r ? r.drawer === "teacher" ? "Teacher" : ctx.seat(r.drawer)?.initials ?? "" : void 0;
  const blanks = p ? revealed ? { lengths: blanksOf(p, false).lengths } : blanksOf(p, hinted) : void 0;
  const got = r ? r.order.map((o) => ({ initials: ctx.seat(o)?.initials ?? "", s: Math.round((r.guessers[o]?.ms ?? 0) / 1e3) })) : [];
  if (role !== "student") {
    const v2 = {
      who: "board",
      phase: k.phase,
      n: r?.n ?? 0,
      of: total,
      ...drawerIni ? { drawer: drawerIni } : {},
      ...p ? { shape: p.shape } : {},
      ...blanks ? { blanks } : {},
      ...r ? { strokes: r.strokes.map((s) => ({ c: s.c, w: s.w, p: s.p })) } : {},
      got,
      guessers: r ? guesserOwners(ctx, r).length : ctx.seats().length,
      guesses: r?.guesses ?? 0,
      ...r ? { seconds: r.seconds, started_at: r.started_at } : {},
      ...r?.closed ? { closed: r.closed } : {},
      ...revealed && p ? { answer: p.answer, drawer_points: r?.closed === "void" ? 0 : (r?.order.length ?? 0) * DRAWER_POINTS } : {},
      ...r?.drawer === "teacher" && open ? { teacher_drawing: true, ...role === "teacher" && p ? { prompt: p.prompt } : {} } : {},
      gallery: k.gallery,
      deck_left: k.deck.length,
      ...role === "teacher" ? { speed: k.speed } : {}
    };
    return v2;
  }
  const isDrawer = !!r && r.drawer === owner;
  const g = r?.guessers[owner];
  const v = {
    who: "phone",
    phase: k.phase,
    n: r?.n ?? 0,
    of: total,
    ...drawerIni ? { drawer: drawerIni } : {},
    role: !r ? "waiting" : isDrawer ? "drawer" : "guesser",
    ...r ? { item: r.item, started_at: r.started_at, seconds: r.seconds } : {},
    ...p ? { shape: p.shape } : {},
    ...blanks && !isDrawer ? { blanks } : {},
    ...isDrawer && open && p ? { prompt: p.prompt } : {},
    got_count: r?.order.length ?? 0,
    guessers: r ? guesserOwners(ctx, r).length : 0,
    ...r && !isDrawer ? { mine: { got: g?.ms !== void 0, ...g?.ms !== void 0 ? { s: Math.round(g.ms / 1e3), points: g.points } : {}, tries: g?.tries ?? [] } } : {},
    ...r?.closed ? { closed: r.closed } : {},
    ...revealed && p ? { answer: p.answer } : {},
    // Someone who got it may see the answer at once (their phone is green and hidden from others).
    ...open && p && g?.ms !== void 0 ? { answer: p.answer } : {},
    ...isDrawer && revealed && r ? { drew: { got: r.closed === "void" ? 0 : r.order.length, points: r.closed === "void" ? 0 : r.order.length * DRAWER_POINTS, ...got[0] ? { first: got[0] } : {} } } : {},
    score: ctx.seat(owner)?.score ?? 0
  };
  return v;
}
registerRules(pictionaryRules);

// apps/teaching/src/games/kinds/wager/content.ts
var CHOICE_KINDS = /* @__PURE__ */ new Set(["multiple_choice", "odd_one_out", "quote_technique"]);
function contentItems(game, keys) {
  return keys?.live?.items?.length ? keys.live.items : game?.items ?? [];
}
function shownItem(item) {
  if (!item) return null;
  if (item.shape === "term") {
    const clue = item.clues[0];
    return { id: item.id, mode: "text", prompt: clue?.text ?? "", clue_kind: clue?.kind ?? "definition", lengths: item.lengths };
  }
  if (item.shape !== "question") return null;
  const q = item.question;
  const prompt = String(q.prompt ?? "");
  if (CHOICE_KINDS.has(String(q.kind)) && Array.isArray(q.options) && q.options.length >= 2) {
    return { id: item.id, mode: "choice", prompt, options: q.options.map((o) => ({ id: String(o.id), text: String(o.text) })), ...q.quote ? { quote: String(q.quote) } : {} };
  }
  if (q.kind === "true_false") return { id: item.id, mode: "truefalse", prompt };
  if (q.kind === "short_answer") return { id: item.id, mode: "text", prompt };
  return null;
}
function responseFor(item, pick2) {
  if (item.mode === "choice") return { selected: [pick2] };
  if (item.mode === "truefalse") return { value: pick2 === "true" };
  return { text: pick2.slice(0, 200) };
}
function choiceOf(response) {
  if (!response || typeof response !== "object") return null;
  const r = response;
  if (Array.isArray(r.selected) && typeof r.selected[0] === "string") return r.selected[0].slice(0, 40);
  if (typeof r.value === "boolean") return r.value ? "true" : "false";
  return null;
}
function optionsOf(item) {
  if (!item) return [];
  if (item.mode === "choice") return item.options ?? [];
  if (item.mode === "truefalse") return [
    { id: "true", text: "True" },
    { id: "false", text: "False" }
  ];
  return [];
}
function botResponse2(item, key, rightRate, random) {
  const right = random() < rightRate;
  if (key?.shape === "term") return { text: right ? key.answers[0] ?? "" : key.decoys[0] ?? "not sure" };
  if (key?.shape !== "question") return responseFor(item, item.options?.[0]?.id ?? "true");
  const a = key.key.answer;
  if (a.type === "boolean") return { value: right ? a.value : !a.value };
  if (a.type === "text") return { text: right ? a.accepted[0] ?? "" : "not sure" };
  if (a.type !== "choice") return responseFor(item, item.options?.[0]?.id ?? "true");
  const opts = optionsOf(item).map((o) => o.id);
  const wrong = opts.filter((id) => !a.ids.includes(id));
  const pick2 = right || !wrong.length ? a.ids[0] : wrong[Math.floor(random() * wrong.length)];
  return { selected: [pick2] };
}

// apps/teaching/src/games/kinds/points-rush/engine.ts
var BASE_POINTS = 100;
var STREAK_BONUS = [0, 100, 250, 500];
var UPGRADES = ["mult", "streak", "ins"];
var UPGRADE_INFO = {
  mult: { name: "Multiplier", costs: [300, 800, 1800], max: 3 },
  streak: { name: "Streak bonus", costs: [250, 700, 1500], max: 3 },
  ins: { name: "Insurance", costs: [200], max: 1 }
};
function shuffle3(xs, random) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function newRunner(items, random) {
  return { queue: shuffle3(items, random), qi: 0, answered: 0, back: [], cur: null, points: 0, earned: 0, streak: 0, best: 0, up: { mult: 0, streak: 0, ins: 0 }, bought: 0, rec: {} };
}
var multiplier = (r) => r.up.mult + 1;
function nextItem(r, items, random, now) {
  if (!items.length) return r.cur = null;
  let item;
  let back = false;
  const due = r.back.findIndex((b) => b.due <= r.answered);
  if (due > -1) {
    item = r.back.splice(due, 1)[0].item;
    back = true;
  } else if (r.qi < r.queue.length) item = r.queue[r.qi++];
  else if (r.back.length) {
    r.back.sort((a, b) => a.due - b.due);
    item = r.back.shift().item;
    back = true;
  } else {
    const prev = r.cur?.item;
    r.queue = shuffle3(items, random);
    if (r.queue.length > 1 && r.queue[0] === prev) r.queue.push(r.queue.shift());
    r.qi = 0;
    item = r.queue[r.qi++];
  }
  r.cur = { item, back, n: r.answered + 1, shown_at: now };
  return r.cur;
}
function applyAnswer(r, correct, random, now) {
  const cur = r.cur;
  if (!cur) return null;
  const rec = r.rec[cur.item] ??= { first: null, tries: 0, fixed: false, ms: 0 };
  const solved = rec.first === true || rec.fixed;
  if (!solved) {
    rec.tries += 1;
    rec.ms += Math.max(0, now - cur.shown_at);
    if (rec.first === null) rec.first = correct;
    else if (correct) rec.fixed = true;
  }
  r.answered += 1;
  let gain2 = 0;
  let bonus2 = 0;
  let insurance = false;
  if (correct) {
    r.streak += 1;
    r.best = Math.max(r.best, r.streak);
    gain2 = BASE_POINTS * multiplier(r);
    if (r.streak % 3 === 0) bonus2 = STREAK_BONUS[r.up.streak] ?? 0;
    r.points += gain2 + bonus2;
    r.earned += gain2 + bonus2;
  } else {
    if (r.up.ins > 0) {
      r.up.ins = 0;
      insurance = true;
    } else r.streak = 0;
    r.back.push({ item: cur.item, due: r.answered + 3 + Math.floor(random() * 4) });
  }
  r.last = { item: cur.item, correct, back: cur.back, gain: gain2, bonus: bonus2, insurance_used: insurance, streak: r.streak, n: cur.n };
  return r.last;
}
function shopRows(r) {
  return UPGRADES.map((key) => {
    const info = UPGRADE_INFO[key];
    const level = r.up[key];
    const cost = level >= info.max ? null : info.costs[level];
    return { key, name: info.name, level, max: info.max, cost, can: cost !== null && r.points >= cost };
  });
}
function buy(r, key) {
  const row = shopRows(r).find((x) => x.key === key);
  if (!row?.can || row.cost === null) return false;
  r.points -= row.cost;
  r.up[key] += 1;
  r.bought += 1;
  return true;
}
function runnerSummary(r) {
  const recs = Object.entries(r.rec);
  const missed = recs.filter(([, x]) => x.first === false);
  return {
    first_right: recs.filter(([, x]) => x.first === true).length,
    tried: recs.length,
    missed: missed.length,
    fixed: missed.filter(([, x]) => x.fixed).length,
    still: missed.filter(([, x]) => !x.fixed).map(([id]) => id),
    best: r.best
  };
}
function autoGoal(seats, minutes) {
  const raw = Math.max(1, seats) * minutes * 4 * BASE_POINTS * 0.66;
  return Math.max(1e3, Math.round(raw / 1e3) * 1e3);
}
var MILESTONES = [25, 50, 75, 100];

// apps/teaching/src/games/kinds/points-rush/rules.ts
var err4 = (code, message) => ({ error: { code, message } });
var classEarned = (k) => Object.values(k.runners).reduce((n, r) => n + r.earned, 0);
function runner(ctx, k, owner) {
  if (!k.runners[owner]) {
    if (!ctx.seat(owner)) return null;
    k.runners[owner] = newRunner(k.items, () => ctx.random());
    if (k.started_at !== void 0 && !k.over) nextItem(k.runners[owner], k.items, () => ctx.random(), ctx.now);
  }
  return k.runners[owner];
}
function syncGoal(ctx, k) {
  if (!k.goal_set) k.goal = autoGoal(ctx.seats().length, k.minutes);
}
function finishRush(ctx, k) {
  if (k.over) return;
  k.over = true;
  k.ends_at = void 0;
  ctx.setTimer(void 0);
}
var pointsRushRules = {
  kind: "points_rush",
  burst: 90,
  init(ctx) {
    const items = contentItems(ctx.game, ctx.keys).filter((i) => shownItem(i) && ctx.keys.items[i.id]).map((i) => i.id);
    const minutes = Math.min(15, Math.max(5, Number(ctx.game.settings?.minutes) || 8));
    const set = Number(ctx.game.settings?.class_goal) || 0;
    const k = { items, minutes, goal: set || autoGoal(ctx.seats().length, minutes), goal_set: set > 0, over: false, runners: {}, recent: [], first: { n: 0, right: 0 }, back: { n: 0, right: 0 }, upgrades: 0, milestones: [], board: "race" };
    return k;
  },
  start(ctx, k) {
    if (!k.items.length) return ctx.end();
    syncGoal(ctx, k);
    k.started_at = ctx.now;
    k.ends_at = ctx.now + k.minutes * 6e4;
    ctx.setTimer(k.ends_at);
    for (const seat of ctx.seats()) {
      const r = runner(ctx, k, seat.owner);
      if (r && !r.cur) nextItem(r, k.items, () => ctx.random(), ctx.now);
    }
  },
  move(ctx, k, owner, event) {
    if (k.over || k.started_at === void 0) return err4("closed", "Time\u2019s up.");
    if (k.ends_at !== void 0 && ctx.now >= k.ends_at) {
      finishRush(ctx, k);
      ctx.end();
      return err4("closed", "Time\u2019s up.");
    }
    const r = runner(ctx, k, owner);
    if (!r) return err4("no_seat", "Join the game first.");
    if (!r.cur) nextItem(r, k.items, () => ctx.random(), ctx.now);
    if (event.move !== "answer" || !r.cur || event.item !== r.cur.item) return err4("stale", "That question has moved on.");
    const back = r.cur.back;
    const marked = ctx.mark(owner, { item: event.item, move: "answer", response: event.response, time_ms: Math.max(0, ctx.now - r.cur.shown_at), extra: { back, n: r.cur.n } });
    if ("error" in marked) return marked;
    const correct = marked.result.correct === true;
    const v = applyAnswer(r, correct, () => ctx.random(), ctx.now);
    if (back) {
      k.back.n += 1;
      if (correct) k.back.right += 1;
    } else if (r.rec[event.item]?.tries === 1) {
      k.first.n += 1;
      if (correct) k.first.right += 1;
    }
    k.recent.push(ctx.now);
    while (k.recent.length && k.recent[0] < ctx.now - 6e4) k.recent.shift();
    if (k.recent.length > 3e3) k.recent.splice(0, k.recent.length - 3e3);
    ctx.setScore(owner, r.points);
    const pct = classEarned(k) / Math.max(1, k.goal) * 100;
    for (const m of MILESTONES) {
      if (pct >= m && !k.milestones.includes(m)) {
        k.milestones.push(m);
        ctx.ticker(m === 100 ? "Class goal reached" : `Class goal ${m}%`);
      }
    }
    nextItem(r, k.items, () => ctx.random(), ctx.now);
    return { item: event.item, correct: v?.correct ?? correct };
  },
  control(ctx, k, op, from) {
    if (op.name === "buy") {
      if (from.role !== "student") return err4("not_allowed", "Only players can buy upgrades.");
      if (k.over) return err4("closed", "Time\u2019s up.");
      const r = runner(ctx, k, from.owner);
      const key = op.data?.up;
      if (!r || typeof key !== "string" || !UPGRADES.includes(key)) return err4("bad_upgrade", "That isn\u2019t an upgrade.");
      if (!buy(r, key)) return err4("cant_buy", "Not enough points for that yet.");
      k.upgrades += 1;
      ctx.setScore(from.owner, r.points);
      return;
    }
    if (from.role === "student") return err4("not_allowed", "Only the teacher can do that.");
    if (op.name === "goal") {
      const goal = Math.round(Number(op.data?.goal));
      if (!Number.isFinite(goal) || goal < 100 || goal > 1e6) return err4("bad_goal", "Pick a goal between 100 and 1,000,000.");
      k.goal = goal;
      k.goal_set = true;
      k.milestones = MILESTONES.filter((m) => classEarned(k) / goal * 100 >= m);
      return;
    }
    if (op.name === "show") {
      const v = op.data?.view;
      if (v !== "race" && v !== "insight" && v !== "anon") return err4("bad_view", "That view isn\u2019t part of Points rush.");
      k.board = v;
      return;
    }
    if (op.name === "add_time" && k.ends_at !== void 0 && !k.over) {
      const secs = Number(op.data?.seconds) || 60;
      k.ends_at += Math.min(300, Math.max(15, secs)) * 1e3;
      ctx.setTimer(k.ends_at);
      return;
    }
    if (op.name === "next" || op.name === "end_now") {
      finishRush(ctx, k);
      ctx.end();
      return;
    }
    return err4("unknown", "That control isn\u2019t part of Points rush.");
  },
  tick(ctx, k) {
    if (!k.over && k.ends_at !== void 0 && ctx.now >= k.ends_at) {
      finishRush(ctx, k);
      ctx.end();
    }
  },
  finish(ctx, k) {
    finishRush(ctx, k);
  },
  /** DEV ONLY: a simulated classmate answers its own stream (right about 7 in 10) and now and then buys an upgrade. */
  bot(ctx, k, owner) {
    const r = k.runners[owner];
    if (k.over || !r?.cur) return null;
    const can = shopRows(r).filter((x) => x.can);
    if (can.length && ctx.random() < 0.2) return { control: { name: "buy", data: { up: can[Math.floor(ctx.random() * can.length)].key } } };
    const it = shownItem(contentItems(ctx.game, ctx.keys).find((i) => i.id === r.cur?.item));
    if (!it) return null;
    return { move: { item: r.cur.item, move: "answer", response: botResponse2(it, ctx.keys.items[r.cur.item], 0.7, () => ctx.random()) } };
  },
  seatChanged(ctx, k, owner) {
    syncGoal(ctx, k);
    const r = runner(ctx, k, owner);
    if (r) ctx.setScore(owner, r.points);
  },
  view(ctx, k, role, owner) {
    const earned = classEarned(k);
    const base3 = {
      minutes: k.minutes,
      goal: k.goal,
      class_earned: earned,
      milestones: [...k.milestones],
      over: k.over,
      ...k.started_at !== void 0 ? { started_at: k.started_at } : {},
      ...k.ends_at !== void 0 ? { ends_at: k.ends_at } : {}
    };
    if (role === "student") {
      const r = k.runners[owner];
      if (!r) return { ...base3, you: null };
      const cur = r.cur && !k.over ? { item: r.cur.item, back: r.cur.back, n: r.cur.n, q: shownItem(contentItems(ctx.game, ctx.keys).find((i) => i.id === r.cur?.item)) } : null;
      const rank = 1 + Object.values(k.runners).filter((x) => x.points > r.points).length;
      return {
        ...base3,
        you: {
          points: r.points,
          earned: r.earned,
          streak: r.streak,
          best: r.best,
          mult: r.up.mult + 1,
          up: { ...r.up },
          answered: r.answered,
          shop: shopRows(r),
          cur,
          ...r.last ? { last: r.last } : {},
          ...k.over ? { summary: runnerSummary(r), rank, of: Object.keys(k.runners).length } : {}
        }
      };
    }
    return {
      ...base3,
      board: k.board,
      stats: {
        per_minute: k.recent.filter((t) => t >= ctx.now - 6e4).length,
        first_pct: k.first.n ? Math.round(k.first.right / k.first.n * 100) : null,
        back_pct: k.back.n ? Math.round(k.back.right / k.back.n * 100) : null,
        upgrades: k.upgrades
      },
      top: Object.entries(k.runners).map(([o, r]) => ({ initials: ctx.seat(o)?.initials ?? "?", points: r.points })).sort((a, b) => b.points - a.points || a.initials.localeCompare(b.initials)).slice(0, 5),
      insight: insightOf(ctx, k)
    };
  }
};
function insightOf(ctx, k) {
  const per = /* @__PURE__ */ new Map();
  for (const r of Object.values(k.runners)) {
    for (const [id, rec] of Object.entries(r.rec)) {
      const p = per.get(id) ?? { fn: 0, fr: 0, bn: 0, br: 0 };
      if (rec.first !== null) {
        p.fn += 1;
        if (rec.first) p.fr += 1;
        else {
          if (rec.tries > 1 || rec.fixed) {
            p.bn += 1;
            if (rec.fixed) p.br += 1;
          }
        }
      }
      per.set(id, p);
    }
  }
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const content2 = contentItems(ctx.game, ctx.keys);
  const label = (id) => (shownItem(content2.find((i) => i.id === id))?.prompt ?? id).slice(0, 90);
  const items = [...per.entries()].map(([item, p]) => ({ item, label: label(item), first_pct: pct(p.fr, p.fn), back_pct: pct(p.br, p.bn), first_n: p.fn, back_n: p.bn })).sort((a, b) => (a.first_pct ?? 101) - (b.first_pct ?? 101));
  const students = Object.entries(k.runners).map(([o, r]) => {
    const s = runnerSummary(r);
    return { initials: ctx.seat(o)?.initials ?? "?", first_pct: pct(s.first_right, s.tried), fixed_pct: pct(s.fixed, s.missed), still: s.still.length };
  }).sort((a, b) => (b.first_pct ?? -1) - (a.first_pct ?? -1) || a.initials.localeCompare(b.initials));
  return { items, students };
}
registerRules(pointsRushRules);

// apps/teaching/src/games/live/format.ts
function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// apps/teaching/src/games/kinds/team-match/rules.ts
var OPTIONS = 12;
var err5 = (code, message) => ({ error: { code, message } });
var promptOf = (item) => {
  if (item.shape === "term") return item.clues[0]?.text ?? "";
  if (item.shape === "quote") return item.text;
  return String(item.question.prompt ?? "");
};
function cardsOf2(ctx) {
  const out = [];
  for (const item of ctx.keys.live?.items ?? []) {
    const key = ctx.keys.items[item.id];
    if (!key) continue;
    if (item.shape === "question") {
      const one = singleChoice(item, key);
      if (one) out.push({ item: item.id, prompt: promptOf(item), eyebrow: "Pick the answer", answer: one.right, lures: one.others });
      continue;
    }
    const answer3 = answerText(item, key);
    if (!answer3.trim()) continue;
    out.push({ item: item.id, prompt: promptOf(item), eyebrow: item.shape === "quote" ? "Who said it?" : "Name the term", answer: answer3.trim(), lures: key.shape === "term" ? key.decoys : [] });
  }
  return out;
}
function shuffle4(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function freshId(random, used) {
  for (; ; ) {
    const id = `o${Math.floor(random() * 36 ** 5).toString(36)}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}
function buildOptions(card, all, random) {
  const seen = /* @__PURE__ */ new Set([normaliseAnswer(card.answer)]);
  const pick2 = [card.answer];
  const add = (text) => {
    const n = normaliseAnswer(text);
    if (!n || seen.has(n) || pick2.length >= OPTIONS) return;
    seen.add(n);
    pick2.push(text.trim());
  };
  for (const l of card.lures) add(l);
  for (const c of shuffle4(all, random)) add(c.answer);
  const used = /* @__PURE__ */ new Set();
  const opts = shuffle4(pick2, random).map((text) => ({ id: freshId(random, used), text }));
  const right = opts.find((o) => o.text === card.answer.trim())?.id;
  return { opts, right };
}
function dealHands(opts, right, lures, members, random) {
  if (!members.length) return {};
  const order2 = shuffle4(members, random);
  const hands = Object.fromEntries(order2.map((m) => [m, []]));
  const holder = order2[0];
  hands[holder].push(right);
  const others = order2.slice(1);
  const rest = opts.filter((o) => o.id !== right);
  const lureOpts = rest.filter((o) => lures.has(normaliseAnswer(o.text)));
  const fill = rest.filter((o) => !lures.has(normaliseAnswer(o.text)));
  lureOpts.forEach((o, i) => hands[others.length ? others[i % others.length] : holder].push(o.id));
  for (const o of fill) {
    const min = order2.reduce((best, m) => hands[m].length < hands[best].length ? m : best, order2[0]);
    hands[min].push(o.id);
  }
  for (const m of order2) hands[m] = shuffle4(hands[m], random);
  return hands;
}
var live = (ctx, team) => ctx.members(team).filter((o) => ctx.seat(o)?.connected);
function nextCard(ctx, race, cards) {
  if (!cards.length) return void 0;
  const ids = new Set(cards.map((c) => c.item));
  race.queue = race.queue.filter((id2) => ids.has(id2));
  if (race.qi >= race.queue.length) {
    const last = race.queue[race.queue.length - 1];
    let q = shuffle4(cards.map((c) => c.item), ctx.random);
    if (q.length > 1 && q[0] === last) q = [...q.slice(1), q[0]];
    race.queue = q;
    race.qi = 0;
  }
  const id = race.queue[race.qi++];
  return cards.find((c) => c.item === id);
}
function deal(ctx, k, team) {
  const race = k.teams[team];
  if (!race) return;
  const cards = cardsOf2(ctx);
  const card = nextCard(ctx, race, cards);
  if (!card) {
    race.round = null;
    return;
  }
  const { opts, right } = buildOptions(card, cards, ctx.random);
  const lures = new Set(card.lures.map(normaliseAnswer));
  const members = live(ctx, team);
  race.rounds += 1;
  k.rounds += 1;
  race.round = { item: card.item, n: race.rounds, opts, right, hands: dealHands(opts, right, lures, members, ctx.random), opened_at: ctx.now };
  for (const [owner, hand] of Object.entries(race.round.hands)) if (hand.includes(right)) stat(k, owner).held += 1;
}
function redeal(ctx, k, team) {
  const round = k.teams[team]?.round;
  if (!round) return;
  const card = cardsOf2(ctx).find((c) => c.item === round.item);
  const before = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0];
  round.hands = dealHands(round.opts, round.right, new Set((card?.lures ?? []).map(normaliseAnswer)), live(ctx, team), ctx.random);
  const after = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0];
  if (before !== after) {
    if (before) stat(k, before).held = Math.max(0, stat(k, before).held - 1);
    if (after) stat(k, after).held += 1;
  }
}
var stat = (k, owner) => k.taps[owner] ??= { held: 0, right: 0, false_taps: 0, wrong: [] };
function feed(ctx, k, team, text, tone) {
  k.feed.unshift({ team, text, tone, at: ctx.now });
  k.feed.length = Math.min(k.feed.length, 6);
}
function tap(ctx, k, owner, e) {
  const seat = ctx.seat(owner);
  if (!seat || seat.team === void 0) return err5("no_seat", "Join a team first.");
  if (k.phase !== "race") return err5("over", "The race is over.");
  const team = seat.team;
  const race = k.teams[team];
  if (!race || race.place !== null) return err5("finished", "Your team has finished. Watch the board.");
  const round = race.round;
  if (!round || e.item !== round.item) return err5("stale", "That question has moved on.");
  const option = e.response?.option;
  const mine = round.hands[owner] ?? [];
  if (typeof option !== "string" || !mine.includes(option)) return err5("stale", "That question has moved on.");
  const opt = round.opts.find((o) => o.id === option);
  const rightOpt = round.opts.find((o) => o.id === round.right);
  const holderOwner = Object.entries(round.hands).find(([, h]) => h.includes(round.right))?.[0] ?? null;
  const isHolder = holderOwner === owner;
  const correct = option === round.right;
  ctx.record(owner, {
    item: round.item,
    move: "tap",
    response: { text: opt.text },
    correct,
    time_ms: Math.max(0, ctx.now - round.opened_at),
    extra: { holder: isHolder, tapped: opt.text.slice(0, 200), round: round.n, ...isHolder ? {} : { false_tap: true, answer: rightOpt.text.slice(0, 200) } },
    strength: "live_team"
  });
  const s = stat(k, owner);
  const card = cardsOf2(ctx).find((c) => c.item === round.item);
  const from = race.step;
  if (correct) {
    s.right += 1;
    race.step = Math.min(k.track, race.step + 1);
    ctx.addTeamScore(team, race.step - from);
    ctx.addScore(owner, 1);
  } else {
    if (!isHolder) {
      s.false_taps += 1;
      const key = `${normaliseAnswer(opt.text)}\u2192${normaliseAnswer(rightOpt.text)}`;
      const p = k.pairs[key] ??= { tapped: opt.text, answer: rightOpt.text, n: 0, owners: [] };
      p.n += 1;
      if (!p.owners.includes(owner)) p.owners.push(owner);
    }
    s.wrong.unshift({ tapped: opt.text, answer: rightOpt.text });
    s.wrong.length = Math.min(s.wrong.length, 4);
    race.step = k.mode === "back3" ? Math.max(0, race.step - 3) : 0;
    race.crashes += 1;
    if (race.step !== from) ctx.addTeamScore(team, race.step - from);
    feed(ctx, k, team, `${teamName(team)} wrong tap \xB7 ${k.mode === "back3" ? "back 3" : "back to start"}`, "bad");
  }
  race.last = {
    at: ctx.now,
    owner,
    by: seat.initials,
    correct,
    tapped: opt.text,
    answer: rightOpt.text,
    holder: holderOwner ? ctx.seat(holderOwner)?.initials ?? null : null,
    from,
    to: race.step,
    item: round.item,
    prompt: card?.prompt ?? ""
  };
  if (correct && race.step >= k.track) {
    race.place = k.places.length + 1;
    k.places.push(team);
    race.round = null;
    const bonus2 = Math.max(0, ctx.teams().length - race.place);
    if (bonus2) ctx.addTeamScore(team, bonus2);
    feed(ctx, k, team, `${teamName(team)} finish ${ordinal(race.place)}`, "win");
    ctx.ticker(`${teamName(team)} finished ${ordinal(race.place)}`);
    const racing = ctx.teams().filter((t) => k.teams[t] && k.teams[t]?.place === null && ctx.members(t).length);
    if (!racing.length) {
      k.phase = "done";
      ctx.end();
    }
  } else deal(ctx, k, team);
  return { item: round.item, correct };
}
function startTeam(ctx, k, team) {
  if (k.teams[team]) return;
  k.teams[team] = { step: 0, place: null, queue: [], qi: 0, round: null, last: null, crashes: 0, rounds: 0 };
  deal(ctx, k, team);
}
var teamMatchRules = {
  kind: "team_match",
  teams: { min: 2, max: 6, default: 4 },
  init: (ctx) => {
    const mode = String(ctx.game.settings?.wrong_tap ?? "back3");
    return {
      phase: "race",
      mode: WRONG_TAPS.includes(mode) ? mode : "back3",
      track: Math.max(6, Math.min(20, Number(ctx.game.settings?.track) || 12)),
      teams: {},
      places: [],
      feed: [],
      taps: {},
      pairs: {},
      rounds: 0
    };
  },
  start(ctx, k) {
    for (const t of ctx.teams()) startTeam(ctx, k, t);
  },
  move(ctx, k, owner, e) {
    if (e.move !== "tap") return err5("bad_move", "Tap one of your answers.");
    return tap(ctx, k, owner, e);
  },
  control(ctx, k, op, from) {
    if (from.role === "student") return err5("teacher_only", "Only the teacher can do that.");
    if (op.name === "wrong_tap") {
      const mode = op.data?.mode;
      const next = typeof mode === "string" && WRONG_TAPS.includes(mode) ? mode : k.mode === "back3" ? "start" : "back3";
      k.mode = next;
      return;
    }
    if (op.name === "skip") {
      const team = Number(op.data?.team);
      if (!k.teams[team] || k.teams[team]?.place !== null) return err5("bad_team", "No such team racing.");
      deal(ctx, k, team);
      return;
    }
    if (op.name === "next" || op.name === "reveal") return;
    return err5("bad_control", "That isn\u2019t a team match control.");
  },
  seatChanged(ctx, k, owner) {
    if (k.phase !== "race") return;
    const team = ctx.seat(owner)?.team ?? Object.keys(k.teams).map(Number).find((t) => k.teams[t]?.round?.hands[owner]);
    if (team === void 0) return;
    if (!k.teams[team]) startTeam(ctx, k, team);
    else if (k.teams[team]?.round) redeal(ctx, k, team);
    else if (k.teams[team]?.place === null) deal(ctx, k, team);
  },
  view(ctx, k, role, owner) {
    return teamMatchView(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    const team = ctx.seat(owner)?.team;
    const round = team === void 0 ? null : k.teams[team]?.round ?? null;
    const hand = round?.hands[owner];
    if (!round || !hand?.length || k.phase !== "race") return null;
    if (hand.includes(round.right)) return ctx.random() < 0.35 ? { move: { item: round.item, move: "tap", response: { option: round.right } } } : null;
    return ctx.random() < 0.04 ? { move: { item: round.item, move: "tap", response: { option: hand[Math.floor(ctx.random() * hand.length)] } } } : null;
  }
};
function teamMatchView(ctx, k, role, owner) {
  const staff = role === "teacher" || role === "board";
  const lanes = Object.keys(k.teams).map(Number).sort((a, b) => a - b).map((team) => {
    const r = k.teams[team];
    const lastOut = r.last ? (({ owner: _o, item: _i, ...rest }) => rest)(r.last) : null;
    return {
      team,
      step: r.step,
      place: r.place,
      crashes: r.crashes,
      members: ctx.members(team).map((o) => ({ initials: ctx.seat(o)?.initials ?? "", connected: !!ctx.seat(o)?.connected })),
      // Students see only their own team's last tap (what was tapped, what it was).
      last: staff || ctx.seat(owner)?.team === team ? lastOut : null
    };
  });
  const v = { phase: k.phase, mode: k.mode, track: k.track, lanes, places: [...k.places], feed: k.feed.slice(0, 3) };
  const seat = role === "student" ? ctx.seat(owner) : void 0;
  if (seat && seat.team !== void 0) {
    const race = k.teams[seat.team];
    const round = race?.round ?? null;
    const card = round ? cardsOf2(ctx).find((c) => c.item === round.item) : void 0;
    const mineIds = round?.hands[owner] ?? [];
    const st = stat(k, owner);
    v.me = {
      team: seat.team,
      mates: ctx.members(seat.team).map((o) => ({ initials: ctx.seat(o)?.initials ?? "", connected: !!ctx.seat(o)?.connected, options: round?.hands[o]?.length ?? 0, me: o === owner })),
      round: round && card ? { item: round.item, n: round.n, eyebrow: card.eyebrow, prompt: card.prompt, options: mineIds.map((id) => round.opts.find((o) => o.id === id)), total: round.opts.length } : null,
      last: race?.last ? { ...(({ owner: _o, item: _i, ...rest }) => rest)(race.last), mine: race.last.owner === owner, held: race.last.holder === seat.initials } : null,
      stats: { held: st.held, right: st.right, false_taps: st.false_taps, wrong: st.wrong.slice(0, 2) }
    };
  }
  if (staff) {
    const pairs = Object.values(k.pairs).sort((a, b) => b.n - a.n).slice(0, 5);
    v.insight = {
      pairs: pairs.map((p) => ({ tapped: p.tapped, answer: p.answer, n: p.n, students: p.owners.length, ...role === "teacher" ? { who: p.owners.map((o) => ctx.seat(o)?.initials ?? "") } : {} }))
    };
    if (role === "teacher") {
      v.insight.students = ctx.seats().map((s) => ({ initials: s.initials, ...s.team !== void 0 ? { team: s.team } : {}, held: k.taps[s.owner]?.held ?? 0, right: k.taps[s.owner]?.right ?? 0, false_taps: k.taps[s.owner]?.false_taps ?? 0 })).sort((a, b) => b.false_taps - a.false_taps);
    }
  }
  return v;
}
registerRules(teamMatchRules);

// apps/teaching/src/games/kinds/wager/rules.ts
function wagerSettings(s) {
  const num = (v, d, lo, hi) => typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    start: Math.round(num(s?.start, 100, 10, 1e4)),
    min_bet: Math.round(num(s?.min_bet, 10, 1, 1e3)),
    seconds: Math.round(num(s?.seconds, 30, 10, 120)),
    house_bonus: num(s?.house_bonus, 0.5, 0, 2),
    rescue: s?.rescue !== false,
    final_all_in: s?.final_all_in !== false
  };
}
var finalBonus = (k) => k.s.house_bonus * 2;
var isFinal = (k) => k.index === k.order.length - 1;
var bonusRate = (k) => isFinal(k) && k.s.final_all_in ? finalBonus(k) : k.s.house_bonus;
var err6 = (code, message) => ({ error: { code, message } });
function shown(ctx, id) {
  if (!id) return null;
  return shownItem(contentItems(ctx.game, ctx.keys).find((i) => i.id === id));
}
var minBetFor = (s, held) => Math.max(0, Math.min(s.min_bet, held));
function clampBet(s, held, bet) {
  const b = typeof bet === "number" && Number.isFinite(bet) ? Math.round(bet) : s.min_bet;
  return Math.min(held, Math.max(minBetFor(s, held), b));
}
function splitPot(pot, bets) {
  const total = bets.reduce((n, b) => n + b.bet, 0);
  const out = {};
  if (!bets.length || pot <= 0) {
    for (const b of bets) out[b.owner] = 0;
    return out;
  }
  const weight = (b) => total > 0 ? b.bet / total : 1 / bets.length;
  const raw = bets.map((b, i) => ({ ...b, i, exact: pot * weight(b) }));
  let given = 0;
  for (const r of raw) {
    out[r.owner] = Math.floor(r.exact);
    given += out[r.owner];
  }
  const rest = raw.sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || b.bet - a.bet || a.i - b.i);
  for (let j = 0; j < pot - given; j++) out[rest[j % rest.length].owner] += 1;
  return out;
}
function rightOptions(ctx, id) {
  const key = ctx.keys.items[id];
  if (key?.shape !== "question") return [];
  const a = key.key.answer;
  if (a.type === "choice") return [...a.ids];
  if (a.type === "boolean") return [a.value ? "true" : "false"];
  return [];
}
function ensure(ctx, k, owner) {
  if (!(owner in k.points) && ctx.seat(owner)) k.points[owner] = k.s.start;
}
function openQuestion(ctx, k, index) {
  k.index = index;
  k.stage = "open";
  k.carried = k.pot;
  k.picks = {};
  k.rescued_now = {};
  delete k.riding;
  delete k.counts;
  delete k.payouts;
  delete k.right;
  delete k.pot_in;
  delete k.winners;
  for (const seat of ctx.seats()) ensure(ctx, k, seat.owner);
  for (const owner of Object.keys(k.points)) {
    if (k.s.rescue && k.points[owner] < k.s.min_bet) {
      k.points[owner] = k.s.min_bet;
      k.rescued_now[owner] = true;
      k.calib_off[owner] = true;
    } else if (k.calib_off[owner] && k.points[owner] > k.s.start / 2) delete k.calib_off[owner];
    ctx.setScore(owner, k.points[owner]);
  }
  k.ends_at = ctx.now + k.s.seconds * 1e3;
  ctx.setTimer(k.ends_at);
}
function closeAnswers(ctx, k) {
  if (k.stage !== "open") return;
  const item = k.order[k.index];
  k.stage = "closed";
  k.ends_at = void 0;
  ctx.setTimer(void 0);
  const riding = {};
  const counts = {};
  const payouts = {};
  const winners = [];
  let potIn = 0;
  const owners = Object.keys(k.points).filter((o) => k.picks[o] || ctx.seat(o)?.connected);
  for (const owner of owners) {
    const held = k.points[owner];
    const pick2 = k.picks[owner];
    const rescued = !!k.calib_off[owner];
    if (!pick2) {
      const bet2 = minBetFor(k.s, held);
      potIn += bet2;
      payouts[owner] = { choice: null, bet: bet2, correct: null, bonus: 0, share: 0, change: -bet2, before: held, after: held - bet2, rescued };
      ctx.record(owner, { item, move: "bet", extra: { bet: bet2, held, confidence: held ? round2(bet2 / held) : 0, rescued, no_answer: true } });
      continue;
    }
    const marked = ctx.mark(owner, { item, move: "answer", response: pick2.response, ...pick2.time_ms !== void 0 ? { time_ms: pick2.time_ms } : {} });
    const correct = "error" in marked ? false : marked.result.correct === true;
    const bet = clampBet(k.s, held, pick2.bet);
    if (pick2.choice) {
      riding[pick2.choice] = (riding[pick2.choice] ?? 0) + bet;
      counts[pick2.choice] = (counts[pick2.choice] ?? 0) + 1;
    }
    ctx.record(owner, {
      item,
      move: "bet",
      ...pick2.choice ? { response: { choice: pick2.choice } } : {},
      correct,
      extra: { bet, held, confidence: held ? round2(bet / held) : 0, rescued, ...isFinal(k) ? { final: true } : {}, ...bet === held ? { all_in: true } : {} }
    });
    if (!rescued) (k.calibration[owner] ??= []).push({ item, bet, held, correct, rescued });
    const t = k.tally[owner] ??= { right: 0, answered: 0 };
    t.answered += 1;
    if (correct) t.right += 1;
    if (correct) winners.push({ owner, bet });
    else potIn += bet;
    payouts[owner] = { choice: pick2.choice, bet, correct, bonus: 0, share: 0, change: correct ? 0 : -bet, before: held, after: correct ? held : held - bet, rescued };
  }
  const pot = k.carried + potIn;
  const shares = winners.length ? splitPot(pot, winners) : {};
  for (const w of winners) {
    const p = payouts[w.owner];
    p.bonus = Math.round(w.bet * bonusRate(k));
    p.share = shares[w.owner] ?? 0;
    p.change = p.bonus + p.share;
    p.after = p.before + p.change;
  }
  k.riding = riding;
  k.counts = counts;
  k.payouts = payouts;
  k.right = rightOptions(ctx, item);
  k.pot_in = potIn;
  k.winners = winners.length;
}
function reveal2(ctx, k) {
  if (k.stage === "open") closeAnswers(ctx, k);
  if (k.stage !== "closed" || !k.payouts) return;
  k.stage = "revealed";
  k.before = { ...k.points };
  for (const [owner, p] of Object.entries(k.payouts)) {
    k.points[owner] = p.after;
    ctx.setScore(owner, p.after);
  }
  const pot = k.carried + (k.pot_in ?? 0);
  k.pot = k.winners ? 0 : pot;
  const total = Object.values(k.riding ?? {}).reduce((n, v) => n + v, 0);
  k.log.push({ item: k.order[k.index], riding: { ...k.riding ?? {} }, right: [...k.right ?? []], total, winners: k.winners ?? 0, answered: Object.keys(k.picks).length });
  if (!k.winners && pot > 0) ctx.ticker(`Nobody right: jackpot ${pot}`);
}
var round2 = (n) => Math.round(n * 100) / 100;
function step(ctx, k) {
  if (k.stage === "idle") openQuestion(ctx, k, 0);
  else if (k.stage === "open") closeAnswers(ctx, k);
  else if (k.stage === "closed") reveal2(ctx, k);
  else if (k.stage === "revealed") k.stage = "standings";
  else if (k.stage === "standings" || k.stage === "calibration") {
    if (k.index < k.order.length - 1) openQuestion(ctx, k, k.index + 1);
    else ctx.end();
  }
}
function calibrationOf(ctx, k) {
  return Object.entries(k.calibration).filter(([, rows]) => rows.length).map(([owner, rows]) => ({
    initials: ctx.seat(owner)?.initials ?? "?",
    confidence: round2(rows.reduce((n, r) => n + (r.held ? r.bet / r.held : 0), 0) / rows.length),
    accuracy: round2(rows.filter((r) => r.correct).length / rows.length),
    rounds: rows.length,
    big_wrong: rows.filter((r) => !r.correct && r.held && r.bet / r.held >= 0.5).length
  })).sort((a, b) => a.initials.localeCompare(b.initials));
}
function confidentMisconceptions(ctx, k) {
  const out = [];
  k.log.forEach((q, index) => {
    if (!q.total) return;
    const opts = optionsOf(shown(ctx, q.item));
    for (const [option, pts] of Object.entries(q.riding)) {
      if (q.right.includes(option) || pts / q.total < 0.3) continue;
      out.push({ item: q.item, index, option, text: opts.find((o) => o.id === option)?.text ?? option, share: round2(pts / q.total) });
    }
  });
  return out.sort((a, b) => b.share - a.share);
}
var wagerRules = {
  kind: "wager",
  init(ctx) {
    const s = wagerSettings(ctx.game.settings);
    const order2 = contentItems(ctx.game, ctx.keys).filter((i) => i.shape === "question" && shownItem(i) && ctx.keys.items[i.id]).map((i) => i.id);
    const points = {};
    for (const seat of ctx.seats()) points[seat.owner] = s.start;
    return { s, order: order2, index: -1, stage: "idle", carried: 0, pot: 0, points, calib_off: {}, rescued_now: {}, picks: {}, calibration: {}, tally: {}, log: [] };
  },
  start(ctx, k) {
    if (!k.order.length) return ctx.end();
    openQuestion(ctx, k, 0);
  },
  move(ctx, k, owner, event) {
    const item = k.order[k.index];
    if (k.stage !== "open" || !item) return err6("closed", "Answers are closed for this question.");
    if (event.item !== item || event.move !== "answer") return err6("bad_item", "That isn\u2019t the question on the board.");
    if (k.ends_at !== void 0 && ctx.now > k.ends_at + 500) return err6("closed", "Time\u2019s up for this question.");
    ensure(ctx, k, owner);
    if (!(owner in k.points)) return err6("no_seat", "Join the game first.");
    const it = shown(ctx, item);
    const choice = choiceOf(event.response);
    if (it && (it.mode === "choice" || it.mode === "truefalse") && !(choice && optionsOf(it).some((o) => o.id === choice))) return err6("bad_answer", "Pick one of the answers.");
    const bet = clampBet(k.s, k.points[owner], event.extra?.bet);
    k.picks[owner] = { response: event.response, choice, bet, ...event.time_ms !== void 0 ? { time_ms: Math.max(0, Math.round(event.time_ms)) } : {} };
    return { item };
  },
  control(ctx, k, op, from) {
    if (from.role === "student") return err6("not_allowed", "Only the teacher can do that.");
    if (op.name === "next") return void step(ctx, k);
    if (op.name === "close") return void closeAnswers(ctx, k);
    if (op.name === "reveal") return void reveal2(ctx, k);
    if (op.name === "standings" && k.stage === "revealed") return void (k.stage = "standings");
    if (op.name === "calibration" && (k.stage === "standings" || k.stage === "revealed") && isFinal(k)) return void (k.stage = "calibration");
    if (op.name === "add_time" && k.stage === "open" && k.ends_at !== void 0) {
      const secs = Number(op.data?.seconds) || 15;
      k.ends_at += Math.min(120, Math.max(5, secs)) * 1e3;
      ctx.setTimer(k.ends_at);
      return;
    }
    return err6("unknown", "That control isn\u2019t part of Wager.");
  },
  tick(ctx, k) {
    if (k.stage === "open" && k.ends_at !== void 0 && ctx.now >= k.ends_at) closeAnswers(ctx, k);
  },
  finish(ctx, k) {
    if (k.stage === "open" || k.stage === "closed") reveal2(ctx, k);
  },
  seatChanged(ctx, k, owner) {
    ensure(ctx, k, owner);
    if (owner in k.points) ctx.setScore(owner, k.points[owner]);
  },
  /** DEV ONLY: a simulated classmate answers once per question (right about 6 in 10) and bets a slice of what it holds. */
  bot(ctx, k, owner) {
    const item = k.order[k.index];
    if (k.stage !== "open" || !item || owner in k.picks || !(owner in k.points)) return null;
    const it = shown(ctx, item);
    if (!it) return null;
    const held = k.points[owner];
    const bet = isFinal(k) && ctx.random() < 0.3 ? held : Math.max(k.s.min_bet, Math.round(held * (0.1 + ctx.random() * 0.5) / 10) * 10);
    return { move: { item, move: "answer", response: botResponse2(it, ctx.keys.items[item], 0.6, () => ctx.random()), extra: { bet } } };
  },
  view(ctx, k, role, owner) {
    const itemId = k.order[k.index];
    const it = k.stage === "idle" ? null : shown(ctx, itemId);
    const answered = Object.keys(k.picks).length;
    const after = k.stage === "revealed" || k.stage === "standings" || k.stage === "calibration";
    const base3 = {
      stage: k.stage,
      index: k.index,
      of: k.order.length,
      final: isFinal(k) && k.s.final_all_in,
      bonus: bonusRate(k),
      min_bet: k.s.min_bet,
      start: k.s.start,
      ...k.ends_at !== void 0 ? { ends_at: k.ends_at } : {},
      ...it ? { item: it } : {},
      carried: k.carried,
      pot: k.pot
    };
    if (role === "student") {
      const held = k.points[owner] ?? k.s.start;
      const pick2 = k.picks[owner];
      const p = after ? k.payouts?.[owner] : void 0;
      const rank = after ? 1 + Object.values(k.points).filter((v) => v > held).length : void 0;
      return {
        ...base3,
        you: {
          points: held,
          ...k.rescued_now[owner] ? { rescued: true } : {},
          ...pick2 ? { locked: { choice: pick2.choice, bet: pick2.bet, ...pick2.choice ? {} : { text: textOf2(pick2.response) } } } : {},
          ...p ? { result: p, ...rank ? { rank, of: Object.keys(k.points).length } : {} } : {},
          ...k.stage !== "open" && !pick2 && k.payouts?.[owner] ? { missed: k.payouts[owner].bet } : {}
        },
        ...after ? { right: k.right ?? [] } : {},
        ...after && isFinal(k) ? { summary: studentSummary(k, owner) } : {}
      };
    }
    const seats = ctx.seats();
    const locked = seats.filter((s) => k.picks[s.owner]).map((s) => s.initials);
    const board = {
      ...base3,
      answered,
      seats: Object.keys(k.points).length,
      locked_initials: k.stage === "open" ? locked : [],
      ...k.stage !== "open" && k.stage !== "idle" ? { riding: k.riding ?? {}, counts: k.counts ?? {}, pot_in: k.pot_in ?? 0 } : {},
      ...after ? { right: k.right ?? [], winners: k.winners ?? 0, standings: standings(ctx, k) } : {},
      ...isFinal(k) && after ? { misconceptions: confidentMisconceptions(ctx, k) } : {},
      ...k.stage === "calibration" ? { calibration: calibrationOf(ctx, k) } : {}
    };
    return board;
  }
};
var textOf2 = (r) => r && typeof r === "object" && typeof r.text === "string" ? r.text.slice(0, 80) : "";
function standings(ctx, k) {
  const before = k.before ?? k.points;
  const rankBy = (m) => Object.keys(k.points).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0) || (ctx.seat(a)?.initials ?? "").localeCompare(ctx.seat(b)?.initials ?? ""));
  const was = rankBy(before);
  return rankBy(k.points).slice(0, 5).map((o, i) => ({ initials: ctx.seat(o)?.initials ?? "?", before: before[o] ?? 0, after: k.points[o], climbed: was.indexOf(o) > i }));
}
function studentSummary(k, owner) {
  const rows = k.calibration[owner] ?? [];
  const t = k.tally[owner] ?? { right: 0, answered: 0 };
  return {
    right: t.right,
    of: k.order.length,
    confidence: rows.length ? round2(rows.reduce((n, r) => n + (r.held ? r.bet / r.held : 0), 0) / rows.length) : null,
    accuracy: rows.length ? round2(rows.filter((r) => r.correct).length / rows.length) : null
  };
}
registerRules(wagerRules);

// apps/teaching/src/games/kinds/wheel/shared.ts
var WHEEL_SEGMENTS = [300, 700, 400, "bankrupt", 500, 900, 200, 600, "lose", 350, 800, 250, 1e3, 450, 150, 550];
var VOWELS = "AEIOU";
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var WHEEL = {
  /** Board spin animation budget: physics stops inside this, then the landing shows. */
  spinMs: 5600,
  /** A value showing before the letter question opens. */
  valueMs: 1400,
  /** Bankrupt / Lose a turn stamp. */
  stampMs: 2400,
  questionMs: 15e3,
  qclosedMs: 1900,
  /** The captain's time to call a letter before play passes on. */
  letterMs: 3e4,
  /** Letters turning over: a beat, then one per letter, then a pause. */
  flipBaseMs: 1500,
  flipEachMs: 380,
  /** After the first solve, others may still solve for their record. */
  solvedMs: 1e4,
  explainMs: 2e4,
  solveBonus: 500,
  /** A solve this fast with nothing showing is an outlier (likely had the text open). */
  outlierMs: 3e3
};
var stripMarks = (s) => s.normalize("NFD").replace(/\p{M}+/gu, "");
function puzzleBoard(text) {
  return stripMarks(String(text ?? "")).toUpperCase().replace(/_/g, "-").replace(/\s+/g, " ").trim();
}
var isLetter = (ch) => ch >= "A" && ch <= "Z" && ch.length === 1;
var lettersOf = (board) => [...board].filter(isLetter);
var solveForm = (s) => stripMarks(String(s ?? "")).toUpperCase().replace(/[^A-Z]/g, "");
function maskBoard(board, shown2) {
  const on = new Set(shown2);
  return [...board].map((ch) => isLetter(ch) && !on.has(ch) ? "_" : ch).join("");
}
function shownCount(board, shown2) {
  const on = new Set(shown2);
  return lettersOf(board).filter((ch) => on.has(ch)).length;
}
function lettersNeededAt(shown2, total, ms) {
  return { shown: shown2, total, pct: total ? shown2 / total : 0, outlier: shown2 === 0 && ms < WHEEL.outlierMs, ms };
}

// apps/teaching/src/games/kinds/wheel/rules.ts
function puzzlesOf(keys) {
  const live2 = keys.live?.wheel?.puzzles ?? [];
  return live2.flatMap((p) => {
    const key = keys.items[p.id];
    const line = key && key.shape === "term" ? key.answers[0] ?? "" : "";
    if (!line) return [];
    return [{ ...p, line, board: puzzleBoard(line), tags: key && "tags" in key ? key.tags : [] }];
  });
}
var publicItem = (keys, id) => keys.live?.items.find((i) => i.id === id);
var err7 = (code, message) => ({ error: { code, message } });
var tk = (t) => String(t);
function vowelCost(ctx) {
  const v = Number(ctx.game.settings?.vowel_cost);
  return Number.isFinite(v) && v >= 0 ? v : 250;
}
function lockMs(ctx) {
  const v = Number(ctx.game.settings?.lockout_seconds);
  return (Number.isFinite(v) && v > 0 ? v : 20) * 1e3;
}
var puzzle = (ctx, k) => puzzlesOf(ctx.keys)[k.p];
var teamNow = (k) => k.order[k.turn % Math.max(1, k.order.length)] ?? 0;
var teamOf2 = (ctx, owner) => ctx.seat(owner)?.team;
var studentSeats = (ctx) => ctx.seats().filter((s) => s.owner !== "teacher" && s.owner !== "board");
function setTimer(ctx, k, ms) {
  k.ends_at = ms === void 0 ? void 0 : ctx.now + ms;
  ctx.setTimer(k.ends_at);
}
function captainOf3(ctx, k, team) {
  const members = ctx.members(team);
  const on = members.filter((m) => ctx.seat(m)?.connected);
  const list = on.length ? on : members;
  if (!list.length) return void 0;
  return list[(k.cap[tk(team)] ?? 0) % list.length];
}
function openPuzzle(ctx, k, p) {
  Object.assign(k, { p, used: [], solves: {}, wrong: 0, locks: {}, bankI: 0, opened_at: ctx.now });
  delete k.first;
  delete k.winner;
  delete k.pending;
  for (const t of k.order) k.round[tk(t)] = 0;
  startTurn2(ctx, k);
}
function startTurn2(ctx, k) {
  k.stage = "turn";
  k.captain = captainOf3(ctx, k, teamNow(k));
  delete k.q;
  delete k.value;
  delete k.landed;
  delete k.last;
  setTimer(ctx, k, void 0);
}
function nextTurn(ctx, k) {
  const t = tk(teamNow(k));
  k.cap[t] = (k.cap[t] ?? 0) + 1;
  k.turn += 1;
  startTurn2(ctx, k);
}
function spin(ctx, k, power) {
  const seg = Math.min(WHEEL_SEGMENTS.length - 1, Math.floor(ctx.random() * WHEEL_SEGMENTS.length));
  k.spins += 1;
  k.spin = { n: k.spins, seg, power: Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0.6)), at: ctx.now, ends_at: ctx.now + WHEEL.spinMs };
  k.stage = "spinning";
  delete k.landed;
  delete k.value;
  setTimer(ctx, k, WHEEL.spinMs);
}
function land(ctx, k) {
  const seg = k.spin?.seg ?? 0;
  const v = WHEEL_SEGMENTS[seg];
  const t = tk(teamNow(k));
  k.stage = "landed";
  if (v === "bankrupt") {
    k.landed = { seg, lost: k.round[t] ?? 0 };
    k.round[t] = 0;
    setTimer(ctx, k, WHEEL.stampMs);
  } else if (v === "lose") {
    k.landed = { seg };
    setTimer(ctx, k, WHEEL.stampMs);
  } else {
    k.landed = { seg };
    k.value = v;
    setTimer(ctx, k, WHEEL.valueMs);
  }
}
function askLetterQuestion(ctx, k) {
  const pz = puzzle(ctx, k);
  const bank = (pz?.bank ?? []).filter((id) => publicItem(ctx.keys, id) && ctx.keys.items[id]);
  if (!bank.length) {
    k.stage = "letter";
    setTimer(ctx, k, WHEEL.letterMs);
    return;
  }
  const team = teamNow(k);
  const members = ctx.members(team);
  const on = members.filter((m) => ctx.seat(m)?.connected);
  const item = bank[k.bankI % bank.length];
  k.bankI += 1;
  k.q = { kind: "letter", item, team, asked: on.length ? on : members, answers: {}, opened_at: ctx.now };
  k.stage = "question";
  setTimer(ctx, k, WHEEL.questionMs);
}
function closeLetterQuestion(ctx, k) {
  const q = k.q;
  if (!q || q.kind !== "letter" || q.closed) return;
  q.closed = true;
  q.n = q.asked.length;
  q.r = q.asked.filter((m) => q.answers[m]?.correct).length;
  q.ok = q.n > 0 && q.r * 2 >= q.n;
  k.stage = "qclosed";
  setTimer(ctx, k, WHEEL.qclosedMs);
}
function callLetter(ctx, k, raw) {
  const pz = puzzle(ctx, k);
  if (!pz) return err7("no_puzzle", "No puzzle is open.");
  const letter = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (letter.length !== 1 || !ALPHABET.includes(letter)) return err7("bad_letter", "Pick a letter A to Z.");
  if (k.used.includes(letter)) return err7("used", `${letter} has been called already.`);
  const vowel = VOWELS.includes(letter);
  const t = tk(teamNow(k));
  if (vowel) {
    if (k.stage !== "turn" && k.stage !== "letter") return err7("not_now", "Buy a vowel on your turn.");
    const cost = vowelCost(ctx);
    if ((k.round[t] ?? 0) < cost) return err7("short", `A vowel costs ${cost} round points.`);
    k.round[t] = (k.round[t] ?? 0) - cost;
  } else if (k.stage !== "letter") return err7("not_now", "Earn a letter first: spin and answer.");
  const count = lettersOf(pz.board).filter((ch) => ch === letter).length;
  const won = vowel ? 0 : count * (k.value ?? 0);
  k.used = [...k.used, letter];
  k.round[t] = (k.round[t] ?? 0) + won;
  k.last = { letter, count, vowel, won };
  k.stage = "revealing";
  setTimer(ctx, k, WHEEL.flipBaseMs + count * WHEEL.flipEachMs);
}
function solvedMoment(ctx, k) {
  delete k.pending;
  const team = k.first ? teamOf2(ctx, k.first) : void 0;
  const bank = team === void 0 ? 0 : Math.max(0, k.round[tk(team)] ?? 0) + WHEEL.solveBonus;
  if (team !== void 0) {
    k.bank[tk(team)] = (k.bank[tk(team)] ?? 0) + bank;
    ctx.addTeamScore(team, bank);
  }
  k.winner = { team: team ?? -1, bank };
  for (const t of k.order) k.round[tk(t)] = 0;
  delete k.q;
  k.stage = "solved";
  setTimer(ctx, k, WHEEL.solvedMs);
}
function revealPuzzle(ctx, k) {
  const pz = puzzle(ctx, k);
  if (!pz) return;
  if (!k.winner) for (const t of k.order) k.round[tk(t)] = 0;
  delete k.pending;
  delete k.q;
  k.used = [.../* @__PURE__ */ new Set([...k.used, ...lettersOf(pz.board)])];
  k.stage = "revealed";
  k.played[k.p] = { puzzle: pz.id, category: pz.category, solves: { ...k.solves } };
  setTimer(ctx, k, void 0);
}
function openExplain(ctx, k) {
  const pz = puzzle(ctx, k);
  if (!pz?.explain || !publicItem(ctx.keys, pz.explain)) return void totals(ctx, k);
  const on = studentSeats(ctx).filter((s) => s.connected).map((s) => s.owner);
  k.q = { kind: "explain", item: pz.explain, asked: on, answers: {}, opened_at: ctx.now };
  k.stage = "explain";
  setTimer(ctx, k, WHEEL.explainMs);
}
function closeExplain(ctx, k) {
  if (!k.q || k.q.kind !== "explain") return;
  k.q.closed = true;
  k.stage = "ex_closed";
  setTimer(ctx, k, void 0);
}
function revealExplain(ctx, k) {
  if (!k.q || k.q.kind !== "explain") return;
  const played = k.played[k.p];
  if (played) played.explain = Object.fromEntries(Object.entries(k.q.answers).map(([o, a]) => [o, a.correct]));
  k.stage = "ex_revealed";
  setTimer(ctx, k, void 0);
}
function totals(ctx, k) {
  delete k.q;
  k.stage = "totals";
  setTimer(ctx, k, void 0);
}
function nextPuzzle(ctx, k) {
  if (k.p + 1 >= puzzlesOf(ctx.keys).length) return void ctx.end();
  const t = tk(teamNow(k));
  k.cap[t] = (k.cap[t] ?? 0) + 1;
  k.turn += 1;
  openPuzzle(ctx, k, k.p + 1);
}
function advance(ctx, k) {
  switch (k.stage) {
    case "turn":
      return spin(ctx, k, 0.6);
    case "question":
      return closeLetterQuestion(ctx, k);
    case "solved":
      return revealPuzzle(ctx, k);
    case "revealed":
      return openExplain(ctx, k);
    case "explain":
      return closeExplain(ctx, k);
    case "ex_closed":
      return revealExplain(ctx, k);
    case "ex_revealed":
      return totals(ctx, k);
    case "totals":
      return nextPuzzle(ctx, k);
    default:
      return;
  }
}
var SOLVING = /* @__PURE__ */ new Set(["turn", "spinning", "landed", "question", "qclosed", "letter", "revealing", "solved"]);
var DEFER = /* @__PURE__ */ new Set(["spinning", "landed", "qclosed", "revealing"]);
function solve(ctx, k, owner, e) {
  const pz = puzzle(ctx, k);
  if (!pz || e.item !== pz.id) return err7("bad_item", "That isn\u2019t the puzzle on the board.");
  if (!SOLVING.has(k.stage)) return err7("closed", "Solving is closed for this quote.");
  if (k.solves[owner]) return { item: pz.id, correct: true, again: true };
  const until = k.locks[owner] ?? 0;
  if (until > ctx.now) return err7("locked", `Solve is locked for ${Math.ceil((until - ctx.now) / 1e3)} s.`);
  const r = e.response;
  const text = typeof r?.text === "string" ? r.text.slice(0, 200) : "";
  if (!solveForm(text)) return err7("empty", "Type the whole line.");
  const shown2 = shownCount(pz.board, k.used);
  const total = lettersOf(pz.board).length;
  const ms = Math.max(0, ctx.now - k.opened_at);
  const extra = { letters_showing: shown2, letters_total: total, letters_pct: Math.round((total ? shown2 / total : 0) * 100) };
  if (solveForm(text) !== solveForm(pz.line)) {
    k.locks[owner] = ctx.now + lockMs(ctx);
    k.wrong += 1;
    ctx.record(owner, { item: pz.id, move: "solve", response: { text }, correct: false, time_ms: ms, extra });
    return { item: pz.id, correct: false };
  }
  const first = !k.first && k.stage !== "solved";
  const need = lettersNeededAt(shown2, total, ms);
  k.solves[owner] = { ...need, at: ctx.now, first };
  ctx.record(owner, { item: pz.id, move: "solve", correct: true, time_ms: ms, extra: { ...extra, outlier: need.outlier, first } });
  if (first) {
    k.first = owner;
    if (DEFER.has(k.stage)) k.pending = true;
    else solvedMoment(ctx, k);
  }
  return { item: pz.id, correct: true };
}
function answer2(ctx, k, owner, e) {
  const q = k.q;
  if (!q || q.closed || e.item !== q.item) return err7("closed", "That question isn\u2019t open.");
  if (q.kind === "letter" && !q.asked.includes(owner)) return err7("not_yours", "This one is for the spinning team.");
  if (q.answers[owner]) return { item: q.item };
  const solved = k.solves[owner];
  const extra = q.kind === "explain" ? { solved: !!solved, ...solved ? { letters_pct: Math.round(solved.pct * 100), early: solved.pct < 0.5 && !solved.outlier } : {} } : { letter_question: true, ...k.value ? { value: k.value } : {} };
  const out = ctx.mark(owner, { item: q.item, move: "answer", response: e.response, time_ms: Math.max(0, ctx.now - q.opened_at), extra, ...e.cid ? { cid: e.cid } : {} });
  if ("error" in out) return out;
  const stored = out.stored?.response;
  const pick2 = Array.isArray(stored?.selected) ? stored.selected : typeof stored?.value === "boolean" ? [String(stored.value)] : void 0;
  q.answers[owner] = { correct: out.result.correct === true, ...pick2 ? { pick: pick2 } : {} };
  if (q.kind === "explain" && !q.asked.includes(owner)) q.asked.push(owner);
  const everyone = q.asked.every((m) => q.answers[m] || !ctx.seat(m)?.connected);
  if (everyone) {
    if (q.kind === "letter") closeLetterQuestion(ctx, k);
    else closeExplain(ctx, k);
  }
  return { item: q.item };
}
function splitFor(solves, answers) {
  const early = { n: 0, right: 0 };
  const late = { n: 0, right: 0 };
  for (const [owner, right] of Object.entries(answers)) {
    const s = solves[owner];
    const bin = s && !s.outlier && s.pct < 0.5 ? early : late;
    bin.n += 1;
    if (right) bin.right += 1;
  }
  return { early, late };
}
function countsFor(q) {
  const counts = {};
  for (const a of Object.values(q.answers)) for (const id of a.pick ?? []) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
function heatOf(ctx, k) {
  const pzs = puzzlesOf(ctx.keys);
  const played = pzs.map((_, i) => i === k.p && k.stage !== "totals" && !k.played[i] ? { solves: k.solves, explain: void 0 } : k.played[i]);
  return {
    puzzles: pzs.map((p) => ({ id: p.id, category: p.category })),
    rows: studentSeats(ctx).map((s) => ({
      initials: s.initials,
      cells: played.map((pl) => {
        const v = pl?.solves[s.owner];
        return v ? { shown: v.shown, total: v.total, pct: v.pct, outlier: v.outlier, first: v.first } : null;
      })
    })),
    explain: played.map((pl) => pl?.explain ? splitFor(pl.solves, pl.explain) : null)
  };
}
function view(ctx, k, role, owner) {
  const pzs = puzzlesOf(ctx.keys);
  const pz = pzs[k.p];
  if (!pz) return null;
  const revealed = !SOLVING.has(k.stage);
  const letters = lettersOf(pz.board);
  const q = k.q;
  const showResult = !!q && (q.kind === "letter" && q.closed || q.kind === "explain" && k.stage === "ex_revealed");
  const key = q ? ctx.keys.items[q.item] : void 0;
  const item = q ? publicItem(ctx.keys, q.item) : void 0;
  const now = ctx.now;
  const out = {
    stage: k.stage,
    p: k.p,
    of: pzs.length,
    category: pz.category,
    puzzle: pz.id,
    board: maskBoard(pz.board, k.used),
    total: letters.length,
    shown: shownCount(pz.board, k.used),
    used: [...k.used],
    hits: k.used.filter((l) => letters.includes(l)),
    vowel_cost: vowelCost(ctx),
    lockout_seconds: lockMs(ctx) / 1e3,
    turn_team: teamNow(k),
    ...k.captain ? { captain: ctx.seat(k.captain)?.initials } : {},
    teams: k.order.map((t) => {
      const cap = captainOf3(ctx, k, t);
      return { team: t, round: k.round[tk(t)] ?? 0, bank: k.bank[tk(t)] ?? 0, size: ctx.members(t).length, ...cap ? { captain: ctx.seat(cap)?.initials } : {} };
    }),
    ...k.spin ? { spin: { ...k.spin } } : {},
    ...k.landed && k.stage !== "spinning" ? { landed: { seg: k.landed.seg, segment: WHEEL_SEGMENTS[k.landed.seg], ...k.landed.lost !== void 0 ? { lost: k.landed.lost } : {} } } : {},
    ...k.value !== void 0 ? { value: k.value } : {},
    ...k.last ? { last: { ...k.last } } : {},
    solves: { solved: Object.keys(k.solves).length, wrong: k.wrong, locked: Object.values(k.locks).filter((u) => u > now).length },
    ...k.winner ? { winner: { team: k.winner.team, bank: k.winner.bank, ...role !== "student" && role !== "board" && k.first ? { initials: ctx.seat(k.first)?.initials } : {} } } : {},
    ...revealed ? { line: pz.line } : {},
    ...k.stage === "ex_revealed" && q?.kind === "explain" ? { split: splitFor(k.solves, Object.fromEntries(Object.entries(q.answers).map(([o, a]) => [o, a.correct]))) } : {},
    ...k.ends_at ? { ends_at: k.ends_at } : {}
  };
  if (q && item) {
    out.q = {
      kind: q.kind,
      item,
      ...q.team !== void 0 ? { team: q.team } : {},
      asked: q.asked.length,
      answered: q.asked.filter((m) => q.answers[m]).length,
      dots: q.asked.map((m) => !!q.answers[m]),
      closed: !!q.closed,
      ...showResult ? {
        result: {
          counts: countsFor(q),
          ...key?.shape === "question" ? { key: key.key } : {},
          ...key?.shape === "term" ? { term: key.label } : {},
          ...q.kind === "letter" ? { r: q.r, n: q.n, ok: q.ok } : {}
        }
      } : {}
    };
  }
  if (role === "student") {
    const mine = k.solves[owner];
    const a = q?.answers[owner];
    out.you = {
      ...teamOf2(ctx, owner) !== void 0 ? { team: teamOf2(ctx, owner) } : {},
      captain: k.captain === owner,
      ...mine ? { solve: { shown: mine.shown, total: mine.total, pct: mine.pct, outlier: mine.outlier } } : {},
      ...(k.locks[owner] ?? 0) > now ? { locked_until: k.locks[owner] } : {},
      answered: !!a,
      ...a?.pick ? { pick: a.pick } : {},
      ...a && showResult ? { correct: a.correct } : {},
      history: pzs.map((p, i) => {
        const pl = i === k.p && !k.played[i] ? { solves: k.solves } : k.played[i];
        const s = pl?.solves[owner];
        return { category: p.category, played: !!pl, solve: s ? { shown: s.shown, total: s.total, pct: s.pct, outlier: s.outlier } : null };
      })
    };
  } else {
    out.heat = heatOf(ctx, k);
  }
  return out;
}
var wheelRules = {
  kind: "wheel",
  teams: { min: 2, max: 4, default: 4 },
  init(ctx) {
    return { p: 0, stage: "turn", order: [], turn: 0, cap: {}, round: {}, bank: {}, used: [], spins: 0, bankI: 0, solves: {}, wrong: 0, locks: {}, opened_at: ctx.now, played: [] };
  },
  start(ctx, k) {
    k.order = ctx.teams().length ? ctx.teams() : [0];
    for (const t of k.order) {
      k.bank[tk(t)] = 0;
      k.cap[tk(t)] = 0;
    }
    openPuzzle(ctx, k, 0);
  },
  move(ctx, k, owner, e) {
    if (!ctx.seat(owner)) return err7("no_seat", "Join the room first.");
    if (e.move === "solve") return solve(ctx, k, owner, e);
    if (e.move === "answer") return answer2(ctx, k, owner, e);
    return err7("bad_move", "That move isn\u2019t part of this game.");
  },
  control(ctx, k, op, from) {
    const teacher = from.role === "teacher" || from.role === "board";
    const captain = from.role === "student" && from.owner === k.captain;
    const data = op.data ?? {};
    switch (op.name) {
      case "spin":
        if (k.stage !== "turn") return err7("not_now", "Not time to spin.");
        if (!teacher && !captain) return err7("not_captain", "Only the captain spins.");
        return spin(ctx, k, Number(data.power ?? 0.6));
      case "letter":
        if (!teacher && !captain) return err7("not_captain", "Only the captain calls a letter.");
        return callLetter(ctx, k, data.letter);
      case "skip":
        if (!teacher) return err7("teacher_only", "Only the teacher can skip a turn.");
        if (k.stage === "turn" || k.stage === "letter") return nextTurn(ctx, k);
        return;
      default:
        break;
    }
    if (!teacher) return err7("teacher_only", "That\u2019s a teacher control.");
    switch (op.name) {
      case "next":
        return advance(ctx, k);
      case "close":
        if (k.stage === "question") return closeLetterQuestion(ctx, k);
        if (k.stage === "explain") return closeExplain(ctx, k);
        return;
      case "reveal":
        if (SOLVING.has(k.stage)) return revealPuzzle(ctx, k);
        if (k.stage === "explain") closeExplain(ctx, k);
        if (k.stage === "ex_closed") return revealExplain(ctx, k);
        return;
      case "explain":
        if (k.stage === "revealed") return openExplain(ctx, k);
        return;
      case "totals":
        if (k.stage === "ex_revealed" || k.stage === "revealed" || k.stage === "ex_closed") return totals(ctx, k);
        return;
      case "next_puzzle":
        if (k.stage === "totals") return nextPuzzle(ctx, k);
        return;
      default:
        return err7("bad_control", "Unknown control.");
    }
  },
  tick(ctx, k) {
    switch (k.stage) {
      case "spinning":
        return land(ctx, k);
      case "landed":
        if (k.pending) return solvedMoment(ctx, k);
        if (k.value !== void 0) return askLetterQuestion(ctx, k);
        return nextTurn(ctx, k);
      case "question":
        return closeLetterQuestion(ctx, k);
      case "qclosed":
        if (k.pending) return solvedMoment(ctx, k);
        if (k.q?.ok) {
          k.stage = "letter";
          return setTimer(ctx, k, WHEEL.letterMs);
        }
        return nextTurn(ctx, k);
      case "letter":
        return nextTurn(ctx, k);
      case "revealing": {
        if (k.pending) return solvedMoment(ctx, k);
        const pz = puzzle(ctx, k);
        if (pz && shownCount(pz.board, k.used) === lettersOf(pz.board).length) return revealPuzzle(ctx, k);
        if ((k.last?.count ?? 0) > 0) return startTurn2(ctx, k);
        return nextTurn(ctx, k);
      }
      case "solved":
        return revealPuzzle(ctx, k);
      case "explain":
        return closeExplain(ctx, k);
      default:
        return;
    }
  },
  finish(ctx, k) {
    if (k.q && !k.q.closed) k.q.closed = true;
    setTimer(ctx, k, void 0);
  },
  seatChanged(ctx, k, owner) {
    if (k.captain === owner && !ctx.seat(owner)?.connected && (k.stage === "turn" || k.stage === "letter")) {
      const t = tk(teamNow(k));
      k.cap[t] = (k.cap[t] ?? 0) + 1;
      k.captain = captainOf3(ctx, k, teamNow(k));
    }
    const q = k.q;
    if (q && !q.closed && q.asked.length && q.asked.every((m) => q.answers[m] || !ctx.seat(m)?.connected) && Object.keys(q.answers).length) {
      if (q.kind === "letter") closeLetterQuestion(ctx, k);
      else closeExplain(ctx, k);
    }
  },
  view(ctx, k, role, owner) {
    return view(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    return botMove(ctx, k, owner);
  }
};
function botMove(ctx, k, owner) {
  const pz = puzzle(ctx, k);
  if (!pz) return null;
  const r = ctx.random();
  const q = k.q;
  if (q && !q.closed && !q.answers[owner] && (q.kind === "explain" || q.asked.includes(owner))) {
    const key = ctx.keys.items[q.item];
    const pub = publicItem(ctx.keys, q.item);
    const right = r < 0.65;
    let response = { text: "not sure" };
    if (key?.shape === "term") response = { text: right ? key.answers[0] : "not sure" };
    if (key?.shape === "question" && key.key.answer.type === "choice") {
      const ok = key.key.answer.ids;
      const opts = pub?.shape === "question" ? (pub.question.options ?? []).map((o) => o.id) : [];
      response = { selected: [right ? ok[0] : opts.find((o) => !ok.includes(o)) ?? ok[0]] };
    }
    if (key?.shape === "question" && key.key.answer.type === "boolean") response = { value: right ? key.key.answer.value : !key.key.answer.value };
    return { move: { item: q.item, move: "answer", response } };
  }
  if (k.captain === owner && k.stage === "turn") return { control: { name: "spin", data: { power: 0.3 + r * 0.7 } } };
  if (k.captain === owner && k.stage === "letter") {
    const unused = [...ALPHABET].filter((l) => !VOWELS.includes(l) && !k.used.includes(l));
    const inLine = unused.filter((l) => pz.board.includes(l));
    const pickFrom = inLine.length && r < 0.75 ? inLine : unused;
    return pickFrom.length ? { control: { name: "letter", data: { letter: pickFrom[Math.floor(ctx.random() * pickFrom.length)] } } } : null;
  }
  if (SOLVING.has(k.stage) && !k.solves[owner] && (k.locks[owner] ?? 0) <= ctx.now) {
    const share = shownCount(pz.board, k.used) / Math.max(1, lettersOf(pz.board).length);
    if (share > 0.3 && r < share * 0.12) return { move: { item: pz.id, move: "solve", response: { text: ctx.random() < 0.3 + share * 0.6 ? pz.line : `${pz.line} again` } } };
  }
  return null;
}
registerRules(wheelRules);

// apps/teaching/src/games/core/events.ts
import { z as z4 } from "zod";
var GAME_MOVES = ["answer", "solve", "guess", "bet", "hint", "judge", "describe", "draw", "pass", "buzz", "tap"];
var MARKED_MOVES = /* @__PURE__ */ new Set(["answer", "solve", "guess", "tap"]);
var STRENGTHS = ["live_solo", "live_team", "self_paced"];
var Extra = z4.record(z4.string().max(40), z4.union([z4.number(), z4.string().max(200), z4.boolean()]));
var GameEventSchema = z4.object({
  seq: z4.number().int().min(0),
  at: z4.number().int().min(0),
  game: GameKindSchema,
  play_id: z4.string().min(1).max(40),
  owner: z4.string().min(1).max(64),
  student_id: z4.string().max(64).optional(),
  team: z4.string().max(40).optional(),
  /** Item id within the game (a wall id for a Connections guess). */
  item: z4.string().min(1).max(40),
  move: z4.enum(GAME_MOVES),
  /** The cleaned answer. */
  response: z4.unknown().optional(),
  correct: z4.boolean().nullable().optional(),
  /** From the item shown to the move. */
  time_ms: z4.number().int().min(0).max(36e5).optional(),
  /** Per kind: hints, bet, letters_showing, confused_with, group, one_away… */
  extra: Extra.optional(),
  strength: z4.enum(STRENGTHS),
  /** The phone's own id for the move: a batch sent twice never stores it twice. */
  cid: z4.string().max(40).optional()
});
var SoloEventInputSchema = z4.object({
  /** Made by the phone's queue, once per move, so a retried batch is recognised (games.mjs dedupes on it). */
  cid: z4.string().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
  item: z4.string().min(1).max(40),
  move: z4.enum(GAME_MOVES),
  response: z4.unknown().optional(),
  time_ms: z4.number().int().min(0).max(36e5).optional(),
  extra: Extra.optional()
});
var PLAY_EVENTS_MAX = 600;
var REVEAL_HINTS = 3;

// apps/teaching/src/games/core/mark.ts
function revealFor(kind, key, check) {
  if (key.shape === "quote" && kind === "who_said_it") return { speaker: key.speaker, ...key.source ? { source: key.source } : {}, ...key.why_fake ? { why_fake: key.why_fake } : {} };
  if (key.shape === "wall" && check.group) {
    const g = key.groups.find((x) => x.id === check.group);
    return g ? { group: { id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: g.tiles } } : void 0;
  }
  if (key.shape === "question" && kind !== "points_rush") return { key: key.key };
  return void 0;
}
var wallMistakes = (game) => Number(game?.settings?.mistakes) || 4;
function markMove(game, keys, history, e, now, who) {
  const kind = keys.kind;
  if (e.cid) {
    const repeat = history.find((x) => x.cid === e.cid);
    if (repeat) return { result: repeat.reply ?? { item: repeat.item }, stored: null };
  }
  const grid = keys.grid ?? null;
  const hintsOn = (item2) => history.filter((x) => x.move === "hint" && x.item === item2).length;
  const solved = (item2) => history.some((x) => x.item === item2 && x.correct === true);
  const selection = kind === "find_a_word" && grid?.kind === "wordsearch" && e.move === "answer" && (e.item === "any" || keys.items[e.item]?.shape === "term");
  const key = keys.items[e.item];
  if (!key && !selection) return { result: { item: e.item }, stored: null, error: "bad_item" };
  const extra = { ...e.extra ?? {} };
  for (const k of ["group", "one_away", "confused_with", "hints"]) delete extra[k];
  let item = e.item;
  let correct = null;
  let response;
  let keep = true;
  const out = { item: e.item };
  if (selection && grid?.kind === "wordsearch") {
    const check = checkSelection(grid, e.item === "any" ? null : e.item, e.response);
    if (!check.item || !check.response) return { result: { item: e.item, correct: false }, stored: null };
    item = check.item;
    response = check.response;
    if (check.correct === true && solved(item)) return { result: { item, correct: true, again: true }, stored: null };
    if (check.correct !== null) correct = check.correct;
    if (check.decoy) extra.confused_with = check.decoy;
    if (check.correct === null && !check.decoy) keep = false;
    extra.hints = hintsOn(item);
    Object.assign(out, { item, correct: check.correct === true, ...check.decoy ? { decoy: true } : {} });
  } else if (key && MARKED_MOVES.has(e.move)) {
    const check = checkAnswer(key, e.response);
    correct = check.correct;
    response = check.response;
    if (check.group) extra.group = check.group;
    if (check.one_away) extra.one_away = true;
    if (check.decoy) extra.confused_with = check.decoy;
    if (grid && key.shape === "term") extra.hints = hintsOn(e.item);
    Object.assign(out, { correct, ...check.one_away ? { one_away: true } : {}, ...check.decoy ? { decoy: true } : {} });
    const reveal3 = revealFor(kind, key, check);
    if (reveal3) out.reveal = reveal3;
  } else if (e.move === "pass" && key?.shape === "wall") {
    const wrong = history.filter((x) => x.item === e.item && x.move === "guess" && x.correct === false).length;
    if (wrong >= wallMistakes(game)) {
      const got = new Set(history.filter((x) => x.item === e.item && x.correct === true && typeof x.extra?.group === "string").map((x) => x.extra?.group));
      out.reveal = { groups: key.groups.filter((g) => !got.has(g.id)).map(({ id, label, why, difficulty, tiles: tiles2 }) => ({ id, label, why, difficulty, tiles: tiles2 })) };
    }
  } else if (e.move === "hint" && grid && key?.shape === "term") {
    const step2 = Math.min(REVEAL_HINTS, hintsOn(e.item) + 1);
    extra.hints = step2;
    if (grid.hints !== false) {
      if (grid.kind === "crossword") {
        const r = e.response;
        const typed = typeof r?.letters === "string" ? r.letters.slice(0, 15) : "";
        response = { letters: typed };
        out.reveal = { step: step2, cells: crosswordHint(grid, e.item, step2, typed) };
      } else out.reveal = { step: step2, ...wordHint(grid, e.item, step2) };
    }
  }
  if (correct === true && grid?.kind === "wordsearch" && grid.message) {
    const terms = Object.entries(keys.items).filter(([, x]) => x.shape === "term").map(([id]) => id);
    if (terms.every((id) => id === item || solved(id))) out.reveal = { ...out.reveal ?? {}, message: grid.message };
  }
  if (!keep) return { result: out, stored: null };
  const stored = {
    at: now,
    game: kind,
    play_id: who.play_id,
    owner: who.owner,
    ...who.student_id ? { student_id: who.student_id } : {},
    item,
    move: e.move,
    ...response !== void 0 ? { response } : {},
    ...correct !== null ? { correct } : {},
    ...e.time_ms !== void 0 ? { time_ms: e.time_ms } : {},
    ...Object.keys(extra).length ? { extra } : {},
    strength: who.strength,
    ...e.cid ? { cid: e.cid, reply: out } : {}
  };
  return { result: out, stored };
}
function quotePoints(correct, fake, ms, seconds2) {
  if (!correct) return 0;
  const share = Math.max(0, 1 - ms / Math.max(1, seconds2 * 1e3));
  return (100 + Math.round(share * 10) * 10) * (fake ? 2 : 1);
}

// apps/teaching/src/games/core/room-protocol.ts
var TEAM_NAMES2 = ["Kestrels", "Otters", "Foxes", "Herons", "Wrens", "Magpies"];
var teamName2 = (team) => TEAM_NAMES2[team] ?? `Team ${team + 1}`;
var ROOM_LIMITS = {
  seats: 40,
  /** Messages per seat per 10 s before the room starts dropping them. */
  burst: 60,
  countdownMs: 3e3,
  pacedSeconds: 20,
  /** A room closes itself (and folds) after this. */
  lifeMs: 6 * 60 * 60 * 1e3,
  /** Fold retries with backoff for this long. */
  foldRetryMs: 24 * 60 * 60 * 1e3,
  /** Client: switch to HTTPS polling if the socket isn't open in this time, or drops this many times in a minute. */
  socketOpenMs: 4e3,
  socketDropsPerMinute: 3,
  pollMs: 1e3,
  pingEveryMs: 3e4,
  /** Show at most this many on the board's leaderboard for individual games. */
  leaderboardTop: 5
};

// apps/teaching/src/games/core/room-core.ts
var RACE_KINDS = /* @__PURE__ */ new Set(["crossword", "find_a_word", "connections"]);
var PACED_KINDS = /* @__PURE__ */ new Set(["who_said_it"]);
var GROUP_COLOURS = { 1: "gold", 2: "green", 3: "blue", 4: "purple" };
var TICKER_MAX = 8;
var SEEN_MAX = 200;
var RATE_WINDOW_MS = 1e4;
var CLASS_WALL_MAX = 8;
function roomStyle(kind) {
  if (RACE_KINDS.has(kind)) return "race";
  if (PACED_KINDS.has(kind)) return "paced";
  if (rulesFor(kind)) return "custom";
  return null;
}
function roomTeams(kind) {
  if (RACE_KINDS.has(kind) || PACED_KINDS.has(kind)) return null;
  const t = rulesFor(kind)?.teams;
  return t ? { ...t } : null;
}
var rulesOf = (s) => s.config.style === "custom" ? rulesFor(s.config.game.kind) : void 0;
function teamCount(s) {
  const t = rulesOf(s)?.teams;
  if (!t) return 0;
  const raw = Math.round(Number(s.config.teams?.count ?? t.default));
  return Math.max(t.min, Math.min(t.max, Number.isFinite(raw) ? raw : t.default));
}
var keysOf = (s) => s.config.keys;
var isStudent = (role) => role === "student";
var pacedItems = (s) => (s.config.game.items ?? []).map((i) => i.id);
function itemSeconds(s) {
  const raw = Number(s.config.item_seconds ?? s.config.game.settings?.seconds);
  return Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.min(300, Math.round(raw))) : ROOM_LIMITS.pacedSeconds;
}
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function nextRandom(s) {
  const a = (s.rng ?? 0) + 1831565813 >>> 0;
  s.rng = a;
  let t = a;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function initialState(config, now) {
  const s = {
    config,
    phase: "lobby",
    seq: 0,
    seats: {},
    history: {},
    item_index: -1,
    ticker: [],
    board_view: "race",
    seen: {},
    conns: {},
    students: {},
    kicked: {},
    rate: {},
    last: {},
    first: {},
    at: now,
    rng: seedOf(config.room)
  };
  const rules = rulesOf(s);
  if (rules) {
    if (rules.teams) s.team_scores = {};
    const k = safe(() => rules.init(rulesCtx(s, now, null)));
    s.custom = isRulesError(k) ? {} : k;
  }
  return s;
}
var isRulesError = (x) => !!x && typeof x === "object" && "error" in x && !!x.error && typeof x.error.code === "string";
var SNAG = { error: { code: "rules_failed", message: "The game hit a snag. Try that again." } };
function safe(fn) {
  try {
    return fn();
  } catch {
    return SNAG;
  }
}
var teamsInUse = (s) => [...new Set(Object.values(s.seats).map((x) => x.team).filter((t) => t !== void 0))].sort((a, b) => a - b);
function smallestTeam(s, count) {
  const size = new Array(count).fill(0);
  for (const seat of Object.values(s.seats)) if (seat.team !== void 0 && seat.team < count) size[seat.team] += 1;
  let best = 0;
  for (let t = 1; t < count; t += 1) if (size[t] < size[best]) best = t;
  return best;
}
function fillTeams(s) {
  const count = teamCount(s);
  if (!count) return;
  for (const seat of Object.values(s.seats)) if (seat.team === void 0 || seat.team >= count) seat.team = smallestTeam(s, count);
}
function shuffleTeams(s) {
  const count = teamCount(s);
  if (!count) return;
  const seats = Object.values(s.seats);
  for (let i = seats.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  seats.forEach((seat, i) => seat.team = i % count);
}
function rulesCtx(s, now, fx, random) {
  const write = fx !== null;
  const keys = keysOf(s);
  const teamOf3 = (owner) => s.seats[owner]?.team ?? s.kicked?.[owner]?.team;
  const store = (owner, event) => {
    const history = s.history[owner] ??= [];
    if (history.length >= PLAY_EVENTS_MAX) return false;
    const team = teamOf3(owner);
    history.push({ ...event, ...team !== void 0 ? { team: String(team) } : {}, seq: history.length });
    return true;
  };
  const view2 = { rng: s.rng };
  return {
    now,
    config: s.config,
    game: s.config.game,
    keys,
    random: random ?? (() => write ? nextRandom(s) : nextRandom(view2)),
    seats: () => Object.values(s.seats),
    seat: (owner) => s.seats[owner],
    teams: () => teamsInUse(s),
    members: (team) => Object.values(s.seats).filter((x) => x.team === team).map((x) => x.owner),
    mark(owner, event, strength = "live_solo") {
      const history = s.history[owner] ?? [];
      if (write && history.length >= PLAY_EVENTS_MAX) return { error: { code: "too_many", message: "This game has had enough answers." } };
      const who = { play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength };
      const out = markMove(s.config.game, keys, history, event, now, who);
      if (out.error) return { error: { code: "bad_item", message: "That isn\u2019t in this game." } };
      if (write && out.stored) store(owner, out.stored);
      return { result: out.result, stored: out.stored ? { ...out.stored } : null };
    },
    record(owner, event) {
      if (!write) return;
      const { strength, ...rest } = event;
      store(owner, { ...rest, at: now, game: keys.kind, play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength: strength ?? "live_solo" });
    },
    addScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score += points;
    },
    setScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score = points;
    },
    addTeamScore(team, points) {
      if (!write || !Number.isFinite(points)) return;
      const scores = s.team_scores ??= {};
      scores[team] = (scores[team] ?? 0) + points;
    },
    teamScore: (team) => s.team_scores?.[team] ?? 0,
    setProgress(owner, progress) {
      const seat = s.seats[owner];
      if (!write || !seat) return;
      if (progress) seat.progress = progress;
      else delete seat.progress;
    },
    ticker(text, initials) {
      if (!write) return;
      s.ticker.unshift({ initials: initials ?? "", text: String(text).slice(0, 120), at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    },
    send(owner, msg) {
      if (write) fx.push({ kind: "send", owner, msg });
    },
    setTimer(endsAt) {
      if (write) s.ends_at = endsAt !== void 0 && Number.isFinite(endsAt) ? endsAt : void 0;
    },
    end() {
      if (write) endGame(s, now, fx, { finish: false });
    }
  };
}
function runRules(s, now, fx, hook) {
  const rules = rulesOf(s);
  if (!rules) return SNAG;
  return safe(() => hook(rules, rulesCtx(s, now, fx), s.custom));
}
function wallsOf(keys) {
  return Object.entries(keys.items).filter((e) => e[1].shape === "wall");
}
function groupDifficulty(keys, groupId) {
  for (const [, w] of wallsOf(keys)) {
    const g = w.groups.find((x) => x.id === groupId);
    if (g) return g.difficulty;
  }
  return 1;
}
var mistakesAllowed = (s) => Number(s.config.game.settings?.mistakes) || 4;
function raceProgress(s, owner) {
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  const total = gameTotal(keys);
  if (keys.kind === "connections") {
    const walls = wallsOf(keys);
    const limit = mistakesAllowed(s);
    const found = [];
    const wrong = /* @__PURE__ */ new Map();
    let lastWall = walls[0]?.[0] ?? "";
    for (const e of events) {
      if (e.move !== "guess") continue;
      lastWall = e.item;
      if (e.correct === true && typeof e.extra?.group === "string" && !found.includes(e.extra.group)) found.push(e.extra.group);
      if (e.correct === false) wrong.set(e.item, (wrong.get(e.item) ?? 0) + 1);
    }
    const over = walls.every(([id, w]) => (wrong.get(id) ?? 0) >= limit || w.groups.every((g) => found.includes(g.id)));
    return {
      progress: { done: found.length, total, mistakes: wrong.get(lastWall) ?? 0, mistakes_max: limit, groups: found.map((g) => groupDifficulty(keys, g)) },
      score: found.length,
      done: walls.length > 0 && over
    };
  }
  const solved = new Set(events.filter((e) => e.correct === true).map((e) => e.item));
  return { progress: { done: solved.size, total }, score: solved.size, done: total > 0 && solved.size >= total };
}
function firstText(s, item, group) {
  const game = s.config.game;
  if (game.kind === "connections") {
    if (!group) return null;
    return { key: `g:${group}`, text: `found the ${GROUP_COLOURS[groupDifficulty(keysOf(s), group)] ?? "gold"} group` };
  }
  if (game.grid?.kind === "crossword") {
    const entry = game.grid.entries.find((x) => x.item === item);
    return entry ? { key: `i:${item}`, text: `solved ${entry.number} ${entry.dir}` } : null;
  }
  if (game.kind === "find_a_word") {
    if (keysOf(s).items[item]?.shape === "question") return { key: `i:${item}`, text: "answered the hidden message" };
    const at = (game.items ?? []).findIndex((x) => x.id === item);
    return at >= 0 ? { key: `i:${item}`, text: `found word ${at + 1}` } : null;
  }
  return null;
}
function studentSeats2(s) {
  return Object.values(s.seats).sort((a, b) => b.score - a.score || a.initials.localeCompare(b.initials) || a.owner.localeCompare(b.owner));
}
function ranks(s) {
  const out = /* @__PURE__ */ new Map();
  let rank = 0;
  let prev = null;
  studentSeats2(s).forEach((seat, i) => {
    if (seat.score !== prev) rank = i + 1;
    prev = seat.score;
    out.set(seat.owner, rank);
  });
  return out;
}
function classWall(s) {
  const keys = keysOf(s);
  if (keys.kind !== "connections") return [];
  const counts = /* @__PURE__ */ new Map();
  for (const events of Object.values(s.history)) {
    for (const e of events) {
      if (e.move !== "guess" || e.correct !== false) continue;
      const wall = keys.items[e.item];
      if (wall?.shape !== "wall") continue;
      const tiles2 = e.response?.tiles ?? [];
      const groupOf = (t) => wall.groups.find((g) => g.tiles.includes(t))?.id;
      for (let i = 0; i < tiles2.length; i += 1) {
        for (let j = i + 1; j < tiles2.length; j += 1) {
          const ti = tiles2[i];
          const tj = tiles2[j];
          if (groupOf(ti) === groupOf(tj)) continue;
          const [a, b] = [wall.tiles[ti] ?? "", wall.tiles[tj] ?? ""].sort();
          const k = `${a}\0${b}`;
          const row = counts.get(k) ?? { a, b, count: 0 };
          row.count += 1;
          counts.set(k, row);
        }
      }
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.a.localeCompare(y.a)).slice(0, CLASS_WALL_MAX);
}
function seatRestore(s, owner) {
  if (s.config.style !== "race") return void 0;
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  if (!events.length) return void 0;
  if (keys.kind === "connections") {
    const limit = mistakesAllowed(s);
    const walls = [];
    for (const [id, w] of wallsOf(keys)) {
      const mine = events.filter((e) => e.item === id && e.move === "guess");
      if (!mine.length) continue;
      const found = /* @__PURE__ */ new Set();
      const guesses = mine.map((e) => {
        if (e.correct === true && typeof e.extra?.group === "string") found.add(e.extra.group);
        const tiles2 = e.response?.tiles ?? [];
        return { tiles: tiles2.filter((t) => typeof t === "string"), correct: e.correct === true };
      });
      const mistakes = guesses.filter((g) => !g.correct).length;
      const out2 = mistakes >= limit && found.size < w.groups.length;
      const group = (g, isFound) => ({ id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: [...g.tiles], found: isFound });
      const groups = [...found].map((gid) => w.groups.find((g) => g.id === gid)).filter((g) => !!g).map((g) => group(g, true));
      if (out2) groups.push(...w.groups.filter((g) => !found.has(g.id)).sort((a, b) => a.difficulty - b.difficulty).map((g) => group(g, false)));
      walls.push({ wall: id, groups, guesses, mistakes, out: out2 });
    }
    return walls.length ? { walls } : void 0;
  }
  const grid = keys.grid ?? null;
  const solved = [];
  const done = /* @__PURE__ */ new Set();
  const hintCount = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.move === "hint") hintCount.set(e.item, (hintCount.get(e.item) ?? 0) + 1);
    if (e.correct !== true || done.has(e.item) || keys.items[e.item]?.shape !== "term") continue;
    done.add(e.item);
    const r = e.response ?? {};
    const hints2 = Math.min(3, Number(e.extra?.hints) || hintCount.get(e.item) || 0);
    const point2 = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n)) ? [p[0], p[1]] : void 0;
    const from = point2(r.from);
    const to = point2(r.to);
    solved.push({ item: e.item, hints: hints2, ...typeof r.text === "string" ? { text: r.text.slice(0, 40) } : {}, ...from && to ? { from, to } : {} });
  }
  const hints = {};
  for (const [item, n] of hintCount) {
    if (done.has(item)) continue;
    const step2 = Math.min(3, n);
    hints[item] = { step: step2, ...grid?.kind === "wordsearch" && grid.hints !== false ? wordHint(grid, item, step2) : {} };
  }
  const out = {};
  if (solved.length) out.solved = solved;
  if (Object.keys(hints).length) out.hints = hints;
  const terms = Object.entries(keys.items).filter(([, x]) => x.shape === "term").map(([id]) => id);
  if (grid?.kind === "wordsearch" && grid.message && terms.length && terms.every((id) => done.has(id))) out.message = grid.message;
  return Object.keys(out).length ? out : void 0;
}
function pacedItemView(s) {
  if (!s.item) return void 0;
  const { choices: _choices, ...item } = s.item;
  return { ...item, answered: [...item.answered] };
}
var sharedCache = /* @__PURE__ */ new WeakMap();
function sharedOf(s) {
  const held = sharedCache.get(s);
  if (held && held.seq === s.seq) return held;
  const all = studentSeats2(s);
  const rank = ranks(s);
  const shared = { seq: s.seq, all, rank, leaderboard: all.slice(0, ROOM_LIMITS.leaderboardTop).map((x) => ({ initials: x.initials, score: x.score, rank: rank.get(x.owner) ?? 0 })) };
  const count = teamCount(s);
  if (count) {
    const rows = Array.from({ length: count }, (_, team) => ({ team, name: teamName2(team), score: s.team_scores?.[team] ?? 0, members: all.filter((x) => x.team === team).sort((a, b) => a.initials.localeCompare(b.initials)).map((x) => x.initials), rank: 0 }));
    const sorted = rows.slice().sort((a, b) => b.score - a.score || a.team - b.team);
    sorted.forEach((r, i) => r.rank = i > 0 && sorted[i - 1].score === r.score ? sorted[i - 1].rank : i + 1);
    shared.teams = rows;
    shared.leaderboard = sorted.map((r) => ({ initials: r.name, score: r.score, rank: r.rank, team: r.team }));
  }
  sharedCache.set(s, shared);
  return shared;
}
function publicView(state, role, owner, now = state.at ?? 0, opts = {}) {
  const s = state;
  const shared = sharedOf(s);
  const { all, rank } = shared;
  const view2 = {
    room: s.config.room,
    code: s.config.code,
    kind: s.config.game.kind,
    style: s.config.style,
    title: s.config.game.title,
    phase: s.phase,
    now,
    ...s.ends_at !== void 0 && s.phase !== "paused" ? { ends_at: s.ends_at } : {},
    seats: isStudent(role) ? [] : all.map((x) => ({ ...x, ...x.progress ? { progress: { ...x.progress, ...x.progress.groups ? { groups: [...x.progress.groups] } : {} } } : {} })),
    ticker: s.config.style !== "paced" ? s.ticker.slice(0, TICKER_MAX) : [],
    leaderboard: shared.leaderboard.map((x) => ({ ...x })),
    board_view: s.board_view,
    seq: s.seq
  };
  const item = pacedItemView(s);
  if (item) view2.item = item;
  if (s.phase === "paused" && s.paused_left_ms !== void 0) view2.paused_left_ms = s.paused_left_ms;
  if (shared.teams) {
    const mine = isStudent(role) ? s.seats[owner]?.team : void 0;
    view2.teams = shared.teams.map((t) => ({ ...t, members: !isStudent(role) || t.team === mine ? [...t.members] : [] }));
  }
  const rules = rulesOf(s);
  if (rules) {
    const part = safe(() => rules.view(rulesCtx(s, now, null), s.custom, role, owner));
    if (!isRulesError(part) && part !== void 0) view2.kind_view = part;
  }
  if (isStudent(role)) {
    const seat = s.seats[owner];
    const last = s.last?.[owner];
    const restore = opts.restore && seat ? seatRestore(s, owner) : void 0;
    view2.you = { owner, ...seat ? { seat: { ...seat } } : {}, ...last ? { last } : {}, ...seat ? { rank: rank.get(owner) ?? 0 } : {}, ...restore ? { restore } : {} };
  } else {
    view2.you = { owner };
    if (s.config.game.kind === "connections" && (role === "teacher" || s.board_view === "class_wall" || s.phase === "ended" || s.phase === "folded")) view2.class_wall = shared.wall ??= classWall(s);
  }
  return view2;
}
function viewDelta(prev, next) {
  const patch = {};
  for (const k of Object.keys(prev)) if (!(k in next)) return null;
  for (const [k, v] of Object.entries(next)) {
    if (k === "now" || k === "seq") continue;
    if (JSON.stringify(prev[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  return patch;
}
function nextAlarm(s) {
  if (s.phase === "ended" || s.phase === "folded") return null;
  const life = s.config.opened_at + ROOM_LIMITS.lifeMs;
  if ((s.phase === "countdown" || s.phase === "playing") && s.ends_at !== void 0) return Math.min(s.ends_at, life);
  return life;
}
function foldPayload(s) {
  const seats = [...Object.values(s.seats), ...Object.values(s.kicked ?? {})];
  const events = [];
  for (const [owner, list] of Object.entries(s.history)) {
    for (const e of list) {
      const { reply: _reply, ...rest } = e;
      events.push({ ...rest, owner });
    }
  }
  return {
    room: s.config.room,
    lesson_id: s.config.lesson_id,
    class_id: s.config.class_id,
    game_id: s.config.game.id,
    kind: s.config.game.kind,
    started_at: s.started_at ?? s.config.opened_at,
    ended_at: s.ended_at ?? s.at ?? s.config.opened_at,
    strength: "live_solo",
    seats: seats.map((x) => ({ owner: x.owner, ...s.students?.[x.owner] ? { student_id: s.students[x.owner] } : {}, initials: x.initials, ...x.team !== void 0 ? { team: x.team } : {}, score: x.score })),
    ...s.team_scores ? { team_scores: { ...s.team_scores } } : {},
    events
  };
}
var ack = (fx, owner, conn, rid, body) => fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "ack", ...rid ? { rid } : {}, ...body } });
var fail = (fx, owner, conn, rid, code, message) => ack(fx, owner, conn, rid, { error: { code, message } });
function remember(s, owner, rid, result) {
  if (!rid) return;
  const mine = s.seen[owner] ??= {};
  mine[rid] = result;
  const ids = Object.keys(mine);
  if (ids.length > SEEN_MAX) for (const id of ids.slice(0, ids.length - SEEN_MAX)) delete mine[id];
}
function newSeat(s, owner, initials) {
  const seat = { owner, initials, connected: true, score: 0 };
  if (s.config.style === "race") seat.progress = raceProgress(s, owner).progress;
  else if (s.config.style === "paced") seat.progress = { done: 0, total: pacedItems(s).length };
  const count = teamCount(s);
  if (count) seat.team = smallestTeam(s, count);
  return seat;
}
function openItem(s, index, now) {
  const ids = pacedItems(s);
  const id = ids[index];
  if (id === void 0) return;
  const ends = now + itemSeconds(s) * 1e3;
  s.item_index = index;
  s.item = { item: id, index, of: ids.length, opened_at: now, ends_at: ends, answered: [], choices: {} };
  s.ends_at = ends;
}
function revealItem(s) {
  const item = s.item;
  if (!item || item.revealed) return;
  const key = keysOf(s).items[item.item];
  const counts = {};
  for (const c of Object.values(item.choices)) counts[c.choice] = (counts[c.choice] ?? 0) + 1;
  const reveal3 = key ? revealFor(keysOf(s).kind, key, {}) : void 0;
  item.revealed = { counts, reveal: reveal3 };
  const fake = key?.shape === "quote" && key.speaker === FAKE_SPEAKER;
  const seconds2 = itemSeconds(s);
  for (const [owner, seat] of Object.entries(s.seats)) {
    const choice = item.choices[owner];
    const event = choice ? [...s.history[owner] ?? []].reverse().find((e) => e.item === item.item && e.move === "answer") : void 0;
    const correct = event?.correct === true;
    if (choice) {
      seat.score += quotePoints(correct, fake, Math.max(0, choice.at - item.opened_at), seconds2);
      if (correct && seat.progress) seat.progress = { ...seat.progress, done: seat.progress.done + 1 };
    }
    (s.last ??= {})[owner] = { item: item.item, ...choice ? { correct } : {}, ...reveal3 ? { reveal: reveal3 } : {} };
  }
  s.ends_at = void 0;
}
function endGame(s, now, fx, opts = {}) {
  if (s.phase === "ended" || s.phase === "folded") return;
  if (s.config.style === "paced") revealItem(s);
  if (s.config.style === "custom" && opts.finish !== false && rulesOf(s)?.finish) {
    runRules(s, now, fx, (r, ctx, k) => r.finish?.(ctx, k));
    if (s.phase === "ended") return;
  }
  s.phase = "ended";
  s.ended_at = now;
  s.ends_at = void 0;
  s.paused_left_ms = void 0;
  fx.push({ kind: "fold", payload: foldPayload(s) });
}
function onConnect(s, a, now, fx) {
  const { owner, role, conn } = a;
  const close2 = (msg) => fx.push({ kind: "close", owner, ...conn ? { conn } : {}, msg });
  let changed = false;
  if (isStudent(role)) {
    if (s.kicked?.[owner]) return close2({ t: "kicked" }), false;
    const initials = a.student_id ? s.config.roster[a.student_id] : void 0;
    if (!a.student_id || !initials) return close2({ t: "error", code: "not_on_list", message: "You\u2019re not on this class list. Ask your teacher." }), false;
    const seat = s.seats[owner];
    if (seat) {
      if (!seat.connected) changed = true;
      seat.connected = true;
    } else if (s.phase !== "ended" && s.phase !== "folded") {
      if (Object.keys(s.seats).length >= ROOM_LIMITS.seats) return close2({ t: "error", code: "room_full", message: "This game is full." }), false;
      s.seats[owner] = newSeat(s, owner, initials);
      s.history[owner] ??= [];
      (s.students ??= {})[owner] = a.student_id;
      changed = true;
    }
    if (changed) seatChanged(s, owner, now, fx);
  }
  const conns = s.conns ??= {};
  const old = conns[owner];
  if (old && conn && old !== conn) fx.push({ kind: "close", owner, conn: old, msg: { t: "replaced" } });
  if (conn) conns[owner] = conn;
  fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "snapshot", view: publicView(s, role, owner, now, { restore: true }) } });
  return changed;
}
function seatChanged(s, owner, now, fx) {
  if (s.config.style === "custom" && (s.phase === "playing" || s.phase === "paused") && rulesOf(s)?.seatChanged) runRules(s, now, fx, (r, ctx, k) => r.seatChanged?.(ctx, k, owner));
}
function onDisconnect(s, a, now, fx) {
  const conns = s.conns ??= {};
  if (a.conn && conns[a.owner] && conns[a.owner] !== a.conn) return false;
  delete conns[a.owner];
  const seat = s.seats[a.owner];
  if (!seat || !seat.connected) return false;
  seat.connected = false;
  seatChanged(s, a.owner, now, fx);
  return true;
}
function rateLimited(s, owner, now, burst = ROOM_LIMITS.burst) {
  const rate = s.rate ??= {};
  const r = rate[owner];
  if (!r || now - r.at >= RATE_WINDOW_MS) {
    rate[owner] = { at: now, n: 1 };
    return false;
  }
  r.n += 1;
  return r.n > burst;
}
function validMove(ev) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return false;
  const e = ev;
  if (typeof e.item !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(e.item)) return false;
  if (typeof e.move !== "string" || !GAME_MOVES.includes(e.move)) return false;
  if (e.cid !== void 0 && (typeof e.cid !== "string" || !/^[A-Za-z0-9_-]{6,40}$/.test(e.cid))) return false;
  if (e.time_ms !== void 0 && (typeof e.time_ms !== "number" || !Number.isInteger(e.time_ms) || e.time_ms < 0 || e.time_ms > 36e5)) return false;
  if (e.extra !== void 0 && (typeof e.extra !== "object" || e.extra === null || Array.isArray(e.extra) || Object.keys(e.extra).length > 20)) return false;
  try {
    if (JSON.stringify(e.response ?? null).length > 2e3) return false;
  } catch {
    return false;
  }
  return true;
}
var PHASE_ERRORS = {
  lobby: ["not_started", "The game hasn\u2019t started yet."],
  countdown: ["not_started", "Nearly: the game is about to start."],
  paused: ["paused", "The game is paused."],
  ended: ["ended", "This game has finished."],
  folded: ["ended", "This game has finished."]
};
function onMove(s, owner, conn, msg, now, fx) {
  const seat = s.seats[owner];
  if (!seat) return fail(fx, owner, conn, msg.rid, "no_seat", "Join the game first."), false;
  const phaseError = PHASE_ERRORS[s.phase];
  if (phaseError) return fail(fx, owner, conn, msg.rid, phaseError[0], phaseError[1]), false;
  if (!validMove(msg.event)) return fail(fx, owner, conn, msg.rid, "bad_event", "That move couldn\u2019t be read."), false;
  const history = s.history[owner] ??= [];
  if (history.length >= PLAY_EVENTS_MAX) return fail(fx, owner, conn, msg.rid, "too_many", "This game has had enough answers."), false;
  const keys = keysOf(s);
  const who = { play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength: "live_solo" };
  if (s.config.style === "custom") {
    const out = runRules(s, now, fx, (r, ctx, k) => r.move(ctx, k, owner, msg.event));
    if (isRulesError(out)) return fail(fx, owner, conn, msg.rid, out.error.code, out.error.message), false;
    const result2 = out && typeof out === "object" ? out : { item: msg.event.item };
    remember(s, owner, msg.rid, result2);
    (s.last ??= {})[owner] = result2;
    ack(fx, owner, conn, msg.rid, { result: result2 });
    return true;
  }
  if (s.config.style === "paced") {
    const item = s.item;
    if (!item || item.revealed || msg.event.item !== item.item) return fail(fx, owner, conn, msg.rid, "not_open", "That quote has closed."), false;
    if (msg.event.move !== "answer") return fail(fx, owner, conn, msg.rid, "bad_event", "Pick an answer."), false;
    if (item.choices[owner]) return fail(fx, owner, conn, msg.rid, "answered", "You\u2019ve already answered this one."), false;
    const event = { ...msg.event, time_ms: Math.min(36e5, Math.max(0, now - item.opened_at)) };
    const { stored: stored2, error: error2 } = markMove(s.config.game, keys, history, event, now, who);
    if (error2 || !stored2) return fail(fx, owner, conn, msg.rid, "bad_item", "That isn\u2019t in this game."), false;
    history.push({ ...stored2, seq: history.length });
    const r = stored2.response;
    const choice = typeof r?.speaker === "string" ? r.speaker : "text";
    item.choices[owner] = { choice, at: now };
    item.answered.push(owner);
    const result2 = { item: item.item };
    remember(s, owner, msg.rid, result2);
    ack(fx, owner, conn, msg.rid, { result: result2 });
    const live2 = Object.values(s.seats).filter((x) => x.connected);
    if (live2.length > 0 && live2.every((x) => item.choices[x.owner])) revealItem(s);
    return true;
  }
  const { result, stored, error } = markMove(s.config.game, keys, history, msg.event, now, who);
  if (error) return fail(fx, owner, conn, msg.rid, "bad_item", "That isn\u2019t in this game."), false;
  remember(s, owner, msg.rid, result);
  (s.last ??= {})[owner] = result;
  ack(fx, owner, conn, msg.rid, { result });
  if (!stored) return false;
  history.push({ ...stored, seq: history.length });
  const p = raceProgress(s, owner);
  seat.progress = p.progress;
  seat.score = p.score;
  if (p.done) seat.finished = true;
  if (stored.correct === true) {
    const first = firstText(s, stored.item, typeof stored.extra?.group === "string" ? stored.extra.group : void 0);
    if (first && !s.first?.[first.key]) {
      (s.first ??= {})[first.key] = true;
      s.ticker.unshift({ initials: seat.initials, text: first.text, at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    }
  }
  return true;
}
var CONTROL_NAME = /^[A-Za-z0-9_-]{1,40}$/;
function kindControl(s, owner, role, op, now, fx) {
  const rules = rulesOf(s);
  if (!rules?.control) return { error: { code: "bad_control", message: "This game has no such control." } };
  const name = op.op === "kind" ? op.name : op.op;
  if (typeof name !== "string" || !CONTROL_NAME.test(name)) return { error: { code: "bad_control", message: "Unknown control." } };
  const data = op.op === "kind" ? op.data : void 0;
  try {
    if (data !== void 0 && JSON.stringify(data).length > 4e3) return { error: { code: "bad_control", message: "That was too much to send at once." } };
  } catch {
    return { error: { code: "bad_control", message: "That couldn\u2019t be read." } };
  }
  if (s.phase === "ended" || s.phase === "folded") return { error: { code: "ended", message: "This game has finished." } };
  if (s.phase === "paused") return { error: { code: "paused", message: "The game is paused." } };
  if (s.phase === "countdown") return { error: { code: "not_started", message: "Nearly: the game is about to start." } };
  if (s.phase === "lobby" && (isStudent(role) || op.op !== "kind")) return { error: { code: "not_started", message: "The game hasn\u2019t started yet." } };
  const control = { name, ...data !== void 0 ? { data } : {} };
  const out = runRules(s, now, fx, (r, ctx, k) => r.control?.(ctx, k, control, { owner, role }));
  return isRulesError(out) ? out : null;
}
function onControl(s, owner, role, conn, rid, op, now, fx) {
  const ok = () => {
    remember(s, owner, rid, null);
    ack(fx, owner, conn, rid, {});
    return true;
  };
  const no = (code, message) => (fail(fx, owner, conn, rid, code, message), false);
  const paced = s.config.style === "paced";
  if (s.config.style === "custom" && (op.op === "kind" || op.op === "next" || op.op === "reveal")) {
    const err8 = kindControl(s, owner, role, op, now, fx);
    return err8 ? no(err8.error.code, err8.error.message) : ok();
  }
  switch (op.op) {
    case "start":
      if (s.phase !== "lobby") return no("started", "The game has already started.");
      s.phase = "countdown";
      s.ends_at = now + ROOM_LIMITS.countdownMs;
      return ok();
    case "pause":
      if (s.phase !== "playing") return no("not_playing", "Only a running game can pause.");
      s.phase = "paused";
      s.paused_left_ms = s.ends_at !== void 0 ? Math.max(0, s.ends_at - now) : void 0;
      return ok();
    case "resume": {
      if (s.phase !== "paused") return no("not_paused", "The game isn\u2019t paused.");
      s.phase = "playing";
      if (s.paused_left_ms !== void 0) {
        const ends = now + s.paused_left_ms;
        if (s.item && !s.item.revealed) {
          const shift = ends - s.item.ends_at;
          s.item.opened_at += shift;
          s.item.ends_at = ends;
          for (const c of Object.values(s.item.choices)) c.at += shift;
        }
        s.ends_at = ends;
      }
      s.paused_left_ms = void 0;
      return ok();
    }
    case "add_time": {
      const ms = Math.max(1, Math.min(300, Math.round(Number(op.seconds) || 0))) * 1e3;
      if (s.phase === "paused" && s.paused_left_ms !== void 0) s.paused_left_ms += ms;
      else if ((s.phase === "playing" || s.phase === "countdown") && s.ends_at !== void 0) s.ends_at += ms;
      else return no("no_timer", "There\u2019s no timer running.");
      if (s.item && !s.item.revealed && s.phase !== "paused") s.item.ends_at = s.ends_at;
      if (s.item && !s.item.revealed && s.phase === "paused") s.item.ends_at += ms;
      return ok();
    }
    case "reveal":
      if (!paced) return no("not_paced", "Each player sees their own answers in this game.");
      if (s.phase !== "playing" || !s.item || s.item.revealed) return no("not_open", "Nothing to reveal.");
      revealItem(s);
      return ok();
    case "next": {
      if (!paced) return no("not_paced", "Everyone plays at their own pace in this game.");
      if (s.phase !== "playing") return no("not_playing", "Start or resume the game first.");
      revealItem(s);
      const at = s.item_index + 1;
      if (at >= pacedItems(s).length) endGame(s, now, fx);
      else openItem(s, at, now);
      return ok();
    }
    case "kick": {
      const seat = s.seats[op.owner];
      if (!seat) return no("no_seat", "That player isn\u2019t here.");
      delete s.seats[op.owner];
      (s.kicked ??= {})[op.owner] = { ...seat, connected: false };
      if (s.conns) delete s.conns[op.owner];
      if (s.item) s.item.answered = s.item.answered.filter((x) => x !== op.owner);
      fx.push({ kind: "close", owner: op.owner, msg: { t: "kicked" } });
      seatChanged(s, op.owner, now, fx);
      return ok();
    }
    case "move_team": {
      const count = teamCount(s);
      if (!count) return no("no_teams", "This game isn\u2019t played in teams.");
      if (s.phase !== "lobby") return no("started", "Teams are set once the game starts.");
      const seat = s.seats[op.owner];
      if (!seat) return no("no_seat", "That player isn\u2019t here.");
      const team = Number(op.team);
      if (!Number.isInteger(team) || team < 0 || team >= count) return no("bad_team", "There\u2019s no such team.");
      seat.team = team;
      return ok();
    }
    case "shuffle_teams":
      if (!teamCount(s)) return no("no_teams", "This game isn\u2019t played in teams.");
      if (s.phase !== "lobby") return no("started", "Teams are set once the game starts.");
      shuffleTeams(s);
      return ok();
    case "board_view":
      if (op.view !== "race" && op.view !== "class_wall") return no("bad_view", "Unknown view.");
      s.board_view = op.view;
      return ok();
    case "end":
      if (s.phase === "ended" || s.phase === "folded") return no("ended", "This game has finished.");
      endGame(s, now, fx);
      return ok();
    default:
      return no("bad_control", "Unknown control.");
  }
}
function onMsg(s, a, now, fx) {
  const { owner, role, msg, conn } = a;
  if (!msg || typeof msg !== "object" || typeof msg.t !== "string") {
    fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "error", code: "bad_message", message: "That message couldn\u2019t be read." } });
    return false;
  }
  const rid = typeof msg.rid === "string" ? msg.rid.slice(0, 64) : void 0;
  if (msg.t === "ping") {
    fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "pong", ...rid ? { rid } : {}, sent: Number(msg.sent) || 0, now } });
    return false;
  }
  if (rateLimited(s, owner, now, rulesOf(s)?.burst ?? ROOM_LIMITS.burst)) return fail(fx, owner, conn, rid, "slow_down", "Too many moves at once. Wait a moment."), false;
  if (rid && s.seen[owner] && rid in s.seen[owner]) {
    const result = s.seen[owner][rid];
    ack(fx, owner, conn, rid, result ? { result } : {});
    return false;
  }
  switch (msg.t) {
    case "hello":
      fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "snapshot", view: publicView(s, role, owner, now, { restore: true }) } });
      return false;
    case "move":
      if (!isStudent(role)) return fail(fx, owner, conn, rid, "not_a_player", "Only players make moves."), false;
      return onMove(s, owner, conn, { ...msg, ...rid ? { rid } : {} }, now, fx);
    case "finish": {
      const seat = s.seats[owner];
      if (!isStudent(role) || !seat) return fail(fx, owner, conn, rid, "no_seat", "Join the game first."), false;
      remember(s, owner, rid, null);
      ack(fx, owner, conn, rid, {});
      if (seat.finished) return false;
      seat.finished = true;
      return true;
    }
    case "control": {
      const op = msg.op ?? {};
      if (isStudent(role)) {
        if (s.config.style !== "custom" || op.op !== "kind") return fail(fx, owner, conn, rid, "not_allowed", "Only your teacher can do that."), false;
        if (!s.seats[owner]) return fail(fx, owner, conn, rid, "no_seat", "Join the game first."), false;
      }
      return onControl(s, owner, role, conn, rid, op, now, fx);
    }
    default:
      return fail(fx, owner, conn, rid, "bad_message", "That message couldn\u2019t be read."), false;
  }
}
function onTick(s, now, fx) {
  if (s.phase === "ended" || s.phase === "folded") return false;
  if (now >= s.config.opened_at + ROOM_LIMITS.lifeMs) {
    endGame(s, now, fx);
    return true;
  }
  if (s.phase === "countdown" && s.ends_at !== void 0 && now >= s.ends_at) {
    s.phase = "playing";
    s.started_at = now;
    s.ends_at = void 0;
    if (s.config.style === "paced") openItem(s, 0, now);
    if (s.config.style === "custom") {
      fillTeams(s);
      runRules(s, now, fx, (r, ctx, k) => r.start(ctx, k));
    }
    return true;
  }
  if (s.config.style === "custom" && s.phase === "playing" && s.ends_at !== void 0 && now >= s.ends_at) {
    s.ends_at = void 0;
    runRules(s, now, fx, (r, ctx, k) => r.tick?.(ctx, k));
    return true;
  }
  if (s.phase === "playing" && s.item && !s.item.revealed && now >= s.item.ends_at) {
    revealItem(s);
    return true;
  }
  return false;
}
var reduce = (state, action, now) => {
  const s = state;
  const fx = [];
  const alarmBefore = nextAlarm(s);
  sharedCache.delete(s);
  s.at = now;
  let changed = false;
  switch (action.type) {
    case "connect":
      changed = onConnect(s, action, now, fx);
      break;
    case "disconnect":
      changed = onDisconnect(s, action, now, fx);
      break;
    case "msg":
      changed = onMsg(s, action, now, fx);
      break;
    case "tick":
      changed = onTick(s, now, fx);
      break;
    case "folded":
      if (s.phase !== "folded") {
        s.phase = "folded";
        s.folded = true;
        changed = true;
      }
      break;
  }
  if (changed) {
    s.seq += 1;
    fx.push({ kind: "broadcast" });
  }
  const alarmAfter = nextAlarm(s);
  if (alarmAfter !== null && alarmAfter !== alarmBefore) fx.push({ kind: "alarm", at: alarmAfter });
  return { state: s, effects: fx };
};

// apps/teaching/src/games/core/room-ticket.ts
var TICKET_LIFE_MS = { student: 3 * 60 * 60 * 1e3, teacher: 6 * 60 * 60 * 1e3, board: 6 * 60 * 60 * 1e3 };
var SIGNATURE_HEADER = "x-game-room-signature";
var SIGNATURE_SKEW_MS = 5 * 60 * 1e3;
var enc = new TextEncoder();
var dec = new TextDecoder();
function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
var keyCache = /* @__PURE__ */ new Map();
function hmacKey(secret) {
  if (!secret || secret.length < 16) throw new Error("GAME_ROOM_SECRET is missing or too short.");
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, key);
  }
  return key;
}
async function sign(secret, text) {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text))));
}
async function verify(secret, text, sig) {
  const bytes = unb64url(sig);
  if (!bytes || bytes.length !== 32) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, enc.encode(text));
}
var ROLES = /* @__PURE__ */ new Set(["teacher", "student", "board"]);
async function signTicket(secret, payload, now) {
  const full = { ...payload, exp: payload.exp ?? now + TICKET_LIFE_MS[payload.role] };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await sign(secret, body)}`;
}
async function verifyTicket(secret, token, now, expect = {}) {
  if (typeof token !== "string" || token.length > 2e3) return { ok: false, code: "bad_ticket" };
  const [body, sig, more] = token.split(".");
  if (!body || !sig || more !== void 0) return { ok: false, code: "bad_ticket" };
  if (!await verify(secret, body, sig)) return { ok: false, code: "bad_ticket" };
  const bytes = unb64url(body);
  let payload;
  try {
    payload = JSON.parse(dec.decode(bytes ?? new Uint8Array()));
  } catch {
    return { ok: false, code: "bad_ticket" };
  }
  if (!payload || typeof payload.room !== "string" || typeof payload.owner !== "string" || !ROLES.has(payload.role) || typeof payload.exp !== "number") return { ok: false, code: "bad_ticket" };
  if (payload.exp <= now) return { ok: false, code: "expired" };
  if (expect.room !== void 0 && payload.room !== expect.room) return { ok: false, code: "wrong_room" };
  if (expect.roles && !expect.roles.includes(payload.role)) return { ok: false, code: "wrong_role" };
  return { ok: true, ticket: payload };
}
async function signBody(secret, body, now) {
  return `t=${now},s=${await sign(secret, `${now}.${body}`)}`;
}
async function verifyBody(secret, body, header, now) {
  const m = /^t=(\d{1,16}),s=([A-Za-z0-9_-]{20,100})$/.exec(String(header ?? ""));
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > SIGNATURE_SKEW_MS) return false;
  return verify(secret, `${t}.${body}`, m[2]);
}
function ticketFromAuthorization(header) {
  const m = /^Ticket\s+(\S+)$/.exec(String(header ?? "").trim());
  return m ? m[1] : null;
}
export {
  GROUP_COLOURS,
  ROOM_LIMITS,
  SIGNATURE_HEADER,
  SIGNATURE_SKEW_MS,
  TEAM_NAMES2 as TEAM_NAMES,
  TICKET_LIFE_MS,
  classWall,
  foldPayload,
  initialState,
  markMove,
  nextAlarm,
  publicView,
  quotePoints,
  reduce,
  registerRules,
  roomStyle,
  roomTeams,
  rulesFor,
  seatRestore,
  signBody,
  signTicket,
  teamCount,
  teamName2 as teamName,
  ticketFromAuthorization,
  verifyBody,
  verifyTicket,
  viewDelta
};
