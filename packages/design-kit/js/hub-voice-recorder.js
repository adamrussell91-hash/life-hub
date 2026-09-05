/** Knowledge voice capture with wavesurfer Record plugin.
 * Lazy-loads wavesurfer. Keeps File-out contract for Whisper ingest.
 */

/**
 * @typedef {{
 *   host: HTMLElement,
 *   onFile: (file: File) => void,
 *   mimeType?: string,
 * }} HubVoiceRecorderOptions
 */

/**
 * @typedef {{
 *   start: () => Promise<'started' | 'denied'>,
 *   stop: () => Promise<'stopping' | 'idle'>,
 *   toggle: () => Promise<'started' | 'stopping' | 'denied' | 'idle'>,
 *   destroy: () => void,
 *   isRecording: () => boolean,
 * }} HubVoiceRecorder
 */

/**
 * @param {HubVoiceRecorderOptions} opts
 * @returns {Promise<HubVoiceRecorder>}
 */
export async function createHubVoiceRecorder(opts) {
  if (!opts?.host || typeof opts.onFile !== 'function') {
    throw new TypeError('createHubVoiceRecorder requires host + onFile');
  }

  const WaveSurfer = (await import('wavesurfer.js')).default;
  const RecordPlugin = (await import('wavesurfer.js/dist/plugins/record.esm.js')).default;

  const wavesurfer = WaveSurfer.create({
    container: opts.host,
    height: 56,
    waveColor: 'color-mix(in srgb, var(--ink-1, #0a1536) 35%, transparent)',
    progressColor: 'var(--accent-1, #2f5d8c)',
    cursorWidth: 0,
    interact: false
  });

  const record = wavesurfer.registerPlugin(
    RecordPlugin.create({
      mimeType: opts.mimeType || undefined,
      scrollingWaveform: true,
      renderRecordedAudio: false
    })
  );

  let recording = false;

  record.on('record-end', (blob) => {
    recording = false;
    const type = blob.type || 'audio/webm';
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    opts.onFile(new File([blob], `voice-${Date.now()}.${ext}`, { type }));
  });

  async function start() {
    if (recording) return 'started';
    try {
      await record.startRecording();
      recording = true;
      return 'started';
    } catch {
      recording = false;
      return 'denied';
    }
  }

  async function stop() {
    if (!recording) return 'idle';
    record.stopRecording();
    recording = false;
    return 'stopping';
  }

  return {
    start,
    stop,
    async toggle() {
      return recording ? stop() : start();
    },
    destroy() {
      try {
        if (recording) record.stopRecording();
      } catch {
        /* ignore */
      }
      recording = false;
      wavesurfer.destroy();
    },
    isRecording: () => recording
  };
}
