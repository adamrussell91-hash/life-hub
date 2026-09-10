import { scanDocumentFromImage } from "../../design-kit/js/hub-doc-scan.js";
import { ensureWebImage, isHeicLike } from "../../design-kit/js/hub-heic.js";
import { compressAndStripExif } from "../../design-kit/js/hub-image-pipeline.js";
import {
  classifyClipboardData,
  classifyDropEvent,
  classifyPasteEvent,
} from "../../design-kit/js/hub-rich-paste.js";
import { appendCaptureBlock, titleFromCapture, type CaptureKind } from "./appendBlock";

export { appendCaptureBlock, titleFromCapture };
export type { CaptureKind };

/** HEIC→JPEG (native, then LGPL heic-to), then compress + strip EXIF GPS. */
export async function prepareCaptureImage(file: File): Promise<File> {
  let working = file;
  try {
    const ensured = await ensureWebImage(file, { enableLgplConverter: true });
    working = ensured.file;
  } catch {
    if (isHeicLike(file)) return file;
  }
  if (!working.type.startsWith("image/")) return working;
  try {
    const result = await compressAndStripExif(working, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.82,
      mimeType: "image/jpeg",
    });
    if (result.skipped) return working;
    const base = working.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([result.blob], `${base}.jpg`, {
      type: result.blob.type || "image/jpeg",
      lastModified: working.lastModified,
    });
  } catch {
    return working;
  }
}

/** Optional jscanify paper warp before the normal photo pipeline. */
export async function prepareCaptureScan(file: File): Promise<File> {
  try {
    const scanned = await scanDocumentFromImage(file);
    const base = file.name.replace(/\.[^.]+$/, "") || "scan";
    const next = new File([scanned.blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return prepareCaptureImage(next);
  } catch {
    return prepareCaptureImage(file);
  }
}

export const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;

export function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

export function captureFileName(kind: CaptureKind, file: File, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  if (kind === "voice") return `voice-${stamp}${file.type.includes("mp4") ? ".m4a" : ".webm"}`;
  if (file.name && file.name.includes(".")) return file.name;
  if (kind === "pdf") return `capture-${stamp}.pdf`;
  return `photo-${stamp}.jpg`;
}

export function captureContentType(kind: CaptureKind, file: File) {
  const raw = file.type || (kind === "pdf" ? "application/pdf" : kind === "photo" ? "image/jpeg" : "audio/webm");
  return raw.split(";")[0].trim().toLowerCase();
}

export type CaptureUiState = {
  busy: boolean;
  captureBusy: boolean;
  recording: boolean;
  localData: boolean;
};

export function captureControlState(state: CaptureUiState) {
  const captureDisabled = state.localData || state.busy || state.captureBusy ? "disabled" : "";
  const captureOthersDisabled = captureDisabled || state.recording ? "disabled" : "";
  const voiceLabel = state.recording ? "Stop" : state.captureBusy ? "Capturing…" : "Voice";
  return { captureDisabled, captureOthersDisabled, voiceLabel };
}

export function captureFieldHtml(state: CaptureUiState) {
  const { captureDisabled, captureOthersDisabled, voiceLabel } = captureControlState(state);
  return `<div class="compose__field">
        <label>Capture</label>
        <div class="compose__capture hub-capture" data-hub-capture>
          <button class="btn" data-capture-voice type="button" ${captureDisabled}>${voiceLabel}</button>
          <button class="btn" data-capture-photo type="button" ${captureOthersDisabled}>Photo</button>
          <button class="btn" data-capture-scan type="button" ${captureOthersDisabled}>Scan</button>
          <button class="btn" data-capture-pdf type="button" ${captureOthersDisabled}>PDF</button>
          <button class="btn btn--ghost" data-capture-paste type="button" ${captureOthersDisabled}>Paste</button>
        </div>
        <div class="compose__voice-wave hub-voice-wave" data-voice-wave hidden></div>
        <input id="compose-photo" class="compose__hidden-file" type="file" accept="image/*,.heic,.heif,image/heic,image/heif" capture="environment" />
        <input id="compose-scan" class="compose__hidden-file" type="file" accept="image/*,.heic,.heif,image/heic,image/heif" capture="environment" />
        <input id="compose-pdf" class="compose__hidden-file" type="file" accept="application/pdf" />
      </div>`;
}

export type SignedCapture = {
  put_url: string;
  attachment: { filename: string; r2_key: string };
};

export type CaptureIngestInput = {
  file: File;
  kind: CaptureKind;
  pageId: string;
  area: "notes" | "university";
  body: string;
  title: string;
};

export type CaptureIngestDeps = {
  signAttachment: (input: {
    filename: string;
    content_type: string;
    byte_size: number;
    page_id: string;
    area: "notes" | "university";
  }) => Promise<SignedCapture>;
  uploadSignedFile: (putUrl: string, file: File, contentType: string) => Promise<void>;
  runCapture: (r2Key: string) => Promise<{ text: string }>;
  localData?: boolean;
  maxBytes?: number;
};

export type CaptureIngestResult =
  | { ok: true; body: string; title: string; attachment: SignedCapture["attachment"]; toast: string }
  | { ok: false; toast: string; attachment?: SignedCapture["attachment"] };

export async function ingestCaptureFile(
  input: CaptureIngestInput,
  deps: CaptureIngestDeps,
): Promise<CaptureIngestResult> {
  const maxBytes = deps.maxBytes ?? MAX_CAPTURE_BYTES;
  if (input.file.size > maxBytes) {
    return { ok: false, toast: `${input.file.name} exceeds 20MB and was skipped` };
  }
  if (deps.localData) {
    return { ok: false, toast: "Capture needs the live API (npx netlify dev)." };
  }
  let attachment: SignedCapture["attachment"] | undefined;
  try {
    const uploadFile = input.kind === "photo" ? await prepareCaptureImage(input.file) : input.file;
    const contentType = captureContentType(input.kind, uploadFile);
    const filename = captureFileName(input.kind, uploadFile);
    const named = new File([uploadFile], filename, { type: contentType });
    const signed = await deps.signAttachment({
      filename,
      content_type: contentType,
      byte_size: named.size,
      page_id: input.pageId,
      area: input.area,
    });
    attachment = signed.attachment;
    await deps.uploadSignedFile(signed.put_url, named, contentType);
    const captured = await deps.runCapture(signed.attachment.r2_key);
    return {
      ok: true,
      body: appendCaptureBlock(input.body, {
        kind: input.kind,
        filename: signed.attachment.filename,
        text: captured.text,
      }),
      title: titleFromCapture(input.title, { kind: input.kind, text: captured.text }),
      attachment: signed.attachment,
      toast: captured.text.trim() ? "Captured" : "Nothing readable",
    };
  } catch (error) {
    return {
      ok: false,
      toast: error instanceof Error ? error.message : "Capture failed",
      attachment,
    };
  }
}

function routeIngestPayload(
  payload: ReturnType<typeof classifyClipboardData>,
  opts: {
    onPhoto: (file: File) => void;
    onPdf: (file: File) => void;
    onPaste?: (text: string) => void;
  },
): boolean {
  if (payload.kind === "image" && payload.files?.[0]) {
    opts.onPhoto(payload.files[0]);
    return true;
  }
  if (payload.kind === "file" && payload.files?.[0]) {
    const file = payload.files[0];
    if (payload.subtype === "pdf" || file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      opts.onPdf(file);
      return true;
    }
    return false;
  }
  if (payload.kind === "url" && payload.url) {
    opts.onPaste?.(payload.url);
    return true;
  }
  if ((payload.kind === "text" || payload.kind === "html") && payload.text) {
    opts.onPaste?.(payload.text);
    return true;
  }
  return false;
}

export function bindCaptureControls(
  root: ParentNode,
  opts: {
    syncFields: () => void;
    onVoice: () => void;
    onPhoto: (file: File) => void;
    onPdf: (file: File) => void;
    onPaste?: (text: string) => void;
  },
) {
  root.querySelector<HTMLButtonElement>("[data-capture-voice]")!.onclick = () => {
    opts.syncFields();
    opts.onVoice();
  };
  const paste = root.querySelector<HTMLButtonElement>("[data-capture-paste]");
  if (paste) {
    paste.onclick = async () => {
      opts.syncFields();
      // Prefer clipboard items (images) when the browser allows it.
      try {
        const items = await navigator.clipboard?.read?.();
        if (items?.length) {
          for (const item of items) {
            const imageType = item.types.find(type => type.startsWith("image/"));
            if (imageType) {
              const blob = await item.getType(imageType);
              const ext = imageType.split("/")[1] || "png";
              opts.onPhoto(new File([blob], `paste.${ext}`, { type: imageType }));
              return;
            }
          }
          if (items[0]?.types.includes("text/plain")) {
            const text = await (await items[0].getType("text/plain")).text();
            if (text) {
              routeIngestPayload(classifyClipboardData(textDataTransfer(text)), opts);
              return;
            }
          }
        }
      } catch {
        // Fall through to readText — image permission may be denied.
      }
      const text = await navigator.clipboard?.readText?.();
      if (text) routeIngestPayload(classifyClipboardData(textDataTransfer(text)), opts);
    };
  }
  root.querySelector<HTMLButtonElement>("[data-capture-photo]")!.onclick = () => {
    root.querySelector<HTMLInputElement>("#compose-photo")?.click();
  };
  root.querySelector<HTMLButtonElement>("[data-capture-scan]")!.onclick = () => {
    root.querySelector<HTMLInputElement>("#compose-scan")?.click();
  };
  root.querySelector<HTMLButtonElement>("[data-capture-pdf]")!.onclick = () => {
    root.querySelector<HTMLInputElement>("#compose-pdf")?.click();
  };
  root.querySelector<HTMLInputElement>("#compose-photo")!.onchange = event => {
    opts.syncFields();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) opts.onPhoto(file);
  };
  root.querySelector<HTMLInputElement>("#compose-scan")!.onchange = event => {
    opts.syncFields();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    void (async () => {
      const scanned = await prepareCaptureScan(file);
      opts.onPhoto(scanned);
    })();
  };
  root.querySelector<HTMLInputElement>("#compose-pdf")!.onchange = event => {
    opts.syncFields();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) opts.onPdf(file);
  };

  const dropHost =
    root.querySelector<HTMLElement>("[data-hub-capture]") ??
    (root instanceof HTMLElement ? root : null);
  if (dropHost) {
    dropHost.addEventListener("dragover", event => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dropHost.classList.add("is-drop-target");
    });
    dropHost.addEventListener("dragleave", () => {
      dropHost.classList.remove("is-drop-target");
    });
    dropHost.addEventListener("drop", event => {
      dropHost.classList.remove("is-drop-target");
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      opts.syncFields();
      routeIngestPayload(classifyDropEvent(event), opts);
    });
  }

  const pasteHost =
    (root instanceof HTMLElement ? root : null)?.querySelector?.<HTMLElement>("#compose-body-host") ??
    (root instanceof HTMLElement ? root : null);
  pasteHost?.addEventListener("paste", event => {
    const payload = classifyPasteEvent(event);
    if (payload.kind === "image" || payload.kind === "file") {
      event.preventDefault();
      opts.syncFields();
      routeIngestPayload(payload, opts);
    }
  });
}

function textDataTransfer(text: string): DataTransfer {
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  return dt;
}

export type VoiceCaptureHandle = {
  toggle: () => Promise<"started" | "stopping" | "denied">;
  stopMic: () => void;
};

/** Stable waveform node so compose re-renders do not kill an in-flight recording. */
export function createComposeVoiceWave(): HTMLElement {
  const host = document.createElement("div");
  host.className = "compose__voice-wave hub-voice-wave";
  host.setAttribute("data-voice-wave", "");
  host.hidden = true;
  return host;
}

export function adoptComposeVoiceWave(root: ParentNode, host: HTMLElement) {
  const slot = root.querySelector<HTMLElement>("[data-voice-wave]");
  if (!slot || slot === host) return;
  slot.replaceWith(host);
}

export function createVoiceCapture(opts: {
  onFile: (file: File) => void;
  waveformHost?: HTMLElement | null;
}): VoiceCaptureHandle {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let wave: Awaited<ReturnType<typeof import("../../design-kit/js/hub-voice-recorder.js").createHubVoiceRecorder>> | null =
    null;
  let waveLoading: Promise<void> | null = null;
  let discarded = false;

  const releaseMic = () => {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };

  const deliver = (file: File) => {
    if (discarded) return;
    if (opts.waveformHost) opts.waveformHost.hidden = true;
    opts.onFile(file);
  };

  const abortRecorder = () => {
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    recorder = null;
    chunks = [];
    releaseMic();
  };

  const ensureWave = async () => {
    if (!opts.waveformHost) return null;
    if (wave) return wave;
    if (!waveLoading) {
      waveLoading = (async () => {
        const { createHubVoiceRecorder } = await import("../../design-kit/js/hub-voice-recorder.js");
        wave = await createHubVoiceRecorder({
          host: opts.waveformHost!,
          onFile: deliver,
        });
        opts.waveformHost!.hidden = false;
      })().catch(() => {
        wave = null;
      });
    }
    await waveLoading;
    return wave;
  };

  return {
    stopMic() {
      discarded = true;
      wave?.destroy();
      wave = null;
      waveLoading = null;
      if (opts.waveformHost) opts.waveformHost.hidden = true;
      abortRecorder();
    },
    async toggle() {
      discarded = false;
      const waveHandle = await ensureWave();
      if (waveHandle) {
        const result = await waveHandle.toggle();
        if (result === "denied") return "denied";
        if (result === "started") {
          if (opts.waveformHost) opts.waveformHost.hidden = false;
          return "started";
        }
        return "stopping";
      }
      if (recorder) {
        recorder.stop();
        return "stopping";
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        const mime = recorderMime();
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = event => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          const type = recorder?.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          abortRecorder();
          deliver(new File([blob], "", { type }));
        };
        recorder.start();
        return "started";
      } catch {
        abortRecorder();
        return "denied";
      }
    },
  };
}
