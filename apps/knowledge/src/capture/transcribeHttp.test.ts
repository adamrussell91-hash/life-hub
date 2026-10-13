import { describe, expect, it, vi } from "vitest";
import { handleTranscribeRequest, type TranscribeBindings } from "./transcribeHttp";

function bindings(overrides: Partial<TranscribeBindings> = {}): TranscribeBindings {
  return {
    secret: "kernel-secret",
    allowedOrigin: "https://teaching-hub.example",
    runWhisper: async () => ({
      text: "alpha bravo",
      words: [
        { word: "alpha", start: 0, end: 0.4 },
        { word: "bravo", start: 0.4, end: 0.8 },
      ],
    }),
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://kernel.test${path}`, {
    method: "POST",
    ...init,
    headers: {
      Origin: "https://teaching-hub.example",
      "Content-Type": "application/json",
      "x-research-kernel-secret": "kernel-secret",
      ...(init.headers ?? {}),
    },
  });
}

describe("handleTranscribeRequest", () => {
  it("rejects a missing shared secret", async () => {
    const response = await handleTranscribeRequest(
      request("/transcribe", {
        headers: {
          Origin: "https://teaching-hub.example",
          "Content-Type": "application/json",
          "x-research-kernel-secret": "",
        },
        body: JSON.stringify({ audio: "AAAA" }),
      }),
      bindings(),
    );
    expect(response.status).toBe(401);
  });

  it("returns raw whisper JSON for base64 audio", async () => {
    const runWhisper = vi.fn(async () => ({ text: "ok", word_count: 1 }));
    const response = await handleTranscribeRequest(
      request("/transcribe", { body: JSON.stringify({ audio: "QQ==" }) }),
      bindings({ runWhisper }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "ok", word_count: 1 });
    expect(runWhisper).toHaveBeenCalledWith("QQ==");
  });

  it("requires audio", async () => {
    const response = await handleTranscribeRequest(
      request("/transcribe", { body: JSON.stringify({}) }),
      bindings(),
    );
    expect(response.status).toBe(400);
  });

  it("404s other paths", async () => {
    const response = await handleTranscribeRequest(
      request("/capture", { body: JSON.stringify({ audio: "QQ==" }) }),
      bindings(),
    );
    expect(response.status).toBe(404);
  });
});
