/** @typedef {import('./chat-pending-confirms.js')} ChatPendingConfirms */

/**
 * @typedef {{
 *   intent?: string,
 *   agent?: string,
 *   surfaces?: string[],
 *   capability?: string,
 *   writes?: Array<{ path?: string, mode?: string, diff?: string }>
 * }} PendingProposal
 *
 * @typedef {{
 *   card: any,
 *   confirm?: any,
 *   discard?: any,
 *   acceptedPaths?: () => string[]
 * }} ActionProposalUi
 *
 * @typedef {{
 *   appendActionProposal: (root: any, opts: { proposal: PendingProposal, host?: any, pendingId?: string|null }) => ActionProposalUi|null|undefined,
 *   bindActionProposal: (ui: ActionProposalUi, proposal: PendingProposal, id: string|null) => void,
 *   reconcile?: boolean
 * }} MountPendingOpts
 */

export function selectLivePendingActions(list: any[]): any[];
export function pendingConfirmPublicFields(entry: any): any;
export function ensureChatPendingConfirmsTray(root: any): any;
export function syncChatPendingConfirmsVisibility(root: any): void;
export function mountPendingActionCards(root: any, pending: any[], opts: MountPendingOpts): any[];
export function appendActionProposalToPendingTray(
  root: any,
  event: { proposal: any, id?: string|null },
  opts: { appendActionProposal: MountPendingOpts['appendActionProposal'], bindActionProposal: MountPendingOpts['bindActionProposal'] }
): any;
export function removePendingConfirmCard(root: any, id: string): void;
export const CHAT_PENDING_CONFIRMS_ID: string;
export const CHAT_PENDING_CONFIRMS_LIST_ID: string;
