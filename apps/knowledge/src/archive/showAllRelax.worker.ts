/// <reference lib="webworker" />
import { relaxNeural, type RelaxReply, type RelaxRequest } from "./showAllRelax";

self.onmessage = (event: MessageEvent<RelaxRequest>) => {
  const { token, nodes, links, shape } = event.data;
  const positions = relaxNeural(nodes, links, shape);
  const reply: RelaxReply = { token, positions };
  (self as unknown as Worker).postMessage(reply, [positions.buffer]);
};
