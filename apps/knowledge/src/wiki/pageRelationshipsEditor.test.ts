/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chipsFromDualRead,
  hubRefFromEntityRef,
  mountPageRelationshipsEditor,
  relationshipErrorMessage,
} from "./pageRelationshipsEditor";
import { KnowledgeApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    searchPages: vi.fn(async () => [
      { id: "page_beta", title: "Beta note", area: "notes", tags: [], excerpt: "" },
    ]),
  };
});

describe("pageRelationshipsEditor", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("maps entity refs to HubRef storage forms", () => {
    expect(hubRefFromEntityRef("knowledge:page:page_alpha")).toBe("page_alpha");
    expect(hubRefFromEntityRef("teaching:unit:unit_x")).toBe("teaching:unit:unit_x");
    expect(hubRefFromEntityRef("shared:person:person_x")).toBeNull();
  });

  it("seeds chips from dual-read relationships and surfaces unavailable", () => {
    const ready = chipsFromDualRead({
      pageId: "page_alpha",
      relationships: [
        {
          legacy_hub_ref: "page_beta",
          target_ref: "knowledge:page:page_beta",
          link_id: "ul_1",
        },
      ],
      entries: [{ id: "page_beta", title: "Beta note" }],
    });
    expect(ready.status).toBe("ready");
    expect(ready.chips).toHaveLength(1);
    expect(ready.chips[0]?.hubRef).toBe("page_beta");
    expect(ready.chips[0]?.label).toBe("Beta note");

    const unavailable = chipsFromDualRead({
      pageId: "page_alpha",
      relationshipsStatus: "unavailable",
      legacyConnected: ["page_stale"],
    });
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.chips).toEqual([]);
  });

  it("lets the user add pending chips and save the desired HubRef set", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onSave = vi.fn();
    const onChange = vi.fn();
    const handle = mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [
        {
          id: "saved:page_gamma",
          hubRef: "page_gamma",
          entityRef: "knowledge:page:page_gamma",
          label: "Gamma",
          state: "saved",
        },
      ],
      status: "ready",
      message: "",
      entries: [
        { id: "page_beta", title: "Beta note" },
        { id: "page_gamma", title: "Gamma" },
      ],
      onChange,
      onSave,
      onRetryLoad: () => undefined,
    });

    expect(host.textContent).toMatch(/Related pages/);
    expect(host.textContent).toMatch(/Save relationships/);
    expect(handle.getDesiredHubRefs()).toEqual(["page_gamma"]);

    const input = host.querySelector<HTMLInputElement>(".compose__relationship-picker");
    expect(input).toBeTruthy();
    input!.value = "@Be";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      const option = [...host.querySelectorAll("button")].find(btn =>
        btn.textContent?.includes("Beta note"),
      );
      expect(option).toBeTruthy();
      option!.click();
    });

    expect(handle.getDesiredHubRefs()).toEqual(["page_gamma", "page_beta"]);
    expect(onChange).toHaveBeenCalled();

    const save = host.querySelector<HTMLButtonElement>("[data-relationship-save]");
    save!.click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("marks saved chip removal as pending until Save relationships", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [
        {
          id: "saved:page_gamma",
          hubRef: "page_gamma",
          entityRef: "knowledge:page:page_gamma",
          label: "Gamma",
          state: "saved",
        },
      ],
      status: "ready",
      message: "",
      entries: [],
      onChange: () => undefined,
      onSave: () => undefined,
      onRetryLoad: () => undefined,
    });

    const remove = host.querySelector<HTMLButtonElement>(".entity-chip__action--end");
    expect(remove).toBeTruthy();
    remove!.click();
    expect(handle.getDesiredHubRefs()).toEqual([]);
    expect(host.textContent).toMatch(/marked for removal/i);
  });

  it("maps incomplete and unavailable API failures for retry UI", () => {
    expect(
      relationshipErrorMessage(
        new KnowledgeApiError({
          message: "incomplete",
          code: "knowledge_relationship_operation_incomplete",
          status: 409,
          retryable: true,
        }),
      ).status,
    ).toBe("incomplete");
    expect(
      relationshipErrorMessage(
        new KnowledgeApiError({
          message: "down",
          code: "knowledge_ul_unavailable",
          status: 503,
          retryable: true,
        }),
      ).status,
    ).toBe("unavailable");
  });
});
