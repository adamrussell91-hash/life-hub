export type HubVoiceRecorder = {
  start: () => Promise<'started' | 'denied'>;
  stop: () => Promise<'stopping' | 'idle'>;
  toggle: () => Promise<'started' | 'stopping' | 'denied' | 'idle'>;
  destroy: () => void;
  isRecording: () => boolean;
};

export function createHubVoiceRecorder(opts: {
  host: HTMLElement;
  onFile: (file: File) => void;
  mimeType?: string;
}): Promise<HubVoiceRecorder>;
