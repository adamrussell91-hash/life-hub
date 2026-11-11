// The live game room's rules and tickets, bundled to netlify/functions/_shared/game-room-core.mjs.
// Imported by the Worker (workers/game-rooms) and by Netlify (open, join, fold), so both sides run one implementation.
export { GROUP_COLOURS, classWall, foldPayload, initialState, nextAlarm, publicView, reduce, roomStyle, seatRestore, viewDelta } from './room-core';
export { markMove, quotePoints } from './mark';
export { SIGNATURE_HEADER, SIGNATURE_SKEW_MS, TICKET_LIFE_MS, signBody, signTicket, ticketFromAuthorization, verifyBody, verifyTicket } from './room-ticket';
export { ROOM_LIMITS } from './room-protocol';
