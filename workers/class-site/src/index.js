import { handleClassSiteRequest } from '../routes.mjs';

export default {
  async fetch(request) {
    return handleClassSiteRequest(request);
  }
};
