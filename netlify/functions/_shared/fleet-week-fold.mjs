/**
 * Fleet week learning data (spec §4): each resolved round's shots fold into the
 * game events every kind writes, so Results, the markbook evidence and the
 * student profile read them with no new reader.
 *
 *   games/{lesson}/{game}/events/{play}/{owner}   one GameEvent per shot (move 'answer')
 *   games/{lesson}/{game}/plays/{play}            one play per player per campaign, rewritten each round
 *   games/{lesson}/{game}/summary/{class}         rebuilt (rebuildSummary)
 *
 * The same sequence as foldRoom (game-rooms.mjs): events, the play record,
 * duds on organiser pieces to box 1, the summary. It runs once per round, from
 * the request whose create-only write of resolved/{round} won (fleet-week-store
 * ensureResolved), and is idempotent: a second run replaces that round's events
 * (by their `cid`, `r{round}-{seq}`) with the same ones.
 */
import { createHash } from 'node:crypto';
import { loadRoster } from './class-claims.mjs';
import { read } from './question-drop.mjs';
import { sendPiecesToBoxOne } from './organiser.mjs';
import { rebuildSummary } from './games.mjs';
import { eventsToEvidence, gameTotal, playScore } from './game-rules.mjs';
import { list, obj, updateJSON } from './etag-json.mjs';

/** One play per player per campaign (16 hex, like every play id). */
export const fleetPlayId = (campaign, owner) => createHash('sha256').update(`fleet:${campaign.id}:${owner}`).digest('hex').slice(0, 16);
/** §4: answered alone, timed, in class in lesson mode; over the week, at home, in week mode. */
export const strengthFor = (campaign) => (campaign.mode === 'week' ? 'self_paced' : 'live_solo');
/** Play mode: 'live' for a lesson-mode game, 'campaign' for a week (the play record has no fixed list of modes). */
export const playModeFor = (campaign) => (campaign.mode === 'week' ? 'campaign' : 'live');

const iso = (ms) => new Date(ms).toISOString();
const cidOf = (round, seq) => `r${round}-${seq}`;
const roundOfCid = (cid) => Number(/^r(\d+)-/.exec(cid ?? '')?.[1] ?? -1);
const seqOfCid = (cid) => Number(/-(\d+)$/.exec(cid ?? '')?.[1] ?? 0);

/** The knowledge pieces on an item's tags (`kp:{id}`). */
const piecesOf = (key) => list(key?.tags).filter((t) => typeof t === 'string' && t.startsWith('kp:')).map((t) => t.slice(3));

/**
 * One resolved shot as a GameEvent (core/events.ts). A voided shot keeps
 * `correct: null`, so it is in the log but never evidence; a shot with no
 * answer in time is wrong.
 */
function eventOf(campaign, state, result, stored, round, strength, studentId) {
  const voided = result.outcome === 'void' || !!result.voided;
  const answered = typeof stored?.answered_at === 'number';
  const shownAt = typeof stored?.deadline === 'number' ? stored.deadline - campaign.settings.answer_ms : null;
  const onShip = list(state.fleets?.[result.target]).some((s) => list(s.squares).includes(result.square));
  return {
    seq: 0,
    at: answered ? stored.answered_at : stored?.deadline ?? result.seq,
    game: 'fleet_week',
    play_id: fleetPlayId(campaign, result.owner),
    owner: result.owner,
    ...(studentId ? { student_id: studentId } : {}),
    ...(fleetTeamOf(campaign, result.owner) ? { team: fleetTeamOf(campaign, result.owner) } : {}),
    item: result.item,
    move: 'answer',
    response: typeof stored?.answer === 'string' ? stored.answer : '',
    correct: voided ? null : result.correct === true,
    ...(answered && shownAt != null ? { time_ms: Math.min(3600000, Math.max(0, stored.answered_at - shownAt)) } : {}),
    extra: { sure: !!result.sure, returning: !!result.returning, on_ship: onShip, voided, square: result.square, round, outcome: result.outcome },
    strength,
    cid: cidOf(round, result.seq)
  };
}

const fleetTeamOf = (campaign, owner) => list(campaign.pairing?.teams).find((t) => list(t.owners).includes(owner))?.id ?? null;

/**
 * Fold round `round` of `state` (just resolved) into the game events. `stored`
 * is every owner's stored shots for that round (answers, deadlines, times).
 */
export async function foldRound(store, k, campaign, state, round, stored, { now = Date.now(), boxed: boxedBefore = {}, onBoxed = async () => {} } = {}) {
  const results = list(state.log?.find((l) => l.round === round)?.results);
  if (!results.length) return { plays: 0 };
  const record = await read(store, k.version(campaign.version));
  const keys = record?.games?.[campaign.game_id];
  if (!keys) return { plays: 0 };
  const roster = await loadRoster(store, campaign.class_id);
  const strength = strengthFor(campaign);
  const storedBy = new Map(list(stored).map((s) => [`${s.owner}:${s.seq}`, s]));
  const byOwner = new Map();
  for (const r of results) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);

  let plays = 0;
  for (const [owner, mine] of byOwner) {
    const studentId = obj(campaign.students)[owner] ?? null;
    const student = roster?.students.find((s) => s.id === studentId) ?? null;
    const playId = fleetPlayId(campaign, owner);
    const fresh = mine.map((r) => eventOf(campaign, state, r, storedBy.get(`${owner}:${r.seq}`), round, strength, studentId));
    const { data: events } = await updateJSON(store, k.events(campaign.game_id, playId, owner), (held) => {
      const kept = list(held).filter((e) => roundOfCid(e.cid) !== round);
      return [...kept, ...fresh]
        .sort((a, b) => roundOfCid(a.cid) - roundOfCid(b.cid) || seqOfCid(a.cid) - seqOfCid(b.cid))
        .map((e, i) => ({ ...e, seq: i }));
    });
    const evidence = eventsToEvidence(keys, events);
    const score = { ...playScore(evidence), total: gameTotal(keys) };
    // Duds this round on a square whose item carries a knowledge piece: that organiser card goes back to box 1.
    // Every wrong answer this round (a dud, and a wrong practice or duplicate shot too; never a voided one) on an
    // item that carries a knowledge piece: that organiser card goes back to box 1. Once per player per round:
    // a retried fold finds the player in `boxedBefore` and skips the step.
    let boxed = boxedBefore[owner];
    if (boxed === undefined) {
      const wrong = mine.filter((r) => r.outcome !== 'void' && !r.voided && r.correct !== true);
      const pieces = [...new Set(wrong.flatMap((r) => piecesOf(keys.items?.[r.item])))];
      boxed = roster && student && pieces.length ? await sendPiecesToBoxOne(store, roster, student, pieces, { now: new Date(now) }) : 0;
      await onBoxed(owner, boxed);
    }
    const playKey = k.play(campaign.game_id, playId);
    const prev = obj(await read(store, playKey));
    await store.setJSON(playKey, {
      play_id: playId, game_id: campaign.game_id, kind: 'fleet_week', mode: playModeFor(campaign), campaign_id: campaign.id,
      class_id: campaign.class_id, owner, ...(studentId ? { student_id: studentId } : {}), version: campaign.version,
      started_at: iso(campaign.created_at), ended_at: iso(Math.max(...events.map((e) => e.at))), folded: true, score,
      // Cards sent to box 1, by round, so a re-fold of a round counts it once.
      boxed_by_round: { ...obj(prev.boxed_by_round), [round]: boxed },
      boxed: Object.values({ ...obj(prev.boxed_by_round), [round]: boxed }).reduce((n, b) => n + (Number(b) || 0), 0), rounds: [...new Set([...list(prev.rounds), round])].sort((a, b) => a - b)
    });
    plays += 1;
  }
  const current = await read(store, k.current);
  const currentRecord = current?.version && current.version !== campaign.version ? (await read(store, k.version(current.version))) ?? record : record;
  await rebuildSummary(store, campaign.lesson, campaign.game_id, campaign.class_id, currentRecord);
  return { plays };
}
