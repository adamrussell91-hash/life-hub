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
 *   signals       → { events: [] } (plan 2)
 *
 * What a student never receives before the reveal: an accepted answer, the
 * rival fleet, the match secret, a real owner hash, a student id or a name.
 * Players appear as call signs, which differ on every screen (§1.8), and
 * teammates and hits by opaque aliases.
 */
import { loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';
import { gameKeys } from './game-store.mjs';
import { cleanWritingLog } from './quiz-core.mjs';
import { checkAnswer, fleet } from './game-rules.mjs';
import {
  SHOTS_PER_ROUND, aliasFor, ensureResolved, findCampaign, hashFor, list, loadFleetGame, markClock, obj, reportInputs, roundOpen,
  roundsOf, updateJSON
} from './fleet-week-store.mjs';

export const FLEET_ACTIONS = ['fleet_state', 'fleet_place', 'fleet_commit', 'fleet_answer', 'fleet_report', 'fleet_recall', 'signals'];
/** Answers may arrive this long after the deadline (network grace). */
export const LATE_GRACE_MS = 2000;
const TEXT_MAX = 300;

const shotOpen = (s, now) => s.correct === undefined && now <= s.deadline + LATE_GRACE_MS;
const teamAlias = (campaign, teamId, hitId) => aliasFor(campaign, `team:${teamId}`, `hit:${hitId}`);
const shotsKey = (c, k, round, owner) => k.campaignShots(c.game_id, c.id, round, owner);
const reportsKey = (c, k, owner) => k.campaignReports(c.game_id, c.id, owner);
const fleetKey = (c, k, owner) => k.campaignFleet(c.game_id, c.id, owner);

function phaseOf(campaign, clock) {
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

/** The latest settled state for the view: the final one once revealed. */
async function viewState(store, k, campaign, state) {
  if (!campaign.revealed_at) return state;
  return (await read(store, k.campaignResolved(campaign.game_id, campaign.id, 'final'))) ?? state;
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
  const shown = await viewState(store, k, campaign, state);
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
    me: { sign: signs[owner], ships: fleet.shipsFor(team, owner), placed },
    team: {
      signs: Object.fromEntries(team.owners.filter((o) => o !== owner).map((o) => [aliasFor(campaign, owner, o), signs[o]])),
      fleet: fleetShips,
      chart: obj(shown.charts?.[team.id])
    },
    rival: {
      signs: rival.owners.map((o) => signs[o]),
      chart: obj(shown.charts?.[rival.id]),
      sunk: shown.sinks.filter((s) => s.target === rival.id).map((s) => s.ship)
    },
    shots: {
      left: phase === 'firing' ? Math.max(0, SHOTS_PER_ROUND - myShots.length) : 0,
      ...(open ? { open: { square: open.square, sure: open.sure, question: publicQuestion(keys, open.item), deadline: open.deadline } } : {}),
      returning
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
      calibration: { right: mineLog.filter((r) => r.correct === true).length, total: mineLog.length }
    };
  }
  return view;
}

// ---------------------------------------------------------------- actions

function parseShips(raw) {
  if (!Array.isArray(raw) || raw.length > 4) reject(400, 'bad_ships', 'Place each of your ships.');
  return raw.map((s) => {
    if (!s || typeof s !== 'object' || !fleet.SHIP_IDS.includes(s.id) || !Array.isArray(s.squares) || s.squares.length > 3) reject(400, 'bad_ships', 'Place each of your ships.');
    return { id: s.id, squares: s.squares.map(Number) };
  });
}

async function place(ctx, body) {
  const { store, k, campaign, clock, owner } = ctx;
  if (clock.round !== 0 || !roundOpen(campaign, clock)) reject(409, 'placement_over', 'Placement has closed. The app placed your ships.');
  const { team } = sidesOf(campaign, owner);
  if (!fleet.shipsFor(team, owner).length) reject(409, 'no_ships', 'You have no ships to place this time.');
  const ships = parseShips(body.ships);
  const partners = await readTeam(store, k, campaign, team.owners.filter((o) => o !== owner), fleetKey);
  const problem = fleet.placementProblem(ships, owner, team, Object.values(partners).flatMap((b) => list(b)));
  if (problem) reject(422, 'bad_place', problem);
  const written = await store.setJSON(fleetKey(campaign, k, owner), ships, { onlyIfNew: true });
  if (written?.modified === false) reject(409, 'placed', 'Your ships are already at sea.');
  await markClock(store, k, campaign, 'done', owner, 0);
}

async function commit(ctx, body) {
  const { store, k, campaign, keys, state, clock, owner, now } = ctx;
  if (clock.round < 1 || !roundOpen(campaign, clock)) reject(409, 'not_firing', 'Wait for the next round.');
  const square = Number(body.square);
  if (!Number.isInteger(square) || square < 0 || square >= fleet.SQUARES) reject(400, 'bad_square', 'Pick a square on the chart.');
  const sure = body.sure === true;
  const { rival, matchOwners } = sidesOf(campaign, owner);
  const round = clock.round;
  const variants = list(keys.live.fleet.squares[square]);
  if (!variants.length) reject(400, 'bad_square', 'Pick a square on the chart.');
  // What the match has been given this round, for the variant choice (§1.1).
  const others = await Promise.all(matchOwners.filter((o) => o !== owner).map((o) => read(store, shotsKey(campaign, k, round, o))));
  const given = [...state.given, ...others.flatMap((s) => list(s)).map((s) => ({ owner: s.owner, square: s.square, variant: s.variant }))];
  const back = state.returns.find((r) => r.owner === owner && r.square === square);

  let shot = null;
  await updateJSON(store, shotsKey(campaign, k, round, owner), (held) => {
    const shots = list(held);
    const open = shots.find((s) => shotOpen(s, now));
    if (open) { shot = open; return undefined; }
    if (shots.length >= SHOTS_PER_ROUND) reject(409, 'no_shots', 'You’ve used your four shots this round.');
    const known = obj(state.charts[rival.id])[square];
    if (known) reject(409, 'known', 'Your team already knows that square. Pick another.');
    if (shots.some((s) => s.square === square)) reject(409, 'fired', 'You’ve fired there this round. Pick another.');
    if (back && back.due > round) reject(409, 'returns_later', `That square comes back to you in round ${back.due}.`);
    const returning = !!back;
    const variant = returning
      ? Math.min(back.variant, variants.length - 1)
      : fleet.pickVariant(square, owner, matchOwners, given, variants.length);
    const seq = Math.max(now, ...shots.map((s) => s.seq + 1));
    shot = { seq, owner, square, sure, variant, item: variants[variant], deadline: now + campaign.settings.answer_ms, returning };
    // A shot whose time ran out unanswered is a dud (decision 9).
    return [...shots.map((s) => (s.correct === undefined ? { ...s, correct: null } : s)), shot];
  });
  // Firing makes a player active this round and next (decision 8).
  await markClock(store, k, campaign, 'fired', owner, round);
  await markClock(store, k, campaign, 'seen', owner, round);
  return { square: shot.square, sure: shot.sure, question: publicQuestion(keys, shot.item), deadline: shot.deadline };
}

async function answer(ctx, body) {
  const { store, k, campaign, keys, clock, owner, now } = ctx;
  if (clock.round < 1 || !roundOpen(campaign, clock)) reject(409, 'not_firing', 'That round has closed.');
  const text = cleanText(body.answer);
  let late = false;
  let shots = [];
  await updateJSON(store, shotsKey(campaign, k, clock.round, owner), (held) => {
    shots = list(held);
    const at = shots.findIndex((s) => s.correct === undefined);
    if (at < 0) reject(409, 'no_shot', 'Pick a square first.');
    const s = shots[at];
    if (now > s.deadline + LATE_GRACE_MS) {
      late = true;
      shots[at] = { ...s, correct: null, late: true };
    } else {
      const result = checkAnswer(keys.items[s.item], { text });
      shots[at] = { ...s, correct: result.correct === true, answer: text, writing: cleanWritingLog(body.writing), answered_at: now };
    }
    return shots;
  });
  if (shots.length >= SHOTS_PER_ROUND && shots.every((s) => s.correct !== undefined)) await markClock(store, k, campaign, 'done', owner, clock.round);
  if (late) reject(409, 'late', 'Time ran out on that shot.');
  return { ok: true };
}

async function report(ctx, body) {
  const { store, k, campaign, state, clock, owner } = ctx;
  const { team } = sidesOf(campaign, owner);
  const hit = state.hits.find((h) => h.team === team.id && teamAlias(campaign, team.id, h.id) === body.hit);
  if (!hit) reject(404, 'bad_hit', 'That hit isn’t on your team’s chart.');
  if (hit.owner === owner) reject(403, 'own_hit', 'Your partner explains your hits.');
  if (hit.status !== 'owed') reject(409, 'settled', 'That report’s time has passed.');
  const text = cleanText(body.text);
  if (!text) reject(400, 'bad_text', 'Write one line about why the answer is right.');
  const reports = await readTeam(store, k, campaign, team.owners, reportsKey);
  if (Object.values(reports).some((r) => obj(r?.filed)[hit.id])) reject(409, 'filed', 'Your team has filed that report.');
  await updateJSON(store, reportsKey(campaign, k, owner), (held) => {
    const r = obj(held);
    return { ...r, filed: { ...obj(r.filed), [hit.id]: { round: clock.round, text, writing: cleanWritingLog(body.writing) } } };
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

/** Student actions on a Fleet week campaign (`identify()` has run; `owner` is the student's). */
export async function fleetStudentAction(store, lessonId, body, { classId, student, owner, now = Date.now() }) {
  const action = body.action;
  if (!FLEET_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (!student) reject(409, 'need_roster', 'Fleet week needs a class list. Ask your teacher.');
  const k = gameKeys(lessonId);
  const campaign = await findCampaign(store, k, body.game_id, classId, body.campaign_id);
  if (!campaign || campaign.game_id !== body.game_id) reject(409, 'no_campaign', 'Your teacher hasn’t started this game yet.');
  if (!list(campaign.joined).includes(owner)) reject(403, 'not_in_game', 'You joined after this game started. You’ll be in the next one.');
  if (action === 'signals') return { events: [] };
  const { keys } = await loadFleetGame(store, k, campaign.game_id, campaign.version);
  if (action !== 'fleet_state' && (campaign.closed_at || campaign.revealed_at)) reject(409, 'closed', 'This game has finished.');
  const { state, clock } = await ensureResolved(store, k, campaign, now);
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
