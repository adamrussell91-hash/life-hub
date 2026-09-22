/**
 * Swimlane flowchart used by Tasks Branch.
 * Geometry + orthogonal stubs. ELK or a Sugiyama pass supplies x/y.
 */
import { fx, node, text } from './scene.js';

export function orthogonalPath(x0, y0, x1, y1) {
  const mid = (x0 + x1) / 2;
  return `M${fx(x0)} ${fx(y0)} L${fx(mid)} ${fx(y0)} L${fx(mid)} ${fx(y1)} L${fx(x1)} ${fx(y1)}`;
}

export function buildFlowchartLanes(input, { width = 960, height = 640 } = {}) {
  const lanes = input.lanes ?? [];
  const boxes = input.boxes ?? [];
  const edges = input.edges ?? [];
  const nodes = [];
  lanes.forEach((lane, i) => {
    nodes.push(
      node('rect', {
        x: fx(lane.x),
        y: fx(lane.y),
        width: fx(lane.width),
        height: fx(lane.height),
        rx: 16
      }, { cls: 'fl-lane', delay: i * 40, anim: 'fade' })
    );
    nodes.push(text(lane.x + 16, lane.y + 22, lane.label, { size: 12, weight: 600, cls: 'fl-lane__label' }));
  });
  for (const edge of edges) {
    nodes.push(
      node('path', { d: edge.d || orthogonalPath(edge.x0, edge.y0, edge.x1, edge.y1), fill: 'none' }, {
        cls: `fl-edge${edge.critical ? ' fl-edge--critical' : ''}${edge.suggested ? ' fl-edge--suggested' : ''}`,
        anim: 'draw',
        delay: edge.delay ?? 120
      })
    );
  }
  boxes.forEach((box, i) => {
    nodes.push(
      node('g', { transform: `translate(${fx(box.x)} ${fx(box.y)})` }, {
        cls: `fl-box fl-box--${box.state ?? 'open'}`,
        hit: box.id,
        anim: 'fade',
        delay: (box.column ?? 0) * 40,
        children: [
          node('rect', { width: fx(box.width), height: fx(box.height), rx: 0 }, { cls: 'fl-box__shape' }),
          node('rect', { width: 4, height: fx(box.height) }, { cls: `fl-box__stripe fl-box__stripe--${box.state ?? 'open'}` }),
          text(14, 18, box.title, { size: 12, weight: 600, cls: 'fl-box__title' }),
          text(14, 34, box.subtitle ?? '', { size: 11, cls: 'fl-box__sub' })
        ]
      })
    );
    void i;
  });
  return { width, height, label: input.label ?? 'Flowchart', nodes, hits: boxes.map((b) => ({ id: b.id, title: b.title })) };
}
