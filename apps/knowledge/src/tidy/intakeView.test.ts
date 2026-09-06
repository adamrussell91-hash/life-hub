import { describe, expect, it } from "vitest";
import { intakeBusyLabel, intakeReviewHtml } from "./intakeView";

describe("intakeReviewHtml", () => {
  it("renders the proposed write and confirm actions", () => {
    const html = intakeReviewHtml({
      id: "ai_job_1",
      kind: "knowledge_intake",
      page_id: "note-1",
      status: "done",
      phase: "awaiting_review",
      proposal: {
        title: "Working memory",
        tags: ["Learning Science and Cognition"],
        body: "Miller seven plus or minus two."
      }
    });
    expect(html).toContain("data-intake-review");
    expect(html).toContain("confirm-card");
    expect(html).toContain("Review clean up");
    expect(html).toContain("Working memory");
    expect(html).toContain("Learning Science and Cognition");
    expect(html).toContain("data-tidy-confirm");
    expect(html).toContain("data-tidy-discard");
  });
});

describe("intakeBusyLabel", () => {
  it("names the live stage", () => {
    expect(intakeBusyLabel("extracting")).toBe("Extracting…");
    expect(intakeBusyLabel("classifying")).toBe("Classifying…");
    expect(intakeBusyLabel("queued")).toBe("Queued…");
  });
});
