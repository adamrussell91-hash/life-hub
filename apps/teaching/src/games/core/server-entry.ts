// The game rules the server needs, bundled to netlify/functions/_shared/game-rules.mjs.
export { checkAnswer, clueOf, evidenceTags, gameIssues, gameItems, gameWarnings, gridWord, itemLabel, normaliseAnswer, splitGame, wordLengths } from './model';
export { GAME_MOVES, MARKED_MOVES, PLAY_EVENTS_MAX, REVEAL_HINTS, SOLO_BATCH_MAX, STRENGTH_LABELS, GameEventSchema, SoloEventInputSchema, eventsToEvidence, missedPieces, playScore } from './events';
