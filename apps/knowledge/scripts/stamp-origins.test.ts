import { describe, expect, it } from "vitest";
import type { Page } from "../src/domain/page";
import {
  applyStampedOrigins,
  extraOriginEntries,
  originKindCounts,
  parseStampArgs,
  stampOrigins,
  syncManifestOrigins,
} from "./stamp-origins";
import { installUnitDegreeMap } from "../src/origin/unitDegrees";
import { TEST_UNIT_DEGREES } from "../src/origin/unitDegrees.fixture";
import { installOriginLabelRules } from "../src/origin/normalize";
import { installNotesPlace } from "../src/origin/notesPlace";
import { TEST_NOTES_PLACE } from "../src/origin/notesPlace.fixture";

installNotesPlace(TEST_NOTES_PLACE);

installUnitDegreeMap(TEST_UNIT_DEGREES);
installOriginLabelRules({
  aliases: { "Sample Leadership Certificate": "Graduate Certificate in Sample Leadership" },
  dropped: ["Graduate Diploma of Sample"],
});

const page = (overrides: Partial<Page> = {}): Page => ({
  id: "page_notion_abc",
  title: "Lecture",
  area: "notes",
  tags: ["Note", "SMPL5805"],
  body: "Degree: MEd\n\nBody.",
  connected: [],
  attachments: [],
  source_notion_id: "d0000000000000000000000000000004",
  source_notion_url: "https://notion.so/d0000000000000000000000000000004",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

describe("stamp origins", () => {
  it("parses CLI flags", () => {
    expect(parseStampArgs(["--data-dir", "data-repo", "--from-notion", "--execute", "--count", "20"])).toEqual({
      dataDir: "data-repo",
      fromNotion: true,
      execute: true,
      count: 20,
    });
  });

  it("stamps notebook, book, and PD from the installed Notion place map", () => {
    expect(
      applyStampedOrigins(
        page({
          tags: ["Note"],
          body: "Lecture.",
          source_notion_id: "b0000000000000000000000000000002",
        }),
      )?.origins,
    ).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(
      applyStampedOrigins(
        page({
          id: "page_notion_b0000000000000000000000000000002",
          tags: ["Note"],
          body: "Lecture.",
          source_notion_id: "page_notion_b0000000000000000000000000000002",
        }),
      )?.origins,
    ).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("counts how many pages carry each origin kind", () => {
    expect(
      originKindCounts([
        { origins: [{ kind: "notebook", label: "Literacy" }, { kind: "book", label: "Example Book" }] },
        { origins: [{ kind: "notebook", label: "Literacy" }] },
        { origins: [{ kind: "unit", label: "SMPL5805" }] },
      ]),
    ).toEqual({ degree: 0, unit: 1, notebook: 2, book: 1, pd: 0 });
  });

  it("stamps degree and unit from body and tags without Notion", () => {
    expect(applyStampedOrigins(page())?.origins).toEqual([
      { kind: "degree", label: "Master of Sample Studies" },
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "SMPL5805" },
    ]);
  });

  it("renames an aliased certificate and does not restore a dropped programme", () => {
    expect(
      applyStampedOrigins(
        page({
          tags: ["SMPL6119"],
          body: "Lecture.",
          origins: [
            { kind: "degree", label: "Sample Leadership Certificate" },
            { kind: "degree", label: "Graduate Diploma of Sample" },
            { kind: "unit", label: "SMPL6119" },
          ],
        }),
      )?.origins,
    ).toEqual([
      { kind: "degree", label: "Graduate Certificate in Sample Leadership" },
      { kind: "unit", label: "SMPL6119" },
    ]);
  });

  it("copies existing page pills onto a list row that never got them", () => {
    const ready = page({
      id: "page_notion_a0000000000000000000000000000001",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    expect(
      syncManifestOrigins(
        [{ id: ready.id, title: ready.title, area: ready.area, tags: ready.tags, excerpt: "Lecture." }],
        [ready],
      )[0]?.origins,
    ).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("backfills created_at from the page file onto a list row that never got it", () => {
    const ready = page({
      id: "page_notion_a0000000000000000000000000000001",
      created_at: "2025-06-12T00:00:00.000Z",
    });
    expect(
      syncManifestOrigins(
        [{ id: ready.id, title: ready.title, area: ready.area, tags: ready.tags, excerpt: "Lecture." }],
        [ready],
      )[0]?.created_at,
    ).toBe("2025-06-12T00:00:00.000Z");
  });

  it("copies tidied topic tags from the page file onto a stale list row", () => {
    const ready = page({
      id: "page_notion_a0000000000000000000000000000001",
      tags: ["Note", "Learning Science and Cognition"],
      body: "A cleaned lecture body.",
    });
    expect(
      syncManifestOrigins(
        [{ id: ready.id, title: "Old", area: ready.area, tags: ["Educational Psychology"], excerpt: "Old." }],
        [ready],
      )[0],
    ).toMatchObject({
      title: "Lecture",
      tags: ["Note", "Learning Science and Cognition"],
      excerpt: "A cleaned lecture body.",
    });
  });

  it("appends notebook pages that exist as files but never reached the list", () => {
    const ready = page({
      id: "page_notion_a0000000000000000000000000000001",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    const extra = extraOriginEntries(
      [{ id: "page_notion_live", title: "Live", area: "notes", tags: ["Note"], excerpt: "On the list." }],
      [ready],
    );
    expect(extra).toHaveLength(1);
    expect(extra[0]?.id).toBe(ready.id);
    expect(extra[0]?.origins).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("matches a list row whose id is a dashed Notion UUID", () => {
    const ready = page({
      id: "page_notion_a0000000000000000000000000000001",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    expect(
      syncManifestOrigins(
        [
          {
            id: "a0000000-0000-0000-0000-000000000001",
            title: ready.title,
            area: ready.area,
            tags: ready.tags,
            excerpt: "Lecture.",
          },
        ],
        [ready],
      )[0]?.origins,
    ).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("leaves a page unchanged when origins are already complete", () => {
    expect(
      applyStampedOrigins(
        page({
          origins: [
            { kind: "degree", label: "Master of Sample Studies" },
            { kind: "degree", label: "MEd" },
            { kind: "unit", label: "SMPL5805" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("merges Notion properties when asked", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        properties: {
          Notebook: { type: "select", select: { name: "Brown 2022" } },
        },
      }),
    })) as unknown as typeof fetch;
    const changed = await stampOrigins({
      pages: [page()],
      fromNotion: true,
      token: "secret",
      fetchImpl,
    });
    expect(changed[0]?.origins).toEqual([
      { kind: "degree", label: "Master of Sample Studies" },
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Brown 2022" },
      { kind: "unit", label: "SMPL5805" },
    ]);
  });
});
