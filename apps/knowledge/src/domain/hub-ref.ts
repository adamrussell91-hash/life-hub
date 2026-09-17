const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

// The umbrella is one origin (life-hub.adam-russell.com) with each hub
// mounted under its own path — never a separate subdomain per hub. Hrefs
// here must match the relative paths entity-resolvers.mjs (the server's
// own authoritative resolver) already returns for the same kinds, or a
// "related" chip silently links to a host that doesn't exist.
export type HubRef =
  | { hub: "knowledge"; kind: "page"; id: string }
  | { hub: "teaching"; kind: "unit"; id: string }
  | { hub: "teaching"; kind: "lesson"; id: string }
  | { hub: "tasks"; kind: "project"; id: string }
  | { hub: "tasks"; kind: "program"; id: string }
  | { hub: "life"; kind: "decision"; id: string }
  | { hub: "professional"; kind: "event"; id: string }
  | { hub: "professional"; kind: "meeting"; id: string }
  | { hub: "professional"; kind: "application"; id: string };

export function parseHubRef(value: string): HubRef | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!raw.includes(":")) {
    return REF_ID.test(raw) ? { hub: "knowledge", kind: "page", id: raw } : null;
  }
  const parts = raw.split(":");
  if (parts.length !== 3) return null;
  const [hub, kind, id] = parts;
  if (!id || !REF_ID.test(id)) return null;
  if (hub === "knowledge" && kind === "page") return { hub, kind, id };
  if (hub === "teaching" && kind === "unit") return { hub, kind, id };
  if (hub === "teaching" && kind === "lesson") return { hub, kind, id };
  if (hub === "tasks" && kind === "project") return { hub, kind, id };
  if (hub === "tasks" && kind === "program") return { hub, kind, id };
  if (hub === "life" && kind === "decision") return { hub, kind, id };
  if (hub === "professional" && kind === "event") return { hub, kind, id };
  if (hub === "professional" && kind === "meeting") return { hub, kind, id };
  if (hub === "professional" && kind === "application") return { hub, kind, id };
  return null;
}

export function hrefForHubRef(ref: HubRef): string | null {
  if (ref.hub === "teaching" && ref.kind === "unit") {
    return `/teaching/units/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "teaching" && ref.kind === "lesson") {
    return `/teaching/lessons/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "tasks" && ref.kind === "project") {
    return `/tasks/#/project/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "tasks" && ref.kind === "program") {
    return `/tasks/#/program/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "life" && ref.kind === "decision") {
    return `/#central-node`;
  }
  if (ref.hub === "knowledge" && ref.kind === "page") {
    return `/knowledge/#page/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "professional" && ref.kind === "event") {
    return `/professional/#/event/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "professional" && ref.kind === "meeting") {
    return `/professional/#/meeting/${encodeURIComponent(ref.id)}`;
  }
  if (ref.hub === "professional" && ref.kind === "application") {
    return `/professional/#/application/${encodeURIComponent(ref.id)}`;
  }
  return null;
}

export function labelForHubRef(ref: HubRef): string {
  if (ref.hub === "teaching" && ref.kind === "unit") return `Teaching unit ${ref.id}`;
  if (ref.hub === "teaching" && ref.kind === "lesson") return `Teaching lesson ${ref.id}`;
  if (ref.hub === "tasks" && ref.kind === "project") return `Tasks project ${ref.id}`;
  if (ref.hub === "tasks" && ref.kind === "program") return `Tasks program ${ref.id}`;
  if (ref.hub === "life" && ref.kind === "decision") return `Decision ${ref.id}`;
  if (ref.hub === "professional" && ref.kind === "event") return `Professional event ${ref.id}`;
  if (ref.hub === "professional" && ref.kind === "meeting") return `Professional meeting ${ref.id}`;
  if (ref.hub === "professional" && ref.kind === "application") return `Professional application ${ref.id}`;
  return ref.id;
}
