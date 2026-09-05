export function mountHubAudioPlayer(
  audio: HTMLAudioElement,
  opts?: { rates?: number[] }
): Promise<{ root: HTMLElement; audio: HTMLAudioElement } | null>;

export function createHubAudioPlayer(
  src: string,
  opts?: { title?: string; className?: string }
): Promise<HTMLElement | null>;
