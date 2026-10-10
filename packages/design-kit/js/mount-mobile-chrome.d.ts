export type MobileChromeItem = {
  id: string;
  label: string;
  paths?: string[];
  iconHtml?: string;
  href?: string;
  onSelect?: (item: MobileChromeItem) => void;
  current?: boolean;
};

export type MountMobileChromeOptions = {
  /** Umbrella hub id, or a section id (e.g. travel) that is not in the switcher so Life still appears. */
  currentHub: 'life' | 'teaching' | 'knowledge' | 'tasks' | 'professional' | 'travel';
  primary: MobileChromeItem[];
  more?: MobileChromeItem[];
};

export function mountMobileChrome(
  host: ParentNode,
  options: MountMobileChromeOptions
): { bar: HTMLElement; sheet: HTMLDialogElement; closeSheet: () => void } | null;
