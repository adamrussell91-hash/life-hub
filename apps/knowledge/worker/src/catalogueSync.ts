import { embedTexts } from "../../src/lib/embed";
import { runCatalogueSync, type CatalogueStore } from "../../src/research/catalogueSync";

/** While a backlog remains, the next batch runs this soon after the last. */
const CONTINUE_DELAY_MS = 60_000;

export interface CatalogueSyncEnv {
  ARCHIVE: CatalogueStore;
  GITHUB_DATA_REPO?: string;
  GITHUB_DATA_REPO_TOKEN?: string;
  EMBEDDINGS_API_KEY?: string;
}

/**
 * Keeps the research catalogue in R2 in step with the knowledge data repo.
 * The hourly cron only pokes this object; the work runs in its alarm, which
 * has a Durable Object's time budget rather than a free-plan cron's 10 ms.
 * One alarm handles one batch, then re-arms itself until the queue is empty.
 */
export class CatalogueSync {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: CatalogueSyncEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ error: "Not found" }, { status: 404 });
    await this.ctx.storage.setAlarm(Date.now());
    return Response.json({ queued: true });
  }

  async alarm() {
    const { GITHUB_DATA_REPO: repo, GITHUB_DATA_REPO_TOKEN: token, EMBEDDINGS_API_KEY: key } = this.env;
    if (!repo || !token) return;
    try {
      const { state } = await runCatalogueSync({
        store: this.env.ARCHIVE,
        repo,
        token,
        embed: key ? texts => embedTexts(texts, key, { retries: 1 }) : null,
      });
      if (state.pending.length) await this.ctx.storage.setAlarm(Date.now() + CONTINUE_DELAY_MS);
    } catch (error) {
      // The run already recorded lastError in R2; the next hourly poke retries.
      console.error("catalogue sync failed", error);
    }
  }
}
