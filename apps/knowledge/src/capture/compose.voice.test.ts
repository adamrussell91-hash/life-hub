/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adoptComposeVoiceWave,
  captureFieldHtml,
  createComposeVoiceWave,
  createVoiceCapture,
} from "./compose";

class FakeRecorder {
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function installFakeMedia() {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }],
      }),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createVoiceCapture", () => {
  it("start then stop on the same handle delivers an audio file", async () => {
    installFakeMedia();
    const files: File[] = [];
    const voice = createVoiceCapture({ onFile: file => files.push(file) });
    await expect(voice.toggle()).resolves.toBe("started");
    await expect(voice.toggle()).resolves.toBe("stopping");
    expect(files).toHaveLength(1);
    expect(files[0]?.size).toBeGreaterThan(0);
  });

  it("Stop is a no-op when compose rebuilt a fresh handle mid-take", async () => {
    installFakeMedia();
    const files: File[] = [];
    const live = createVoiceCapture({ onFile: file => files.push(file) });
    await expect(live.toggle()).resolves.toBe("started");
    const replacement = createVoiceCapture({ onFile: file => files.push(file) });
    await expect(replacement.toggle()).resolves.toBe("started");
    expect(files).toHaveLength(0);
    live.stopMic();
    replacement.stopMic();
  });

  it("the same handle still delivers after the compose slot is replaced", async () => {
    installFakeMedia();
    const files: File[] = [];
    const host = createComposeVoiceWave();
    const voice = createVoiceCapture({ onFile: file => files.push(file) });
    await expect(voice.toggle()).resolves.toBe("started");
    const next = document.createElement("div");
    next.innerHTML = captureFieldHtml({
      busy: false,
      captureBusy: false,
      recording: true,
      localData: false,
    });
    adoptComposeVoiceWave(next, host);
    expect(next.querySelector("[data-voice-wave]")).toBe(host);
    await expect(voice.toggle()).resolves.toBe("stopping");
    expect(files).toHaveLength(1);
  });

  it("stopMic discards the take instead of ingesting it", async () => {
    installFakeMedia();
    const files: File[] = [];
    const voice = createVoiceCapture({ onFile: file => files.push(file) });
    await expect(voice.toggle()).resolves.toBe("started");
    voice.stopMic();
    expect(files).toHaveLength(0);
  });
});
