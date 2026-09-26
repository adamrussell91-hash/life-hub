export function hubDomainForItem(item: unknown): string | null;
export function openInHubLabel(hub: string | null | undefined): string;
export function openInHubHref(
  item: unknown,
  routeFor?: (item: unknown) => string | null | undefined
): string | null;
export function isOwnHubItem(item: unknown, viewerHub: string): boolean;
export function openInHubLinkHtml(
  item: unknown,
  opts?: { hub?: string; routeFor?: (item: unknown) => string | null | undefined }
): string;
