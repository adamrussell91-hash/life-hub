import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

function markdownAsString(): Plugin {
  return {
    name: "markdown-as-string",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0] ?? id;
      if (!file.endsWith(".md")) return;
      return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
    },
  };
}

export default defineConfig(async ({ command }) => {
  const plugins: Plugin[] = [markdownAsString()];
  if (command === "serve") {
    const { localDataPlugin } = await import("./vite.localData");
    plugins.push(localDataPlugin());
  }
  return {
    base: process.env.UMBRELLA_SPA === "1" ? "/knowledge/" : "/",
    plugins,
    server: {
      watch: { ignored: ["**/migrated/**"] },
    },
    test: {
      environment: "node",
      pool: "forks",
      maxWorkers: 1,
      include: ["src/**/*.test.ts", "netlify/**/*.test.ts", "tests/integration/**/*.test.ts", "scripts/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/migrated/**"],
    },
  };
});
