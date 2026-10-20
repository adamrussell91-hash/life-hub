#!/usr/bin/env node
/**
 * Teaching's block styles, lifted out of apps/teaching/src/styles/app.css for
 * the hubs that run Teaching's block engine (Tasks, Professional).
 *
 * A selector is kept when it names a block-engine class; Teaching's shell
 * rules (rail, class pages, home) are left behind. @media / @supports wrappers
 * come along with the rules inside them, and @keyframes come along when a
 * kept rule animates with them. Teaching itself still loads app.css whole.
 *
 *   node scripts/generate-block-css.mjs          write packages/block-styles/blocks.css
 *   node scripts/generate-block-css.mjs --check  exit 1 when the file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'apps/teaching/src/styles/app.css';
export const OUTPUT = 'packages/block-styles/blocks.css';

/** Class names the block engine renders (BEM element / modifier suffixes stripped). */
const ENGINE_CLASS =
  /^(block|block-[a-z0-9-]+|lesson-page|lesson-palette|palette-card|callout(-[a-z0-9-]+)?|media-library-picker|annotation-[a-z0-9-]+)$/;

function isEngineSelector(selector) {
  for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    if (ENGINE_CLASS.test(match[1].split(/__|--/)[0])) return true;
  }
  return false;
}

function keyframeNames(value) {
  return value.split(/[\s,]+/).filter((word) => /^[a-z][\w-]*$/i.test(word));
}

/** Keeps engine rules in `container`; returns the animation names they use. */
function prune(container, animations) {
  container.each((node) => {
    if (node.type === 'comment') {
      node.remove();
    } else if (node.type === 'rule') {
      const kept = node.selectors.filter(isEngineSelector);
      if (kept.length === 0) {
        node.remove();
        return;
      }
      node.selectors = kept;
      node.walkDecls(/^animation(-name)?$/, (decl) => {
        for (const name of keyframeNames(decl.value)) animations.add(name);
      });
    } else if (node.type === 'atrule') {
      if (/keyframes$/.test(node.name)) return;
      if (['media', 'supports', 'container', 'layer'].includes(node.name) && node.nodes) {
        prune(node, animations);
        if (node.nodes.length === 0) node.remove();
        return;
      }
      node.remove();
    } else {
      node.remove();
    }
  });
}

export function buildBlockCss(css = readFileSync(join(root, SOURCE), 'utf8')) {
  const ast = postcss.parse(css);
  const animations = new Set();
  prune(ast, animations);
  ast.walkAtRules(/keyframes$/, (rule) => {
    if (!animations.has(rule.params.trim())) rule.remove();
  });
  ast.raws.after = '\n';
  const header =
    `/* Generated from ${SOURCE} by scripts/generate-block-css.mjs. Do not edit:\n` +
    ' * change the block styles in Teaching, then rerun the script. */\n';
  return header + ast.toString().replace(/^\s+/, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = buildBlockCss();
  const target = join(root, OUTPUT);
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {}
    if (current !== next) {
      console.error(`${OUTPUT} is stale: run node scripts/generate-block-css.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(target, next);
    console.log(`wrote ${OUTPUT}`);
  }
}
