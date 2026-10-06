/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterWikiRail, renderWikiRail } from "./rail";

const review = vi.fn();

vi.mock("../api/wikiClient", async () => {
  const actual = await vi.importActual<typeof import("../api/wikiClient")>("../api/wikiClient");
  return {
    ...actual,
    USE_LOCAL_DATA: false,
    listCuratorReview: (...args: unknown[]) => review(...args),
    listCuratorPending: async () => (await review()).pending,
    curatorAction: vi.fn(),
  };
});

function hostFor() {
  const app = document.createElement("div");
  document.body.appendChild(app);
  const host = {
    app,
    shell: (main: string) => {
      app.innerHTML = main;
    },
    render: vi.fn(),
  };
  return host;
}

async function paint() {
  const host = hostFor();
  renderWikiRail(host);
  await vi.waitFor(() => expect(host.render).toHaveBeenCalled());
  renderWikiRail(host);
  return host;
}

describe("renderWikiRail", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    enterWikiRail();
    review.mockReset();
    review.mockResolvedValue({
      pending: [
        {
          id: "a||b",
          noteA: "a",
          noteB: "b",
          titleA: "Duty",
          titleB: "Heaney",
          excerptA: "inherited",
          excerptB: "the poem",
          relation: "related",
          rationale: "same thread",
          proposedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      autoApproved: [],
    });
  });

  it("renders the review queue chrome and loads pending cards", async () => {
    const host = await paint();
    expect(host.app.innerHTML).toContain("Wiki");
    expect(host.app.innerHTML).toContain("Run now");
    expect(host.app.innerHTML).toContain("Duty");
    expect(host.app.innerHTML).toContain("Approve");
    expect(host.app.innerHTML).toContain("Dismiss");
    expect(host.app.innerHTML).toContain("Nothing auto-approved yet.");
    expect(host.app.innerHTML).not.toContain("%");
  });

  it("shows a percent and cross-book labels only when the data has them", async () => {
    review.mockResolvedValue({
      pending: [
        {
          id: "low||mid",
          noteA: "low",
          noteB: "mid",
          titleA: "A very long note title that has to stay on the card at a phone width without being clipped away",
          titleB: "Habits",
          excerptA: "loose overlap",
          excerptB: "practice",
          relation: "builds-on",
          rationale: "same topic",
          proposedAt: "2026-10-03T00:00:00.000Z",
          confidence: 0.2,
          bookA: "The Neural Mind",
          bookB: "Atomic Habits",
        },
        {
          id: "bare||other",
          noteA: "bare",
          noteB: "other",
          titleA: "Unscored",
          titleB: "Also unscored",
          excerptA: "a",
          excerptB: "b",
          relation: "contrasts-with",
          rationale: "old row",
          proposedAt: "2026-10-01T00:00:00.000Z",
        },
        {
          id: "high||mid",
          noteA: "high",
          noteB: "mid",
          titleA: "High",
          titleB: "Mid",
          excerptA: "a",
          excerptB: "b",
          relation: "related",
          rationale: "closer",
          proposedAt: "2026-10-02T00:00:00.000Z",
          confidence: 0.72,
        },
      ],
      autoApproved: [
        {
          noteA: "note-a",
          noteB: "note-b",
          titleA: "Basal ganglia",
          titleB: "Habits",
          bookA: "The Neural Mind",
          bookB: "Atomic Habits",
          relation: "builds-on",
          rationale: "striatum",
          confidence: 0.91,
          approvedAt: "2026-10-03T00:00:00.000Z",
        },
      ],
    });
    const host = await paint();
    const html = host.app.innerHTML;
    expect(html).toContain("builds-on · 20%");
    expect(html).toContain("Cross-book");
    expect(html).toContain("The Neural Mind");
    expect(html).toContain("Atomic Habits");
    expect(html).toContain("related · 72%");
    expect(html).not.toContain("contrasts-with ·");
    expect(html.indexOf("related · 72%")).toBeLessThan(html.indexOf("builds-on · 20%"));
    expect(html.indexOf("builds-on · 20%")).toBeLessThan(html.indexOf("contrasts-with"));
    expect(html).toContain("Unlink");
    expect(html).toContain("A very long note title");
  });

  it("shows the server message when approve collides", async () => {
    const { curatorAction } = await import("../api/wikiClient");
    vi.mocked(curatorAction).mockRejectedValueOnce(new Error("save collided, try again"));
    const host = await paint();
    const calls = host.render.mock.calls.length;
    host.app.querySelector<HTMLButtonElement>("[data-wiki-approve]")?.click();
    await vi.waitFor(() => expect(host.render.mock.calls.length).toBeGreaterThan(calls + 1));
    renderWikiRail(host);
    expect(host.app.innerHTML).toContain("save collided, try again");
  });
});
