export type HubEntityDoc = {
  id: string;
  label: string;
  hint?: string;
  tags?: string;
  groupId?: string;
};

export type HubEntityHit = HubEntityDoc & { score: number };

export function buildHubEntityIndex(docs: HubEntityDoc[]): unknown;

export function searchHubEntities(
  index: unknown,
  query: string,
  options?: { limit?: number }
): HubEntityHit[];

export function filterCommandGroups(
  groups: Array<{
    heading: string;
    items: Array<{ id: string; label: string; hint?: string; onSelect?: () => void }>;
  }>,
  query: string,
  options?: { index?: unknown }
): Array<{
  heading: string;
  items: Array<{ id: string; label: string; hint?: string; onSelect?: () => void }>;
}>;
