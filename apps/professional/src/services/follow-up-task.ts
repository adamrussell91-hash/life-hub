export {
  buildFollowUpIntents,
  createOrRetryFollowUpTask,
  recipientPersonRefsFromLinks
} from './follow-up-task.mjs';

export type FollowUpRelationshipType = 'follow_up' | 'contact';

export interface FollowUpLinkIntent {
  intent_id: string;
  relationship_type: FollowUpRelationshipType;
  target_ref: string;
}

export interface FollowUpState {
  task_id: string;
  title: string;
  communication_id: string;
  communication_ref: string;
  intents: FollowUpLinkIntent[];
  completed_intent_ids: string[];
  completed_link_ids: string[];
  failed_intent_ids: string[];
  failed_relationships: Array<{
    intent_id: string;
    relationship_type: FollowUpRelationshipType;
    target_ref: string;
  }>;
}

export interface FollowUpLinkRecord {
  id: string;
  relationship_type: string;
  status: string;
  source_ref: string;
  target_ref: string;
}

export interface FollowUpDeps {
  createTask: (input: { title: string }) => Promise<{ id: string; title?: string }>;
  listLinksForEntity: (entityRef: string) => Promise<{
    outgoing: Array<{ link: FollowUpLinkRecord }>;
    incoming?: Array<{ link: FollowUpLinkRecord }>;
  }>;
  createLink: (input: {
    source_ref: string;
    target_ref: string;
    relationship_type: string;
  }) => Promise<{ link: { id: string }; created: boolean }>;
}
