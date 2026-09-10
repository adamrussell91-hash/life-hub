import { createKnowledgePodcastHandler } from './knowledge-podcast.mjs';

export const config = { path: '/api/knowledge/podcast/*', timeout: 26 };

export function createKnowledgePodcastPathHandler(deps = {}) {
  return createKnowledgePodcastHandler(deps);
}

export default createKnowledgePodcastPathHandler();
