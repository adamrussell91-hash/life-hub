import { stack } from './vendor/d3-shape.min.js';
import { sankey } from './vendor/d3-sankey.min.js';
import { chord } from './vendor/d3-chord.min.js';
import { forceSimulation } from './vendor/d3-force.min.js';

export { stack, sankey, chord, forceSimulation };

export function d3api() {
  return { stack, sankey, chord, forceSimulation };
}
