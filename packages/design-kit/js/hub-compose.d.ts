export function formatDisplayTime(value: string | Date | null | undefined): string;

export function defaultScheduleValues(now?: Date): { dateKey: string; time: string };

export function composeDueLine(
  dateKey: string | Date | null | undefined,
  timeValue?: string | Date | null | undefined
): string;

export function composeDumpText(
  text: string | null | undefined,
  options?: {
    scheduled?: boolean;
    dateKey?: string | Date | null;
    timeValue?: string | Date | null;
  }
): string;

export type HubComposeState = {
  text: string;
  scheduled: boolean;
  dateKey: string;
  timeValue: string;
  composed: string;
};

export type HubComposeApi = {
  el: HTMLElement;
  textarea: HTMLTextAreaElement | null;
  open: () => void;
  close: () => void;
  isScheduling: () => boolean;
  read: () => HubComposeState | null;
  destroy: () => void;
};

export function readHubCompose(el: Element | null | undefined): HubComposeState | null;

export function mountHubCompose(
  el: Element,
  options?: { now?: Date }
): HubComposeApi | null;

export function mountHubComposes(scope?: ParentNode): HubComposeApi[];

export function resetHubComposeForTests(): void;
