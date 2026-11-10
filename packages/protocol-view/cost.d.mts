export const MIN_RUNS: number;
export type ProtocolCostRow = { aud: number; runs: number };
export function sessionAud(usage: { byModel?: Record<string, { input?: number; output?: number }> } | null | undefined): number | null;
export function medianCosts(rows: unknown[], minRuns?: number): Record<string, ProtocolCostRow>;
export function setProtocolCosts(costs: Record<string, ProtocolCostRow> | null | undefined): void;
export function protocolCost(protocolId: string, mode: string): ProtocolCostRow | null;
export function loadProtocolCosts(options?: { apiBase?: string; fetchImpl?: typeof fetch }): Promise<Record<string, ProtocolCostRow>>;
export function formatAud(aud: number): string;
