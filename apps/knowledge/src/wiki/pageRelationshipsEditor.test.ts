/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chipsFromDualRead,
  desiredHubRefsFromChips,
  hubRefFromEntityRef,
  mountPageRelationshipsEditor,
  relationshipErrorMessage,
  type RelatedChip,
} from "./pageRelationshipsEditor";
import { KnowledgeApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    searchPages: vi.fn(async () => [
      { id: "page_beta", title: "Beta note", area: "notes", tags: [], excerpt: "" },
    ]),
    searchRelatedEntities: vi.fn(async () => ({
      groups: {
        event: [
          {
            ref: "professional:event:event_warlight",
            kind: "event",
            display_label: "Warlight Professional Development",
            supporting_label: "professional development · completed",
            href: "/professional/#/event/event_warlight",
          },
        ],
      },
    })),
  };
});

function ownedOutgoing(hubRef: string, label: string, linkId = "ul_out"): RelatedChip {
  return {
    id: `saved:outgoing_owned:${hubRef}`,
    hubRef,
    entityRef: `knowledge:page:${hubRef}`,
    label,
    linkId,
    state: "saved",
    ownership: "outgoing_owned",
    sourceRef: "knowledge:page:page_alpha",
    targetRef: `knowledge:page:${hubRef}`,
  };
}

function incomingReadonly(hubRef: string, label: string, linkId = "ul_in"): RelatedChip {
  return {
    id: `saved:incoming_readonly:${hubRef}`,
    hubRef,
    entityRef: `knowledge:page:${hubRef}`,
    label,
    linkId,
    state: "saved",
    ownership: "incoming_readonly",
    sourceRef: `knowledge:page:${hubRef}`,
    targetRef: "knowledge:page:page_alpha",
  };
}

describe("pageRelationshipsEditor ownership", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("maps entity refs to HubRef storage forms", () => {
    expect(hubRefFromEntityRef("knowledge:page:page_alpha")).toBe("page_alpha");
    expect(hubRefFromEntityRef("teaching:unit:unit_x")).toBe("teaching:unit:unit_x");
    expect(hubRefFromEntityRef("shared:person:person_x")).toBeNull();
  });

  it("maps incoming Professional event/meeting/application refs, matching the registry's related_to targets", () => {
    expect(hubRefFromEntityRef("professional:event:event_x")).toBe("professional:event:event_x");
    expect(hubRefFromEntityRef("professional:meeting:meeting_x")).toBe("professional:meeting:meeting_x");
    expect(hubRefFromEntityRef("professional:application:application_x")).toBe(
      "professional:application:application_x",
    );
    expect(hubRefFromEntityRef("teaching:lesson:lesson_x")).toBe("teaching:lesson:lesson_x");
    expect(hubRefFromEntityRef("tasks:program:program_x")).toBe("tasks:program:program_x");
  });

  it("finds and attaches a Professional development event through the shared picker", async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement("div");
      document.body.append(host);
      const onChange = vi.fn();
      const handle = mountPageRelationshipsEditor({
        host,
        pageId: "page_alpha",
        chips: [],
        status: "ready",
        message: "",
        entries: [],
        onChange,
        onSave: () => undefined,
        onRetryLoad: () => undefined,
      });

      const input = host.querySelector<HTMLInputElement>(".compose__relationship-picker")!;
      input.value = "@War";
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);

      const eventOption = host.querySelector<HTMLButtonElement>(".entity-picker__option");
      expect(eventOption?.textContent).toContain("Warlight Professional Development");
      eventOption?.click();

      expect(handle.getDesiredHubRefs()).toEqual(["professional:event:event_warlight"]);
      expect(onChange).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks B→A as incoming readonly on page A and excludes it from replace payloads", () => {
    const ready = chipsFromDualRead({
      pageId: "page_alpha",
      relationships: [
        {
          source_ref: "knowledge:page:page_beta",
          target_ref: "knowledge:page:page_alpha",
          other_ref: "knowledge:page:page_beta",
          legacy_hub_ref: "page_beta",
          direction: "incoming",
          ownership: "incoming_readonly",
          link_id: "ul_ba",
          sources: ["canonical"],
        },
      ],
      entries: [{ id: "page_beta", title: "Beta note" }],
    });
    expect(ready.status).toBe("ready");
    expect(ready.chips).toHaveLength(1);
    expect(ready.chips[0]?.ownership).toBe("incoming_readonly");
    expect(ready.chips[0]?.hubRef).toBe("page_beta");
    expect(ready.chips[0]?.sourceRef).toBe("knowledge:page:page_beta");
    expect(ready.chips[0]?.targetRef).toBe("knowledge:page:page_alpha");
    expect(desiredHubRefsFromChips(ready.chips)).toEqual([]);
  });

  it("includes only outgoing owned refs when A has incoming and outgoing relationships", () => {
    const ready = chipsFromDualRead({
      pageId: "page_alpha",
      relationships: [
        {
          source_ref: "knowledge:page:page_alpha",
          target_ref: "knowledge:page:page_gamma",
          other_ref: "knowledge:page:page_gamma",
          legacy_hub_ref: "page_gamma",
          direction: "outgoing",
          ownership: "outgoing_owned",
          link_id: "ul_ag",
          sources: ["canonical"],
        },
        {
          source_ref: "knowledge:page:page_beta",
          target_ref: "knowledge:page:page_alpha",
          other_ref: "knowledge:page:page_beta",
          legacy_hub_ref: "page_beta",
          direction: "incoming",
          ownership: "incoming_readonly",
          link_id: "ul_ba",
          sources: ["canonical"],
        },
      ],
      entries: [
        { id: "page_beta", title: "Beta" },
        { id: "page_gamma", title: "Gamma" },
      ],
    });
    expect(ready.chips.map(chip => chip.ownership).sort()).toEqual([
      "incoming_readonly",
      "outgoing_owned",
    ]);
    expect(desiredHubRefsFromChips(ready.chips)).toEqual(["page_gamma"]);
  });

  it("resolves a Knowledge page href for chips built from dual-read rows", () => {
    const ready = chipsFromDualRead({
      pageId: "page_alpha",
      relationships: [
        {
          source_ref: "knowledge:page:page_alpha",
          target_ref: "knowledge:page:page_gamma",
          other_ref: "knowledge:page:page_gamma",
          legacy_hub_ref: "page_gamma",
          direction: "outgoing",
          ownership: "outgoing_owned",
          link_id: "ul_ag",
          sources: ["canonical"],
        },
      ],
      entries: [{ id: "page_gamma", title: "Gamma" }],
    });
    expect(ready.chips[0]?.href).toBe("/knowledge/#page/page_gamma");
  });

  it("passes the resolved href through to the rendered chip as a clickable link", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [ownedOutgoing("page_gamma", "Gamma")].map((chip) => ({
        ...chip,
        href: "/knowledge/#page/page_gamma",
      })),
      status: "ready",
      message: "",
      entries: [{ id: "page_gamma", title: "Gamma" }],
      onChange: () => undefined,
    });
    const link = host.querySelector<HTMLAnchorElement>(".entity-chip__label--link");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/knowledge/#page/page_gamma");
  });

  it("renders incoming chips as read-only without a remove action", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [incomingReadonly("page_beta", "Beta note")],
      status: "ready",
      message: "",
      entries: [{ id: "page_beta", title: "Beta note" }],
      onChange: () => undefined,
      onSave: () => undefined,
      onRetryLoad: () => undefined,
    });

    expect(host.textContent).toMatch(/Incoming · owned by Beta note/);
    expect(host.querySelector(".entity-chip--readonly")).toBeTruthy();
    expect(host.querySelector(".entity-chip__action--end")).toBeNull();
    expect(handle.getDesiredHubRefs()).toEqual([]);
  });

  it("saving without changes excludes incoming peers from the desired HubRef set", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onSave = vi.fn();
    const handle = mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [
        ownedOutgoing("page_gamma", "Gamma"),
        incomingReadonly("page_beta", "Beta"),
      ],
      status: "ready",
      message: "",
      entries: [
        { id: "page_beta", title: "Beta" },
        { id: "page_gamma", title: "Gamma" },
      ],
      onChange: () => undefined,
      onSave,
      onRetryLoad: () => undefined,
    });

    expect(handle.getDesiredHubRefs()).toEqual(["page_gamma"]);
    host.querySelector<HTMLButtonElement>("[data-relationship-save]")!.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(handle.getDesiredHubRefs()).toEqual(["page_gamma"]);
  });

  it("removing an owned outgoing chip drops it from the replace payload", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountPageRelationshipsEditor({
      host,
      pageId: "page_alpha",
      chips: [ownedOutgoing("page_gamma", "Gamma")],
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
    expect(host.textContent).toMatch(/removal/i);
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
