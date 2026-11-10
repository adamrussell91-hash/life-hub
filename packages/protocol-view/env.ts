// What the host app (Knowledge or Tasks) tells the shared protocol screen: where the protocol API
// lives, where the card and portrait art is served from, and whether it runs on local sample data.
export type ProtocolViewEnv = {
  /** Base of the protocol API, so `${apiBase}/protocols` is the endpoint. */
  apiBase: string;
  /** Folder holding card-fronts, card-backs, backgrounds and voice portraits. */
  assetRoot: string;
  /** Knowledge's offline sample mode: no network calls. */
  useLocalData: boolean;
  /** Where "From thread" tags point; the umbrella path, so it works from any hub. */
  threadHref: (threadId: string) => string;
};

let current: ProtocolViewEnv = {
  apiBase: "/api/knowledge",
  assetRoot: "/knowledge/assets/cognitive-protocols",
  useLocalData: false,
  threadHref: id => `/tasks/#/think/${encodeURIComponent(id)}`,
};

export function configureProtocolView(next: Partial<ProtocolViewEnv>) {
  current = { ...current, ...next };
}

export const protocolEnv = () => current;
