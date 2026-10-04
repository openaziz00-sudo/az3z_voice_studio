import { afterEach, describe, expect, it, vi } from "vitest";
import { storageGet, storagePut } from "./storage.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("storage URLs by deployment target", () => {
  it("keeps the Manus storage route for the Manus runtime", async () => {
    vi.stubEnv("VERCEL", "0");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await storageGet("users/7/audio/clip.mp3");

    expect(result).toEqual({
      key: "users/7/audio/clip.mp3",
      url: "/manus-storage/users/7/audio/clip.mp3",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an expiring signed read URL on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MANUS_API_URL", "https://forge.example.test");
    vi.stubEnv("MANUS_API_KEY", "test-only-storage-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn.example.test/signed-audio" }), { status: 200 }),
    ));

    const result = await storageGet("users/7/audio/clip.mp3");

    expect(result).toEqual({ key: "users/7/audio/clip.mp3", url: "https://cdn.example.test/signed-audio" });
  });

  it("returns a signed read URL immediately after Vercel upload", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MANUS_API_URL", "https://forge.example.test");
    vi.stubEnv("MANUS_API_KEY", "test-only-storage-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://s3.example.test/put" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://cdn.example.test/signed-audio" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await storagePut("users/7/audio/clip.mp3", Buffer.from("test-audio"), "audio/mpeg");

    expect(result.key).toMatch(/^users\/7\/audio\/clip_[a-f0-9]{8}\.mp3$/);
    expect(result.url).toBe("https://cdn.example.test/signed-audio");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
