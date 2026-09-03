# Understand Anything — keep this

Interactive knowledge-graph view of this repo. **Keep it.** It is a working reference for project management, interactive whiteboards, and concept mapping — the same family of problems as Maps, Universe, Graph, and blocker pipes.

Plugin: [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) v2.9.4.  
Committed graph: [`.ua/knowledge-graph.json`](../.ua/knowledge-graph.json).

This is **not** a production Tasks Hub surface. Do not vendor the plugin into the SPA or make the live site depend on it. It is a local / agent tool and a design seed for hub graph work.

## Why it is useful here

| UA idea | Tasks Hub cousin | Steal this |
|---------|------------------|------------|
| Force graph + click-for-summary | Graph rail, Universe | Node selected → plain-English role, not just a label |
| Layers (shell, domain, views, API) | Board columns, map lines | Colour/group by *job*, not by file type |
| Guided tour (boot → gate → store → Clare) | Excursions, Maps View mode | Ordered walkthrough of a system, not a dump of nodes |
| Search by name *and* meaning | Hub search, map switcher | “Clare dump” finds digest + judge + Function |
| Edges with types (imports, documents, configures) | Blocker pipes, map links | Typed relationships beat undifferentiated lines |
| Incremental fingerprints | In-place board refresh | Re-analyse only what changed |

Use it when designing or explaining:

- **Project management** — how a change in `src/domain/` ripples into views and Functions
- **Interactive whiteboards** — a canvas you can pan, search, and inspect without leaving the picture
- **Concept mapping** — domains, flows, and “what belongs together” as a graph, not a folder tree

## Open the dashboard

Graph must already exist at `.ua/knowledge-graph.json` (it does, on this branch). Node 18+.

```bash
npm run understand:dashboard
```

That runs the released viewer against this repo. The terminal prints a tokenized URL (`http://127.0.0.1:5173/?token=…`). The token is required.

Cursor / Claude: install the plugin, then `/understand-dashboard`.

To rebuild or refresh after large code moves:

```text
/understand
```

Incremental by default (`.ua/fingerprints.json`). Use `/understand --full` only for a clean rebuild.

## What is committed

| Path | Keep? | Role |
|------|-------|------|
| `.ua/knowledge-graph.json` | yes | Nodes, edges, 10 layers, 10-step tour |
| `.ua/fingerprints.json` | yes | Incremental update baseline |
| `.ua/meta.json` | yes | Last analyse time + file count |
| `.ua/.understandignore` | yes | Excludes `design-kit/`, `tests/`, `fixtures/` |
| `.ua/config.json` | yes | `outputLanguage: en` |
| `.ua/intermediate/` | no | Scratch; gitignored |
| `.ua/.trash-*` | no | Scratch; gitignored |

First graph (2026-08-29): 250 files, 1,286 nodes, 2,623 edges, 0 validator issues.

## Layers in this graph

App Shell → Client Data & API → Domain Logic → Schemas → Views & Visualization → Page Blocks & Lesson Canvas → AI Judges → Netlify Functions → Tooling & Deploy → Documentation.

Tour starts at README / `AGENTS.md`, then `src/app/main.ts`, the sign-in gate, the client store, task schemas, Board/Calendar, Clare, Network Look with judgment, Maps/Universe/pipes, then production Functions.

## Product rule

Hub runtime stays git remotes + Cloudflare / Netlify. This graph is git. Do not require iCloud, `~/Documents`, or a local Understand-Anything checkout for the live site to work.
