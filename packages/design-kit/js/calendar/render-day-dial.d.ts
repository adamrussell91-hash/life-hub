export function ghostDecisionBody(id: string, decision: 'accept' | 'dismiss'): { id: string; decision: string };
export function isDayDialMounted(): boolean;
export function renderDayDial(doc: Document, host: HTMLElement, input?: Record<string, unknown>): void;
export function unmountDayDial(): void;
