import { WHISPER_MODEL } from "./live";

export type TranscribeBindings = {
  secret: string;
  allowedOrigin: string;
  runWhisper: (audioBase64: string, options?: WhisperOptions) => Promise<unknown>;
};

/** `initial_prompt` steers Whisper's style; a prompt full of "um"s keeps disfluencies. */
export type WhisperOptions = { initial_prompt?: string };
const MAX_INITIAL_PROMPT = 400;

function corsHeaders(origin: string | null, allowedOrigin: string) {
  const allow = allowedOrigin === "*" ? origin ?? "*" : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type, x-research-kernel-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * POST /transcribe — secret-checked Whisper pass-through.
 * Accepts JSON `{ audio: "<base64>", initial_prompt? }` or `{ audio_base64 }` or raw binary body.
 * Returns the raw model JSON. Never logs transcript text.
 */
export async function handleTranscribeRequest(
  request: Request,
  bindings: TranscribeBindings,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, bindings.allowedOrigin);
  if (origin && bindings.allowedOrigin !== "*" && origin !== bindings.allowedOrigin) {
    return json(403, { error: "Origin not allowed" }, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!bindings.secret || request.headers.get("x-research-kernel-secret") !== bindings.secret) {
    return json(401, { error: "Unauthorized" }, headers);
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!(request.method === "POST" && path.endsWith("/transcribe"))) {
    return json(404, { error: "Not found" }, headers);
  }

  let audioBase64 = "";
  let initialPrompt = "";
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as {
        audio?: unknown;
        audio_base64?: unknown;
        initial_prompt?: unknown;
      };
      if (typeof payload.audio === "string") audioBase64 = payload.audio.trim();
      else if (typeof payload.audio_base64 === "string") audioBase64 = payload.audio_base64.trim();
      if (typeof payload.initial_prompt === "string") {
        initialPrompt = payload.initial_prompt.trim().slice(0, MAX_INITIAL_PROMPT);
      }
    } else {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 0) audioBase64 = bytesToBase64(bytes);
    }
  } catch {
    return json(400, { error: "Invalid body" }, headers);
  }

  if (!audioBase64) return json(400, { error: "audio is required" }, headers);

  try {
    const result = initialPrompt
      ? await bindings.runWhisper(audioBase64, { initial_prompt: initialPrompt })
      : await bindings.runWhisper(audioBase64);
    return json(200, result ?? {}, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    return json(502, { error: message }, headers);
  }
}

export function whisperRunInput(audioBase64: string, options: WhisperOptions = {}) {
  return {
    model: WHISPER_MODEL,
    input: {
      audio: audioBase64,
      task: "transcribe" as const,
      language: "en",
      ...(options.initial_prompt ? { initial_prompt: options.initial_prompt } : {}),
    },
  };
}
