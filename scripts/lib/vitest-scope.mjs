/**
 * Which changed files make pre-pr-check run a hub's whole vitest suite.
 *
 * Otherwise the gate runs `vitest run --changed <base>`, which follows
 * imports, so a file tests import is already covered. These lists are only
 * for files tests read with fs or vite config, which the import graph cannot
 * see. A `packages/` file tests import (most of them) is not listed.
 */

// Tests read these with fs or vite config rather than imports, so vitest's
// import graph cannot see them. Touching one runs the whole suite.
export const TASKS_FULL_SUITE_TRIGGERS = [
  /grove/i,
  /^apps\/tasks\/(fixtures|tests\/helpers)\//,
  /^apps\/tasks\/(package(-lock)?\.json|vite\.config\.ts|tsconfig[^/]*\.json)$/,
  // Render and chrome tests read package CSS as text (problem-solver.css,
  // design-kit/*.css through the apps/tasks/design-kit symlink).
  /^packages\/.*\.css$/,
  // day-dial-face-bar and overlay-chat-form read these as source text.
  /^packages\/design-kit\/js\/(visual-viewport|calendar\/render-day-dial)\.js$/,
  /^scripts\/pre-pr-check\.mjs$/,
  /^scripts\/lib\/vitest-scope\.mjs$/,
  /^\.github\/workflows\//
];

// Teaching tests read these with fs or vite config (the text baseline, the
// storage shim, seed fixtures), so vitest's import graph cannot see them.
// They read no `packages/` file from disk; the ones they use are imported.
export const TEACHING_FULL_SUITE_TRIGGERS = [
  /^apps\/teaching\/(fixtures|tests\/setup|tests\/unit\/__baselines__)\//,
  /^apps\/teaching\/(package(-lock)?\.json|vite\.config\.ts|tsconfig[^/]*\.json)$/,
  /^scripts\/pre-pr-check\.mjs$/,
  /^scripts\/lib\/vitest-scope\.mjs$/,
  /^\.github\/workflows\//
];

/**
 * @param {string[]} changed repo-relative paths
 * @param {RegExp[]} triggers
 * @returns {string | undefined} the first file that needs the whole suite
 */
export function fullSuiteTrigger(changed, triggers) {
  return changed.find((file) => triggers.some((re) => re.test(file)));
}
