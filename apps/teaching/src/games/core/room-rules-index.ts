/**
 * Every live kind with its own room rules (style 'custom'). One import per
 * kind; each module calls `registerRules`. Bundled with room-core for the
 * Worker and Netlify (core/room-entry.ts imports this file).
 */
import '../kinds/jeopardy/rules';
import '../kinds/points-rush/rules';
import '../kinds/team-match/rules';
import '../kinds/wager/rules';
import '../kinds/wheel/rules';
