import type { FFmpeg } from "@ffmpeg/ffmpeg";

type FFmpegRuntime = { ffmpeg: FFmpeg; fetchFile: (input: File) => Promise<Uint8Array> };

async function createFFmpegRuntime() {
  const [{ FFmpeg }, { fetchFile }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
    import("@ffmpeg/core?url"),
    import("@ffmpeg/core/wasm?url"),
  ]);
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL, wasmURL });
  return { ffmpeg, fetchFile };
}

let ffmpegPromise: Promise<FFmpegRuntime> | null = null;

function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = createFFmpegRuntime().catch(error => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

export async function extractFirstTenSeconds(
  file: File,
  onProgress?: (progress: number) => void,
) {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("حجم الفيديو أو الصوت يتجاوز 100 ميغابايت.");
  }
  const { ffmpeg, fetchFile } = await getFFmpeg();
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const inputName = `input-${suffix}.${file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "media"}`;
  const outputName = `sample-${suffix}.wav`;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  ffmpeg.on("progress", onFfmpegProgress);
  try {
    const exitCode = await ffmpeg.exec([
      "-i", inputName,
      "-t", "10",
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      "-f", "wav",
      outputName,
    ]);
    if (exitCode !== 0) throw new Error("لم يتمكن FFmpeg من استخراج الصوت من الملف.");
    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string" || output.byteLength < 2_000) {
      throw new Error("لم نعثر على عينة صوت صالحة في الملف.");
    }
    const copy = new ArrayBuffer(output.byteLength);
    new Uint8Array(copy).set(output);
    onProgress?.(1);
    return new File([copy], "sample-first-10-seconds.wav", { type: "audio/wav" });
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64AudioUrl(base64: string, mimeType = "audio/mpeg") {
  return URL.createObjectURL(
    new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: mimeType }),
  );
}
