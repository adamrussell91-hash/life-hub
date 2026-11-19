/**
 * Fleet week, student actions and the player's view (spec §1, §3.3; plan Task 5).
 * Reached from gameStudentAction (games.mjs) for `fleet_*` and `signals`, after
 * identify() has named the student.
 *
 *   fleet_state   { game_id } → the player's view; marks them seen this round
 *   fleet_place   { game_id, ships } round 0: the player's own ships (create-only)
 *   fleet_commit  { game_id, square, sure } → { question, deadline }: fixed at commit, the same on reload
 *   fleet_answer  { game_id, answer, writing } → { ok: true }: never right or wrong before the round closes
 *   fleet_report  { game_id, hit, text, writing } a damage report for a teammate's hit
 *   fleet_recall  { game_id, ship_key, answer, writing } the recall line for a ship this player sank
 *   signals       { game_id? } → { events }: what is waiting for this player in every open
 *                 Fleet week campaign in the lesson (or just that game), each shown once
 *   signals_seen  { ids } → { ok: true }: those events have been shown
 *
 * The same signals for a whole class, with no lesson id, come through the
 * student profile endpoint (fleet_signals, fleet_signals_seen; profile.mjs).
 *
 * What a student never receives before the reveal: an accepted answer, the
 * rival fleet, the match secret, a real owner hash, a student id or a name.
 * Players appear as call signs, which differ on every screen (§1.8), and
 * teammates and hits by opaque aliases.
 */
import { loadRoster } from './class-claims.mjs';
import { deviceHash, read, reject } from './question-drop.mjs';
import { isSafeId } from './class-examples.mjs';
import { FLEET_ACTIONS, campaignIndexKey, gameKeys } from './game-store.mjs';
import { cleanWritingLog } from './quiz-core.mjs';
import { checkAnswer, fleet } from './game-rules.mjs';
import {
  LATE_GRACE_MS, SHOTS_PER_ROUND, aliasFor, ensureCampaign, ensureResolved, firesIn, findCampaign, hashFor, visibleState, list, loadFleetGame, markClock, obj, reportInputs,
  roundClosing, roundOpen, roundsOf, touchClock, updateJSON
} from './fleet-week-store.mjs';

export { FLEET_ACTIONS };
export { LATE_GRACE_MS };
const TEXT_MAX = 300;

const shotOpen = (s, now) => s.correct === undefined && now <= s.deadline + LATE_GRACE_MS;
const teamAlias = (campaign, teamId, hitId) => aliasFor(campaign, `team:${teamId}`, `hit:${hitId}`);
const shotsKey = (c, k, round, owner) => k.campaignShots(c.game_id, c.id, round, owner);
const reportsKey = (c, k, owner) => k.campaignReports(c.game_id, c.id, owner);
const fleetKey = (c, k, owner) => k.campaignFleet(c.game_id, c.id, owner);

export function phaseOf(campaign, clock) {
  if (campaign.closed_at) return 'closed';
  if (campaign.revealed_at) return 'reveal';
  if (clock.round === 0) return 'placement';
  return clock.round <= roundsOf(campaign) ? 'firing' : 'waiting';
}

/** Where this player stands: their team, the rival team and the match's owners. */
function sidesOf(campaign, owner) {
  const team = fleet.teamOf(campaign.pairing, owner);
  if (!team) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
  const rivalId = fleet.rivalOf(campaign.pairing, team.id);
  const rival = campaign.pairing.teams.find((t) => t.id === rivalId) ?? { id: rivalId, owners: [] };
  return { team, rival, matchOwners: [...team.owners, ...rival.owners] };
}

const publicItem = (keys, id) => list(keys.live?.items).find((i) => i.id === id) ?? null;
const publicQuestion = (keys, id) => publicItem(keys, id)?.question ?? null;
const cleanText = (v) => (typeof v === 'string' ? v.trim().slice(0, TEXT_MAX) : '');
/** "Ivo P.": the class list's display form for boards and the reveal. */
const displayName = (s) => {
  const [first = '', ...rest] = String(s?.name ?? '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first || s?.initials || 'Player';
};

async function readTeam(store, k, campaign, owners, keyOf) {
  return Object.fromEntries(await Promise.all(owners.map(async (o) => [o, await read(store, keyOf(campaign, k, o))])));
}


/** Hits this player owes a damage report for: a teammate's, still owed, not filed by anyone on the team. */
function owedHits(state, team, owner, reports) {
  const filed = new Set(Object.values(reports).flatMap((r) => Object.keys(obj(r?.filed))));
  return state.hits.filter((h) => h.team === team.id && h.owner !== owner && h.status === 'owed' && !filed.has(h.id));
}

/** The resolved shot behind a hit (its item and seq), from the round log. */
function shotOfHit(state, hit) {
  const entry = state.log.find((l) => l.round === hit.round);
  return list(entry?.results).find((r) => r.outcome === 'hit' && r.owner === hit.owner && `h${hit.round}-${r.owner}-${r.seq}` === hit.id) ?? null;
}

/**
 * One player's view (plan Task 5). Every owner is a call sign or an alias; the
 * round log is filtered to this player's side (their team's shots and shots at
 * their team) and never sent raw.
 */
export async function viewFor(store, k, campaign, keys, state, clock, owner, now) {
  const { team, rival } = sidesOf(campaign, owner);
  const phase = phaseOf(campaign, clock);
  const signs = fleet.callSigns(owner, campaign.joined, hashFor(campaign.secret));
  // What this player may see: the final state once revealed; in week mode, nothing from a round before its dawn.
  const shown = await visibleState(store, k, campaign, state, now);
  const reports = await readTeam(store, k, campaign, team.owners, reportsKey);
  const mine = obj(reports[owner]);

  // My team's fleet: as placed so far during placement, then frozen.
  let fleetShips = list(shown.fleets?.[team.id]);
  let placed = shown.round >= 0;
  if (shown.round < 0) {
    const blobs = await readTeam(store, k, campaign, team.owners, fleetKey);
    fleetShips = Object.values(blobs).flatMap((b) => list(b));
    placed = Array.isArray(blobs[owner]);
  }

  const myShots = phase === 'firing' ? list(await read(store, shotsKey(campaign, k, clock.round, owner))) : [];
  const open = myShots.find((s) => shotOpen(s, now));
  // Squares my team has committed this round (mine and my teammates'), so a reload keeps the marks. Squares only.
  const teamShots = phase === 'firing'
    ? [myShots, ...(await Promise.all(team.owners.filter((o) => o !== owner).map((o) => read(store, shotsKey(campaign, k, clock.round, o)))))]
    : [];
  const fired = [...new Set(teamShots.flatMap((rows) => list(rows)).filter((s) => !s.voided).map((s) => s.square))].sort((a, b) => a - b);
  // Squares my team dudded in a resolved round that are still unknown on the rival chart.
  const rivalChart = obj(shown.charts?.[rival.id]);
  const duds = [...new Set(shown.log.flatMap((l) => l.results).filter((r) => r.outcome === 'dud' && team.owners.includes(r.owner) && !rivalChart[r.square]).map((r) => r.square))].sort((a, b) => a - b);
  const returning = shown.returns.filter((r) => r.owner === owner && r.due <= clock.round).map((r) => r.square);

  // A rejected report comes back with one more round to file it (decision 6).
  const { rejected } = reportInputs(reports);
  const owed = [];
  for (const hit of owedHits(shown, team, owner, reports)) {
    const shot = shotOfHit(shown, hit);
    const stored = shot ? list(await read(store, shotsKey(campaign, k, hit.round, hit.owner))).find((s) => s.seq === shot.seq) : null;
    owed.push({ hit: teamAlias(campaign, team.id, hit.id), square: hit.square, due: hit.round + 1 + Math.min(rejected[hit.id] ?? 0, 1), question: shot ? publicQuestion(keys, shot.item) : null, answer: stored?.answer ?? '', by: signs[hit.owner] });
  }

  const recallDue = shown.sinks.find((s) => s.by === owner && s.recall === 'pending' && !obj(mine.recall)[`${s.target}:${s.ship}`]);
  const recallItem = recallDue ? list(keys.live.fleet.recall)[fleet.SHIP_IDS.indexOf(recallDue.ship)] : null;

  const last = shown.round >= 1 ? shown.log.find((l) => l.round === shown.round) : null;
  const ours = new Set(team.owners);
  const theirs = new Set(rival.owners);
  const lines = list(last?.results)
    .filter((r) => ours.has(r.owner) || (theirs.has(r.owner) && r.target === team.id))
    .map((r) => ({ side: ours.has(r.owner) ? 'us' : 'them', by: signs[r.owner], square: r.square, sure: r.sure, returning: r.returning, outcome: r.outcome, damage: r.damage }));

  const view = {
    campaign: campaign.id,
    phase,
    round: clock.round,
    rounds: roundsOf(campaign),
    closes_at: phase === 'placement' || phase === 'firing' ? clock.closes_at : null,
    labels: { columns: keys.live.fleet.columns, rows: keys.live.fleet.rows },
    me: { sign: signs[owner], ships: fleet.shipsFor(team, owner), placed, ...(firesIn(campaign, owner, clock.round) ? {} : { joins_at: obj(campaign.late)[owner] }) },
    team: {
      signs: Object.fromEntries(team.owners.filter((o) => o !== owner).map((o) => [aliasFor(campaign, owner, o), signs[o]])),
      fleet: fleetShips,
      chart: obj(shown.charts?.[team.id])
    },
    rival: {
      signs: rival.owners.map((o) => signs[o]),
      chart: obj(shown.charts?.[rival.id]),
      sunk: shown.sinks.filter((s) => s.target === rival.id).map((s) => s.ship),
      duds
    },
    shots: {
      left: phase === 'firing' && firesIn(campaign, owner, clock.round) ? Math.max(0, SHOTS_PER_ROUND - myShots.length) : 0,
      ...(open ? { open: { square: open.square, sure: open.sure, question: publicQuestion(keys, open.item), deadline: open.deadline } } : {}),
      returning,
      fired
    },
    owed,
    ...(recallDue && recallItem ? { recall: { ship_key: recallDue.ship, prompt: publicQuestion(keys, recallItem) } } : {}),
    ...(last ? { report: { round: last.round, lines, pings: shown.pings.filter((p) => p.to === team.id && p.round === last.round).map((p) => p.line) } } : {}),
    match_over: !!shown.ended?.[fleet.matchOf(campaign.pairing, team.id)?.id],
    score: { us: shown.damage?.[team.id] ?? 0, them: shown.damage?.[rival.id] ?? 0 }
  };

  if (campaign.revealed_at) {
    const roster = await loadRoster(store, campaign.class_id);
    const byId = new Map(list(roster?.students).map((s) => [s.id, s]));
    const named = (o) => displayName(byId.get(campaign.students[o]));
    const match = fleet.standings(shown, campaign.pairing).find((m) => m.teams.some((t) => t.team === team.id));
    const sides = (id) => (id === team.id ? 'us' : 'them');
    const mineLog = shown.log.flatMap((l) => l.results).filter((r) => r.owner === owner && r.sure && r.outcome !== 'void');
    view.reveal = {
      names: Object.fromEntries([...team.owners, ...rival.owners].map((o) => [signs[o], named(o)])),
      fleets: { us: list(shown.fleets[team.id]), them: list(shown.fleets[rival.id]) },
      standings: match ? { winner: match.winner ? sides(match.winner) : null, teams: match.teams.map((t) => ({ side: sides(t.team), damage: t.damage, sunk: t.sunk, accuracy: t.accuracy })) } : null,
      calibration: { right: mineLog.filter((r) => r.correct === true).length, total: mineLog.length },
      // For the board: the class's accuracy per square and its hardest squares. No answers, no names.
      class: revealBoard(keys, shown)
    };
  }
  return view;
}

/** The class's per-square accuracy and hardest squares, labelled with the grid's topics (§4). */
export function revealBoard(keys, state) {
  const info = (square) => ({
    label: fleet.squareLabel(square), row: list(keys.live?.fleet?.rows)[fleet.rowOf(square)] ?? '', column: list(keys.live?.fleet?.columns)[fleet.colOf(square)] ?? ''
  });
  const stats = fleet.squareStats(state);
  return {
    squares: stats.map((s) => ({ square: s.square, ...info(s.square), answered: s.answered, right: s.right })),
    hardest: fleet.hardestSquares(stats).map((s) => ({ ...s, ...info(s.square) }))
  };
}

// ---------------------------------------------------------------- actions

function parseShips(raw) {
  if (!Array.isArray(raw) || raw.length > 4) reject(400, 'bad_ships', 'Place each of your ships.');
  return raw.map((s) => {
    if (!s || typeof s !== 'object' || !fleet.SHIP_IDS.includes(s.id) || !Array.isArray(s.squares) || s.squares.length > 3) reject(400, 'bad_ships', 'Place each of your ships.');
    return { id: s.id, squares: s.squares.map(Number) };
  });
}

/** `done` with this owner marked done from `until`, or null when it already says so (or earlier). */
function doneFrom(clock, owner, round, until) {
  const d = obj(clock.done)[owner];
  return d && d.round === round && d.until <= until ? null : { ...obj(clock.done), [owner]: { round, until } };
}

/** The same layout, whatever order the ships and squares came in. */
const sameShips = (a, b) => {
  const norm = (ships) => JSON.stringify(list(ships).map((s) => ({ id: s.id, squares: [...list(s.squares)].sort((x, y) => x - y) })).sort((x, y) => (x.id < y.id ? -1 : 1)));
  return norm(a) === norm(b);
};

async function place(ctx, body) {
  const { store, k, campaign, clock, owner, now } = ctx;
  if (clock.round !== 0 || !roundOpen(campaign, clock)) reject(409, 'placement_over', 'Placement has closed. The app placed your ships.');
  const { team } = sidesOf(campaign, owner);
  if (!fleet.shipsFor(team, owner).length) reject(409, 'no_ships', 'You have no ships to place this time.');
  const ships = parseShips(body.ships);
  const key = fleetKey(campaign, k, owner);
  const held = await read(store, key);
  if (!held) {
    const partners = await readTeam(store, k, campaign, team.owners.filter((o) => o !== owner), fleetKey);
    const problem = fleet.placementProblem(ships, owner, team, Object.values(partners).flatMap((b) => list(b)));
    if (problem) reject(422, 'bad_place', problem);
  }
  const written = held ? { modified: false } : await store.setJSON(key, ships, { onlyIfNew: true });
  // A resend of the same layout is fine (and re-marks done); a different one is not.
  if (written?.modified === false && !sameShips(held ?? (await read(store, key)), ships)) reject(409, 'placed', 'Your ships are already at sea.');
  await touchClock(store, k, campaign, 0, (c) => {
    const done = doneFrom(c, owner, 0, now);
    return done ? { done } : undefined;
  });
}

/**
 * One clock write per commit: seen and fired (decision 8), the open shot's hold
 * (the round can't close under it), and done from its deadline when it is the
 * player's fourth shot.
 */
async function holdForShot(ctx, shot, count) {
  const { store, k, campaign, owner } = ctx;
  const round = ctx.clock.round;
  const until = shot.deadline + LATE_GRACE_MS;
  await touchClock(store, k, campaign, round, (c) => {
    const patch = {};
    if (obj(c.seen)[owner] !== round) patch.seen = { ...obj(c.seen), [owner]: round };
    if (obj(c.fired)[owner] !== round) patch.fired = { ...obj(c.fired), [owner]: round };
    const hold = obj(c.open)[owner];
    if (!hold || hold.round !== round || hold.until < until) patch.open = { ...obj(c.open), [owner]: { round, until } };
    const done = count >= SHOTS_PER_ROUND ? doneFrom(c, owner, round, until) : null;
    if (done) patch.done = done;
    return Object.keys(patch).length ? patch : undefined;
  });
}

async function commit(ctx, body) {
  const { store, k, campaign, keys, state, clock, owner, now } = ctx;
  if (clock.round < 1 || !roundOpen(campaign, clock)) reject(409, 'not_firing', 'Wait for the next round.');
  if (!firesIn(campaign, owner, clock.round)) reject(409, 'joins_next', 'You join the fleet next round.');
  const square = Number(body.square);
  if (!Number.isInteger(square) || square < 0 || square >= fleet.SQUARES) reject(400, 'bad_square', 'Pick a square on the chart.');
  const sure = body.sure === true;
  const { rival, matchOwners } = sidesOf(campaign, owner);
  const round = clock.round;
  const variants = list(keys.live.fleet.squares[square]);
  if (!variants.length) reject(400, 'bad_square', 'Pick a square on the chart.');
  const key = shotsKey(campaign, k, round, owner);
  const back = state.returns.find((r) => r.owner === owner && r.square === square);
  // "Already known" goes by what the team can see: in week mode a hit made at last night's cut-off isn't known
  // until dawn, so firing there is allowed (it resolves as a duplicate) rather than giving the result away.
  const seen = await visibleState(store, k, campaign, state, now);
  /** Why this shot can't be fired, given the player's shots so far (checked before the hold and again at the write). */
  const refuse = (shots) => {
    if (shots.length >= SHOTS_PER_ROUND) reject(409, 'no_shots', 'You’ve used your four shots this round.');
    if (obj(seen.charts?.[rival.id])[square]) reject(409, 'known', 'Your team already knows that square. Pick another.');
    if (shots.some((s) => s.square === square)) reject(409, 'fired', 'You’ve fired there this round. Pick another.');
    if (back && back.due > round) reject(409, 'returns_later', `That square comes back to you in round ${back.due}.`);
  };
  const toShot = (open) => ({ square: open.square, sure: open.sure, question: publicQuestion(keys, open.item), deadline: open.deadline });

  // A reload while a shot is open gets that shot back, unchanged; its clock write is repeated.
  const before = list(await read(store, key));
  const already = before.find((s) => shotOpen(s, now));
  if (already) {
    await holdForShot(ctx, already, before.length);
    return toShot(already);
  }
  refuse(before);
  // The hold goes on the clock BEFORE the shot is stored, so the round can't resolve between the two.
  const deadline = now + campaign.settings.answer_ms;
  const until = deadline + LATE_GRACE_MS;
  const fourth = before.length + 1 >= SHOTS_PER_ROUND;
  const held = await touchClock(store, k, campaign, round, (c) => {
    if (roundClosing(c, now)) reject(409, 'not_firing', 'This round is closing. Wait for the next one.');
    const hold = obj(c.open)[owner];
    return {
      seen: { ...obj(c.seen), [owner]: round },
      fired: { ...obj(c.fired), [owner]: round },
      open: { ...obj(c.open), [owner]: { round, until: Math.max(until, hold?.round === round ? hold.until : 0) } },
      ...(fourth ? { done: { ...obj(c.done), [owner]: { round, until } } } : {})
    };
  });
  if (held.data?.round !== round) reject(409, 'not_firing', 'That round has closed. Wait for the next one.');

  // What the match has been given this round, for the variant choice (§1.1).
  const others = await Promise.all(matchOwners.filter((o) => o !== owner).map((o) => read(store, shotsKey(campaign, k, round, o))));
  const given = [...state.given, ...others.flatMap((s) => list(s)).map((s) => ({ owner: s.owner, square: s.square, variant: s.variant }))];
  let shot = null;
  let count = 0;
  await updateJSON(store, key, (stored) => {
    const shots = list(stored);
    count = shots.length;
    const open = shots.find((s) => shotOpen(s, now));
    if (open) { shot = open; return undefined; }
    refuse(shots);
    const returning = !!back;
    const variant = returning
      ? Math.min(back.variant, variants.length - 1)
      : fleet.pickVariant(square, owner, matchOwners, given, variants.length);
    const seq = Math.max(now, ...shots.map((s) => s.seq + 1));
    shot = { seq, owner, square, sure, variant, item: variants[variant], deadline, returning };
    count = shots.length + 1;
    // A shot whose time ran out unanswered is a dud (decision 9).
    return [...shots.map((s) => (s.correct === undefined ? { ...s, correct: null } : s)), shot];
  });
  // A racing commit got there first: make sure the clock matches the shot that stands.
  if (shot.deadline !== deadline || count !== before.length + 1) await holdForShot(ctx, shot, count);
  return toShot(shot);
}

async function answer(ctx, body) {
  const { store, k, campaign, keys, clock, owner, now } = ctx;
  if (clock.round < 1 || !roundOpen(campaign, clock)) reject(409, 'not_firing', 'That round has closed.');
  const round = clock.round;
  const text = cleanText(body.answer);
  let late = false;
  let resend = false;
  let seq = null;
  let shots = [];
  await updateJSON(store, shotsKey(campaign, k, round, owner), (held) => {
    shots = list(held);
    const at = shots.findIndex((s) => s.correct === undefined);
    if (at < 0) {
      // A resend after a lost reply: every shot is settled, or this answer is already stored.
      const last = shots[shots.length - 1];
      if (shots.length >= SHOTS_PER_ROUND || (text && last?.answer === text)) { resend = true; return undefined; }
      reject(409, 'no_shot', 'Pick a square first.');
    }
    const s = shots[at];
    seq = s.seq;
    if (now > s.deadline + LATE_GRACE_MS) {
      late = true;
      shots[at] = { ...s, correct: null, late: true };
    } else {
      const result = checkAnswer(keys.items[s.item], { text });
      shots[at] = { ...s, correct: result.correct === true, answer: text, writing: cleanWritingLog(body.writing), answered_at: now };
    }
    return shots;
  });
  // Release this player's hold, and mark them done after their fourth. Not fatal if it loses:
  // the hold and `done` both run out at the shot's deadline anyway, and a resend repeats it.
  const release = async () => {
    const settled = shots.length >= SHOTS_PER_ROUND && shots.every((s) => s.correct !== undefined);
    try {
      await touchClock(store, k, campaign, round, (c) => {
        const patch = {};
        const hold = obj(c.open)[owner];
        if (hold && hold.round === round && hold.until > now) patch.open = { ...obj(c.open), [owner]: { round, until: now } };
        const done = settled ? doneFrom(c, owner, round, now) : null;
        if (done) patch.done = done;
        return Object.keys(patch).length ? patch : undefined;
      });
    } catch {
      // ignore: see above
    }
  };
  if (late) {
    await release();
    reject(409, 'late', 'Time ran out on that shot.');
  }
  if (resend) {
    await release();
    return { ok: true };
  }

  /**
   * Did the round resolve under this answer? Ask the resolved log for this shot:
   * resolved with the answer → ok; resolved without it → late; not resolved → null.
   */
  const landed = async () => {
    const resolved = await read(store, k.campaignResolved(campaign.game_id, campaign.id, round));
    if (!resolved) return null;
    const mine = list(resolved.log?.find((l) => l.round === round)?.results).find((r) => r.owner === owner && r.seq === seq);
    if (mine && mine.correct !== null) return { ok: true };
    reject(409, 'late', 'That round closed before your answer landed.');
  };
  // Before releasing the hold: the round can't have resolved since, unless it had already.
  const early = await landed();
  if (early) return early;
  await release();
  // A poll may resolve the round as soon as the hold is released; that resolution includes this answer.
  return (await landed()) ?? { ok: true };
}

/**
 * A damage report, filed in the shooter's reports blob so the "already filed"
 * check and a rejection each sit in one etag write (one filing wins).
 */
async function report(ctx, body) {
  const { store, k, campaign, state, clock, owner } = ctx;
  const { team } = sidesOf(campaign, owner);
  const hit = state.hits.find((h) => h.team === team.id && teamAlias(campaign, team.id, h.id) === body.hit);
  if (!hit) reject(404, 'bad_hit', 'That hit isn’t on your team’s chart.');
  if (hit.owner === owner) reject(403, 'own_hit', 'Your partner explains your hits.');
  if (hit.status !== 'owed') reject(409, 'settled', 'That report’s time has passed.');
  const text = cleanText(body.text);
  if (!text) reject(400, 'bad_text', 'Write one line about why the answer is right.');
  await updateJSON(store, reportsKey(campaign, k, hit.owner), (held) => {
    const r = obj(held);
    if (obj(r.filed)[hit.id]) reject(409, 'filed', 'Your team has filed that report.');
    return { ...r, filed: { ...obj(r.filed), [hit.id]: { round: clock.round, by: owner, text, writing: cleanWritingLog(body.writing) } } };
  });
  return { ok: true };
}

async function recall(ctx, body) {
  const { store, k, campaign, keys, state, clock, owner } = ctx;
  const { rival } = sidesOf(campaign, owner);
  const sink = state.sinks.find((s) => s.by === owner && s.target === rival.id && s.ship === body.ship_key && s.recall === 'pending');
  if (!sink) reject(404, 'no_recall', 'There’s no recall line waiting for you.');
  const id = list(keys.live.fleet.recall)[fleet.SHIP_IDS.indexOf(sink.ship)];
  if (!id || !keys.items[id]) reject(409, 'no_recall', 'There’s no recall line waiting for you.');
  const text = cleanText(body.answer);
  const correct = checkAnswer(keys.items[id], { text }).correct === true;
  const key = `${sink.target}:${sink.ship}`;
  await updateJSON(store, reportsKey(campaign, k, owner), (held) => {
    const r = obj(held);
    if (obj(r.recall)[key]) reject(409, 'answered', 'You’ve answered that recall line.');
    return { ...r, recall: { ...obj(r.recall), [key]: { round: clock.round, answer: text, correct, writing: cleanWritingLog(body.writing) } } };
  });
  return { ok: true };
}

// ---------------------------------------------------------------- signals (§2)

/** The toast line for each event, exactly as spec §2's table. */
export const SIGNAL_LINES = {
  round_open: 'Four shells ready.',
  report_ready: 'Dawn report is in.',
  hit: "You've been hit.",
  report_owed: 'Your partner hit something. Confirm it.',
  reveal: 'The fog is lifting.'
};
/** Most signal ids kept per player per campaign; the oldest drop off first. */
export const SEEN_MAX = 200;
const SIGNAL_ID = /^([a-f0-9]{16}):(round_open|report_ready|hit|report_owed|reveal):(\d{1,2}|final)$/;
const SEEN_BATCH = 50;
const INDEX_MAX = 20;

/**
 * Every event waiting for `owner` in one campaign, not yet shown (§2). Ids are
 * `${campaign}:${kind}:${round}`, so each event shows once. Resolves the round
 * first (as any request does), so a report or a hit shows as soon as it exists.
 */
export async function signalsFor(store, k, found, owner, now) {
  if (found.closed_at || !list(found.joined).includes(owner)) return [];
  const { campaign, state, clock } = await ensureCampaign(store, k, found, now);
  if (campaign.closed_at) return [];
  const team = fleet.teamOf(campaign.pairing, owner);
  if (!team) return [];
  const seen = new Set(list(obj(await read(store, k.campaignSeen(campaign.game_id, campaign.id, owner))).ids));
  const shown = await visibleState(store, k, campaign, state, now);
  const events = [];
  const add = (kind, round) => events.push({ id: `${campaign.id}:${kind}:${round}`, kind, line: SIGNAL_LINES[kind], game_id: campaign.game_id, lesson_id: campaign.lesson });
  if (campaign.revealed_at) {
    add('reveal', 'final');
  } else {
    const last = shown.round >= 1 ? shown.log.find((l) => l.round === shown.round) : null;
    if (list(last?.results).some((r) => r.target === team.id && r.outcome === 'hit')) add('hit', shown.round);
    const reports = await readTeam(store, k, campaign, team.owners, reportsKey);
    const owed = owedHits(shown, team, owner, reports);
    if (owed.length) add('report_owed', Math.max(...owed.map((h) => h.round)));
    if (last) add('report_ready', shown.round);
    if (clock.round >= 1 && roundOpen(campaign, clock) && !roundClosing(clock, now) && firesIn(campaign, owner, clock.round)) {
      const shots = list(await read(store, shotsKey(campaign, k, clock.round, owner)));
      if (shots.length < SHOTS_PER_ROUND) add('round_open', clock.round);
    }
  }
  return events.filter((e) => !seen.has(e.id));
}

/** Record shown signal ids in each campaign's seen/{owner} (etag append, newest SEEN_MAX kept). */
async function markSeen(store, campaignsById, owner, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > SEEN_BATCH) reject(400, 'bad_ids', 'Nothing to mark.');
  const byCampaign = new Map();
  for (const id of ids) {
    const m = typeof id === 'string' ? SIGNAL_ID.exec(id) : null;
    if (!m || !campaignsById.has(m[1])) continue;
    byCampaign.set(m[1], [...(byCampaign.get(m[1]) ?? []), id]);
  }
  for (const [id, fresh] of byCampaign) {
    const { k, campaign } = campaignsById.get(id);
    if (!list(campaign.joined).includes(owner)) continue;
    await updateJSON(store, k.campaignSeen(campaign.game_id, campaign.id, owner), (held) => {
      const kept = list(obj(held).ids);
      const add = [...new Set(fresh)].filter((x) => !kept.includes(x));
      return add.length ? { ids: [...kept, ...add].slice(-SEEN_MAX) } : undefined;
    });
  }
  return { ok: true };
}

/** The open Fleet week campaigns of a lesson for a class (each fleet game's current campaign), by id. */
async function lessonCampaigns(store, lessonId, classId, gameId) {
  const k = gameKeys(lessonId);
  const current = await read(store, k.current);
  const record = current?.version ? await read(store, k.version(current.version)) : null;
  const games = list(record?.order).filter((g) => record.games?.[g]?.kind === 'fleet_week' && (gameId === undefined || g === gameId));
  const found = await Promise.all(games.map((g) => findCampaign(store, k, g, classId)));
  return new Map(found.filter((c) => c && !c.closed_at).map((c) => [c.id, { k, campaign: c }]));
}

/** The open Fleet week campaigns of a class across lessons, from the class index. */
async function classCampaigns(store, classId) {
  const index = list(obj(await read(store, campaignIndexKey(classId))).campaigns).slice(-INDEX_MAX);
  const found = await Promise.all(index.map(async (e) => {
    if (!isSafeId(e?.lesson_id) || !isSafeId(e?.game_id)) return null;
    const k = gameKeys(e.lesson_id);
    const c = await findCampaign(store, k, e.game_id, classId, e.id);
    return c && !c.closed_at ? { k, campaign: c } : null;
  }));
  return new Map(found.filter(Boolean).map((x) => [x.campaign.id, x]));
}

/** Signals across campaigns. One broken campaign is logged and skipped, never a failed page for every student. */
async function collectSignals(store, campaignsById, owner, now) {
  const lists = await Promise.all([...campaignsById.values()].map(async ({ k, campaign }) => {
    try {
      return await signalsFor(store, k, campaign, owner, now);
    } catch (e) {
      console.error('fleet week: signals skipped a campaign', campaign?.id, e?.message);
      return [];
    }
  }));
  return { events: lists.flat() };
}

const studentOwner = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

/** The class-wide entry point for the student now strip and other student pages (no lesson id needed). */
export async function fleetClassSignals(store, classId, studentId, { now = Date.now() } = {}) {
  return collectSignals(store, await classCampaigns(store, classId), studentOwner(classId, studentId), now);
}

/** Mark class-wide signals shown. */
export async function fleetClassSignalsSeen(store, classId, studentId, ids) {
  return markSeen(store, await classCampaigns(store, classId), studentOwner(classId, studentId), ids);
}

/**
 * A student on the class list who wasn't in the game when it opened (§3.5):
 * they join the team of two that has dealt the least damage (ties: team
 * order) as a third member, firing from the next round, with no ships to
 * place. Placement or a firing round only; after the last round they wait
 * for the next game. One etag write on the campaign, so two joins can't race.
 */
async function lateJoin(store, k, found, owner, studentId, now) {
  const { state, clock } = await ensureResolved(store, k, found, now);
  if (!roundOpen(found, clock)) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
  const from = clock.round + 1;
  if (from > roundsOf(found)) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
  const { data } = await updateJSON(store, k.campaign(found.game_id, found.id), (c) => {
    if (list(c.joined).includes(owner)) return undefined;
    if (c.revealed_at || c.closed_at) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
    const playing = c.pairing.teams.filter((t) => !t.ghost && t.owners.length);
    const pool = playing.some((t) => t.owners.length === 2) ? playing.filter((t) => t.owners.length === 2) : playing;
    if (!pool.length) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
    const damage = (t) => state.damage?.[t.id] ?? 0;
    const team = pool.reduce((best, t) => (damage(t) < damage(best) ? t : best), pool[0]);
    return {
      ...c,
      pairing: { ...c.pairing, teams: c.pairing.teams.map((t) => (t.id === team.id ? { ...t, owners: [...t.owners, owner], late: [...list(t.late), owner] } : t)) },
      joined: [...list(c.joined), owner],
      students: { ...obj(c.students), [owner]: studentId },
      late: { ...obj(c.late), [owner]: from }
    };
  });
  return data;
}

/** Student actions on a Fleet week campaign (`identify()` has run; `owner` is the student's). */
export async function fleetStudentAction(store, lessonId, body, { classId, student, owner, now = Date.now() }) {
  const action = body.action;
  if (!FLEET_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (!student) reject(409, 'need_roster', 'Fleet week needs a class list. Ask your teacher.');
  const k = gameKeys(lessonId);
  if (action === 'signals' || action === 'signals_seen') {
    if (body.game_id !== undefined && typeof body.game_id !== 'string') reject(400, 'bad_game', 'That game isn’t in this lesson.');
    const campaigns = await lessonCampaigns(store, lessonId, classId, body.game_id);
    return action === 'signals' ? collectSignals(store, campaigns, owner, now) : markSeen(store, campaigns, owner, body.ids);
  }
  let found = await findCampaign(store, k, body.game_id, classId, body.campaign_id);
  if (!found || found.game_id !== body.game_id) reject(409, 'no_campaign', 'Your teacher hasn’t started this game yet.');
  if (!list(found.joined).includes(owner)) {
    if (action !== 'fleet_state') reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
    found = await lateJoin(store, k, found, owner, student.id, now);
  }
  const { keys } = await loadFleetGame(store, k, found.game_id, found.version);
  if (action !== 'fleet_state' && (found.closed_at || found.revealed_at)) reject(409, 'closed', 'This game has finished.');
  const resolved = await ensureCampaign(store, k, found, now);
  const { campaign, state, clock } = resolved;
  const ctx = { store, k, campaign, keys, state, clock, owner, now };

  if (action === 'fleet_state') {
    let seenClock = clock;
    if (roundOpen(campaign, clock) && obj(clock.seen)[owner] !== clock.round) {
      const marked = await markClock(store, k, campaign, 'seen', owner, clock.round);
      if (marked.data) seenClock = marked.data;
    }
    return viewFor(store, k, campaign, keys, state, seenClock, owner, now);
  }
  if (action === 'fleet_place') {
    await place(ctx, body);
    return viewFor(store, k, campaign, keys, state, clock, owner, now);
  }
  if (action === 'fleet_commit') return commit(ctx, body);
  if (action === 'fleet_answer') return answer(ctx, body);
  if (action === 'fleet_report') return report(ctx, body);
  return recall(ctx, body);
}
