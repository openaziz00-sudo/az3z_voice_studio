import { ENV } from "./_core/env.js";

const API_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ElevenLabsApiError";
  }
}

function getApiKey() {
  const key = ENV.elevenLabsApiKey;
  if (!key) throw new ElevenLabsApiError(503, "اعتماد ElevenLabs غير مهيأ لخادم التطبيق.");
  return key;
}

async function readError(response: Response) {
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown; error?: unknown };
    const candidate = body.detail ?? body.message ?? body.error;
    if (typeof candidate === "string") detail = candidate;
    else if (candidate && typeof candidate === "object" && "message" in candidate) {
      const message = (candidate as { message?: unknown }).message;
      if (typeof message === "string") detail = message;
    }
  } catch {
    // Provider error bodies are intentionally not logged or returned to the browser.
  }

  if (response.status === 401 || response.status === 403) {
    return "رفض ElevenLabs الاعتماد. راجع مفتاح الخدمة من إعدادات المشروع.";
  }
  if (response.status === 429) return "تم بلوغ حد الطلبات في ElevenLabs. حاول لاحقاً.";
  if (response.status === 422) return detail || "تعذر قبول ملف الصوت أو إعدادات الطلب.";
  if (response.status >= 500) return "خدمة ElevenLabs غير متاحة مؤقتاً.";
  return detail || `رفضت خدمة ElevenLabs الطلب (${response.status}).`;
}

async function assertOk(response: Response) {
  if (!response.ok) throw new ElevenLabsApiError(response.status, await readError(response));
}

export async function testElevenLabsConnection() {
  const response = await fetch(`${API_BASE}/user`, {
    headers: { "xi-api-key": getApiKey() },
    signal: AbortSignal.timeout(12_000),
  });
  await assertOk(response);
  return true;
}

export async function createInstantVoiceClone(input: {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  name: string;
}) {
  const body = new FormData();
  body.append("name", input.name);
  body.append("description", "3ZAI Voice Studio instant voice clone");
  body.append("files", new Blob([Uint8Array.from(input.audio)], { type: input.mimeType }), input.fileName);

  const response = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": getApiKey() },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  await assertOk(response);
  const result = (await response.json()) as { voice_id?: string; requires_verification?: boolean };
  if (!result.voice_id) throw new ElevenLabsApiError(502, "لم يُرجع ElevenLabs معرّف الصوت المستنسخ.");
  return { voiceId: result.voice_id, requiresVerification: Boolean(result.requires_verification) };
}

export async function deleteElevenLabsVoice(voiceId: string) {
  const response = await fetch(`${API_BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": getApiKey() },
    signal: AbortSignal.timeout(12_000),
  });
  await assertOk(response);
}

export async function generateSpeech(input: {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}) {
  const url = new URL(`${API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}`);
  url.searchParams.set("output_format", "mp3_44100_128");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: input.modelId ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: input.stability ?? 0.45,
        similarity_boost: input.similarityBoost ?? 0.8,
        style: input.style ?? 0,
        use_speaker_boost: true,
        speed: input.speed ?? 1,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  await assertOk(response);
  return Buffer.from(await response.arrayBuffer());
}

export type TranscriptResult = {
  text: string;
  language_code?: string;
  language_probability?: number;
  words?: Array<Record<string, unknown>>;
  audio_duration?: number;
};

export async function transcribeAudio(input: {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  languageCode?: string;
}) {
  const body = new FormData();
  body.append("model_id", "scribe_v2");
  body.append("timestamps_granularity", "word");
  body.append("diarize", "false");
  if (input.languageCode) body.append("language_code", input.languageCode);
  body.append("file", new Blob([Uint8Array.from(input.audio)], { type: input.mimeType }), input.fileName);

  const response = await fetch(`${API_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": getApiKey() },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  await assertOk(response);
  const result = (await response.json()) as TranscriptResult;
  if (typeof result.text !== "string") throw new ElevenLabsApiError(502, "لم يُرجع ElevenLabs نص التفريغ.");
  return result;
}

export function safeElevenLabsError(error: unknown) {
  if (error instanceof ElevenLabsApiError) return error.message;
  return "تعذر الاتصال بخدمة ElevenLabs. تحقق من الاتصال وحاول مجدداً.";
}
