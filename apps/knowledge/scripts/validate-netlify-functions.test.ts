import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Since the September consolidation the Knowledge API is the umbrella's:
// root netlify.toml, netlify/functions/knowledge-*.mjs and their
// netlify/functions/_shared/knowledge-*.mjs helpers, deployed with the rest of
// Life Hub. The standalone repo's netlify.toml, netlify/handlers and
// .github/workflows did not come across, so these checks read the umbrella.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");

describe("Netlify function layout", () => {
  it("keeps deployable handlers separate from private helpers", async () => {
    const config = await read("netlify.toml");
    expect(config).toContain('directory = "netlify/functions"');
    const entries = await readdir(path.join(root, "netlify/functions"));
    const knowledge = entries.filter(entry => entry.startsWith("knowledge-"));
    expect(knowledge).toContain("knowledge-clementine-chat.mjs");
    expect(knowledge).toContain("knowledge-tidy.mjs");
    // Helpers live under _shared/, which Netlify does not deploy as a function.
    const shared = await readdir(path.join(root, "netlify/functions/_shared"));
    expect(shared).toContain("knowledge-data.mjs");
    expect(shared.some(entry => /^index\./.test(entry) || entry === "_shared.mjs")).toBe(false);
    for (const handler of knowledge) {
      const source = await read(`netlify/functions/${handler}`);
      expect(source, handler).toMatch(/export const config = \{[\s\S]*?path: '\/api\/knowledge\//);
    }
  });

  it("publishes a placeholder, not the Vite app (site is GitHub Pages)", async () => {
    const config = await read("netlify.toml");
    const build = config.split("[functions]")[0] ?? config;
    expect(build).toContain('publish = "netlify/public"');
    expect(build).not.toMatch(/publish = "dist"/);
    expect(build).toContain("SECRETS_SCAN_OMIT_KEYS");
    expect(build).toContain("R2_BUCKET");
  });
});

describe("GitHub Pages deploy", () => {
  it("deploys the Knowledge SPA in the umbrella's dist, calling the umbrella API host", async () => {
    const workflow = await read(".github/workflows/pages.yml");
    expect(workflow).toContain("actions/deploy-pages");
    expect(workflow).toContain("npm run build");
    expect(workflow).not.toContain("knowledge-api.adam-russell.com");
    const scripts = JSON.parse(await read("package.json")).scripts as Record<string, string>;
    expect(scripts["build:apps"]).toContain("build:knowledge");
    // No VITE_API_BASE is set in the workflow, so the SPA falls back to this.
    const apiConfig = await read("apps/knowledge/src/api/config.ts");
    expect(apiConfig).toContain('"https://api.adam-russell.com/api/knowledge"');
  });
});

describe("Clementine chat has a long enough function window", () => {
  it("gives clementine-chat the 26s Netlify max so archive + Claude are not killed at 10s", async () => {
    const config = await read("netlify.toml");
    expect(config).toMatch(/\[functions\.knowledge-clementine-chat\]\s*timeout = 26/);
    const source = await read("netlify/functions/knowledge-clementine-chat.mjs");
    expect(source).toMatch(/path: '\/api\/knowledge\/clementine-chat',\s*timeout: 26/);
  });

  it("hands From a book web search to the Worker write DO outside the 26s Netlify cap", async () => {
    const config = await read("netlify.toml");
    expect(config).not.toMatch(/clementine-book-write/);
    const handlers = await readdir(path.join(root, "netlify/functions"));
    expect(handlers.some(entry => entry.includes("book-write"))).toBe(false);
    const source = await read("netlify/functions/knowledge-clementine-chat.mjs");
    expect(source).toContain("knowledgeKernelFetch('/chat/write/start'");
    expect(source).not.toContain("chatWriteStore");
    expect(source).not.toContain("clementine-book-write");
  });
});

describe("Note tidy button uses the session API host", () => {
  it("adds a session-gated /api/knowledge/tidy function without new Netlify secrets", async () => {
    const config = await read("netlify.toml");
    expect(config).toMatch(/\[functions\.knowledge-tidy\]\s*timeout = 26/);
    expect(config).toContain('"config/knowledge/**"');
    await read("config/knowledge/tidy.md");
    const source = await read("netlify/functions/knowledge-tidy.mjs");
    expect(source).toContain("path: '/api/knowledge/tidy'");
    expect(source).toContain("createSessionOriginHandler");
    expect(source).toContain("knowledgeDataToken");
    expect(source).not.toMatch(/VITE_/);
    const intake = await read("netlify/functions/_shared/knowledge-intake.mjs");
    expect(intake).toContain("loadKnowledgePrompt('tidy.md'");
  });
});

describe("Umbrella workflow secrets", () => {
  it("does not use custom GITHUB_-prefixed secret names (GitHub rejects them)", async () => {
    const dir = path.join(root, ".github/workflows");
    for (const name of await readdir(dir)) {
      const workflow = await readFile(path.join(dir, name), "utf8");
      const custom = [...workflow.matchAll(/secrets\.(GITHUB_[A-Z0-9_]+)/g)]
        .map(match => match[1])
        .filter(secret => secret !== "GITHUB_TOKEN");
      expect(custom, name).toEqual([]);
    }
  });
});

describe("Knowledge data-repo writes", () => {
  it("writes page tags and origin pills onto the live list with the same data-repo token as tidy", async () => {
    const data = await read("netlify/functions/_shared/knowledge-data.mjs");
    // One token for every data-repo read and write: tidy, saves, manifest upserts.
    expect(data).toContain("export const KNOWLEDGE_DATA_TOKEN_ENV = 'GITHUB_TOKEN';");
    expect(data).toMatch(/export async function putKnowledgeContent[\s\S]*?requireBoundRepo\(env\)/);
    // saveKnowledgePage copies tags and origins onto the manifest row it upserts.
    const save = data.slice(data.indexOf("export async function saveKnowledgePage"));
    expect(save).toMatch(/tags: stored\.tags/);
    expect(save).toMatch(/origins: stored\.origins/);
    expect(save).toContain("putWithRetry('manifest.json'");
    // Tidy saves through that same function.
    const intake = await read("netlify/functions/_shared/knowledge-intake.mjs");
    expect(intake).toContain("saveKnowledgePage");
  });
});
