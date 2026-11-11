/**
 * Every game kind's player and print renderer, registered by importing its
 * module here. Phase 3 adds crossword, find-a-word, Connections and Who said
 * it, e.g. `import './crossword';` where `kinds/crossword/index.ts` calls
 * `registerPlayer('crossword', …)` and `registerPrint('crossword', …)` from
 * `games/solo/registry.ts`. The arcade and print import this file, so a kind
 * registered here is playable and printable everywhere.
 */
import './connections';
import './who-said-it';

export {};
