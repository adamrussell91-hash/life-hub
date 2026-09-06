const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const HUB_SITES = {
  teaching: "https://teaching-hub.adam-russell.com",
  tasks: "https://tasks-hub.adam-russell.com",
} as const;

export type HubRef =
  | { hub: "knowledge"; kind: "page"; id: string }
  | { hub: "teaching"; kind: "unit"; id: string }
  | { hub: "tasks"; kind: "project"; id: string };

export function parseHubRef(value: string): HubRef | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!raw.includes(":")) {
    return REF_ID.test(raw) ? { hub: "knowledge", kind: "page", id: raw } : null;
  }
  const [hub, kind, id] = raw.split(":");
  if (!id || !REF_ID.test(id)) return null;
  if (hub === "knowledge" && kind === "page") return { hub, kind, id };
  if (hub === "teaching" && kind === "unit") return { hub, kind, id };
  if (hub === "tasks" && kind === "project") return { hub, kind, id };
  return null;
}

export function hrefForHubRef(ref: HubRef): string | null {
  if (ref.hub === "teaching" && ref.kind === "unit") {
    return `${HUB_SITES.teaching}/units/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "tasks" && ref.kind === "project") {
    return `${HUB_SITES.tasks}/#/project/${encodeURIComponent(ref.id)}`;
  }
  return null;
}

export function labelForHubRef(ref: HubRef): string {
  if (ref.hub === "teaching" && ref.kind === "unit") return `Teaching unit ${ref.id}`;
  if (ref.hub === "tasks" && ref.kind === "project") return `Tasks project ${ref.id}`;
  return ref.id;
}
