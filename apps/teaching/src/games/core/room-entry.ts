// The live game room's rules and tickets, bundled to netlify/functions/_shared/game-room-core.mjs.
// Imported by the Worker (workers/game-rooms) and by Netlify (open, join, fold), so both sides run one implementation.
// Every kind with its own room rules registers itself here (style 'custom'), so the Worker and Netlify bundle it.
import './room-rules-index';
export { GROUP_COLOURS, classWall, foldPayload, initialState, nextAlarm, publicView, reduce, roomStyle, roomTeams, seatRestore, teamCount, viewDelta } from './room-core';
export { registerRules, rulesFor } from './room-rules';
export { markMove, quotePoints } from './mark';
export { SIGNATURE_HEADER, SIGNATURE_SKEW_MS, TICKET_LIFE_MS, signBody, signTicket, ticketFromAuthorization, verifyBody, verifyTicket } from './room-ticket';
export { ROOM_LIMITS, TEAM_NAMES, teamName } from './room-protocol';
