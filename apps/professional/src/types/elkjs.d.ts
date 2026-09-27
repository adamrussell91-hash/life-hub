declare module 'elkjs/lib/elk.bundled.js' {
  export default class ELK {
    layout(graph: unknown): Promise<{
      children?: unknown[];
      edges?: unknown[];
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    }>;
  }
}
