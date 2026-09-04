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
  currentHub: 'life' | 'teaching' | 'knowledge' | 'tasks';
  primary: MobileChromeItem[];
  more?: MobileChromeItem[];
};

export function mountMobileChrome(
  host: ParentNode,
  options: MountMobileChromeOptions
): { bar: HTMLElement; sheet: HTMLDialogElement; closeSheet: () => void } | null;
