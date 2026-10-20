import { getApiBaseUrl } from '@/api/config';
import type { Block } from '@/schemas/block';
import {
  mountHubWhiteboard as mountSharedWhiteboard,
  type HubWhiteboardOptions
} from '../../../../packages/whiteboard/hub-whiteboard';

export type WhiteboardBlock = Extract<Block, { block_type: 'whiteboard' }>;

export function mountHubWhiteboard(
  host: HTMLElement,
  block: WhiteboardBlock,
  options: Omit<HubWhiteboardOptions<WhiteboardBlock>, 'getBaseUrl'>
): Promise<void> {
  return mountSharedWhiteboard(host, block, { ...options, getBaseUrl: getApiBaseUrl });
}
