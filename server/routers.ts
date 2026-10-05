import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  conversations,
  messages,
  userPreferences,
  voiceAssets,
  voiceProfiles,
} from "../drizzle/schema.js";
import { storageGet, storagePut } from "./storage.js";
import { getDb } from "./db.js";
import {
  createInstantVoiceClone,
  deleteElevenLabsVoice,
  ElevenLabsApiError,
  generateSpeech,
  safeElevenLabsError,
  testElevenLabsConnection,
  transcribeAudio,
} from "./elevenlabs.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";

const DEFAULT_PREFERENCES = { language: "ar" as const, theme: "dark" as const, saveToCloud: true };
const IS_VERCEL = process.env.VERCEL === "1";
const MAX_TTS_TEXT_CHARS = IS_VERCEL ? 2_000 : 5_000;
const MAX_TRANSCRIPTION_FILE_BYTES = IS_VERCEL ? 3_000_000 : 18 * 1024 * 1024;
const MAX_AUDIO_BASE64_CHARS = IS_VERCEL ? 4_000_000 : 26_000_000;
const CLONE_SAMPLE_LIMIT = 1_500_000;
const CLONE_PREVIEW_TEXT = "هذه معاينة مؤقتة للصوت. استمع إليها، ثم اعتمد الصوت إذا كنت راضياً.";

type PendingClone = {
  userId: number;
  conversationId: string;
  voiceId: string;
  name: string;
  fileName: string;
  audio: Buffer;
  expiresAt: number;
  consentConfirmed: true;
  requiresVerification: boolean;
};

// Temporary previews exist in memory only and are never listed as user voices.
const pendingClones = new Map<string, PendingClone>();
async function cleanupExpiredClones() {
  const now = Date.now();
  for (const [token, pending] of pendingClones) {
    if (pending.expiresAt > now) continue;
    pendingClones.delete(token);
    try {
      await deleteElevenLabsVoice(pending.voiceId);
    } catch {
      // Do not log third-party response bodies or credential-bearing context.
    }
  }
}
const pendingCloneSweep = setInterval(() => void cleanupExpiredClones(), 5 * 60 * 1000);
pendingCloneSweep.unref?.();

function getUserId(ctx: { user: { id: number } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول للمتابعة." });
  return ctx.user.id;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حالياً." });
  return db;
}

async function requireOwnedConversation(db: Awaited<ReturnType<typeof getDb>>, userId: number, conversationId: string) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حالياً." });
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها." });
  return rows[0];
}

function cleanedFileName(value: string) {
  const file = basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").slice(0, 120);
  return file || "audio.wav";
}

function decodeAudio(value: string) {
  if (value.length > MAX_AUDIO_BASE64_CHARS) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "الملف كبير جداً. قلّص حجمه ثم أعد المحاولة." });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ترميز ملف الصوت غير صالح." });
  }
  const audio = Buffer.from(value, "base64");
  if (!audio.length) throw new TRPCError({ code: "BAD_REQUEST", message: "ملف الصوت فارغ أو غير صالح." });
  return audio;
}

function explainProviderError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof ElevenLabsApiError) {
    const code = error.status === 429 ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: safeElevenLabsError(error) });
  }
  console.error("[3ZAI] A voice service request failed.");
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إكمال طلب الصوت. حاول مجدداً." });
}

async function readPreferences(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number) {
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return rows[0] ?? DEFAULT_PREFERENCES;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  workspace: router({
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      const userId = getUserId(ctx);
      const db = await requireDb();
      const [chatRows, voiceRows, preferences] = await Promise.all([
        db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt)).limit(100),
        db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId)).orderBy(desc(voiceProfiles.createdAt)).limit(100),
        readPreferences(db, userId),
      ]);
      return { conversations: chatRows, voices: voiceRows, preferences };
    }),

    searchConversations: protectedProcedure
      .input(z.object({ query: z.string().trim().max(100).default("") }))
      .query(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        const rows = await db.select().from(conversations)
          .where(eq(conversations.userId, userId))
          .orderBy(desc(conversations.updatedAt)).limit(100);
        const query = input.query.toLocaleLowerCase();
        return query ? rows.filter(row => row.title.toLocaleLowerCase().includes(query)) : rows;
      }),

    createConversation: protectedProcedure
      .input(z.object({ title: z.string().trim().max(180).optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        const id = randomUUID();
        const title = input.title?.trim() || "محادثة صوتية جديدة";
        await db.insert(conversations).values({ id, userId, title });
        const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
        return rows[0];
      }),

    renameConversation: protectedProcedure
      .input(z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(180) }))
      .mutation(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        await requireOwnedConversation(db, userId, input.conversationId);
        await db.update(conversations).set({ title: input.title, updatedAt: new Date() })
          .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId)));
        return { success: true as const };
      }),

    getConversation: protectedProcedure
      .input(z.object({ conversationId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        const conversation = await requireOwnedConversation(db, userId, input.conversationId);
        const rows = await db.select().from(messages)
          .where(and(eq(messages.conversationId, input.conversationId), eq(messages.userId, userId)))
          .orderBy(messages.createdAt);
        const assetIds = [...new Set(rows.flatMap(row => row.assetId ? [row.assetId] : []))];
        const assets = assetIds.length
          ? await db.select().from(voiceAssets)
              .where(and(inArray(voiceAssets.id, assetIds), eq(voiceAssets.userId, userId)))
          : [];
        const assetById = new Map(assets.map(asset => [asset.id, asset]));
        const conversationMessages = await Promise.all(rows.map(async row => {
            const asset = row.assetId ? assetById.get(row.assetId) : undefined;
            const stored = asset ? await storageGet(asset.storageKey) : null;
            return {
              ...row,
              assetUrl: stored?.url ?? null,
              fileName: asset?.fileName ?? null,
            };
          }));
        return { conversation, messages: conversationMessages };
      }),

    savePreferences: protectedProcedure
      .input(z.object({ language: z.enum(["ar", "en"]), theme: z.enum(["dark", "light"]), saveToCloud: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        await db.insert(userPreferences).values({ userId, ...input }).onDuplicateKeyUpdate({
          set: { language: input.language, theme: input.theme, saveToCloud: input.saveToCloud, updatedAt: new Date() },
        });
        return input;
      }),
  }),

  voice: router({
    connectionStatus: protectedProcedure.query(async () => {
      try {
        await testElevenLabsConnection();
        return { connected: true as const, message: "اتصال ElevenLabs متاح لخادم التطبيق." };
      } catch (error) {
        return { connected: false as const, message: safeElevenLabsError(error) };
      }
    }),

    beginClone: protectedProcedure
      .input(z.object({
        conversationId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        consentConfirmed: z.literal(true),
        fileName: z.string().min(1).max(255),
        audioBase64: z.string().min(100).max(2_000_000),
      }))
      .mutation(async ({ ctx, input }) => {
        await cleanupExpiredClones();
        const userId = getUserId(ctx);
        const db = await requireDb();
        await requireOwnedConversation(db, userId, input.conversationId);
        const audio = decodeAudio(input.audioBase64);
        if (audio.length > CLONE_SAMPLE_LIMIT) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "عينة الصوت المستخرجة أكبر من الحد المسموح." });
        }
        if (audio.length < 2_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "عينة الصوت قصيرة جداً أو فارغة." });
        }

        let temporaryVoiceId: string | null = null;
        let temporaryToken: string | null = null;
        try {
          const created = await createInstantVoiceClone({
            audio,
            fileName: cleanedFileName(input.fileName).replace(/\.[^.]+$/, ".wav"),
            mimeType: "audio/wav",
            name: input.name,
          });
          temporaryVoiceId = created.voiceId;
          const token = randomUUID();
          temporaryToken = token;
          const pending: PendingClone = {
            userId,
            conversationId: input.conversationId,
            voiceId: created.voiceId,
            name: input.name,
            fileName: cleanedFileName(input.fileName).replace(/\.[^.]+$/, ".wav"),
            audio,
            expiresAt: Date.now() + 30 * 60 * 1000,
            consentConfirmed: input.consentConfirmed,
            requiresVerification: created.requiresVerification,
          };
          pendingClones.set(token, pending);
          const preview = await generateSpeech({ voiceId: created.voiceId, text: CLONE_PREVIEW_TEXT });
          return {
            token,
            previewBase64: preview.toString("base64"),
            mimeType: "audio/mpeg",
            expiresAt: pending.expiresAt,
            requiresVerification: pending.requiresVerification,
          };
        } catch (error) {
          // If preview generation failed after the clone was created, remove only this request's temporary voice.
          if (temporaryToken) pendingClones.delete(temporaryToken);
          if (temporaryVoiceId) try { await deleteElevenLabsVoice(temporaryVoiceId); } catch {}
          explainProviderError(error);
        }
      }),

    previewPending: protectedProcedure
      .input(z.object({ token: z.string().uuid(), text: z.string().trim().min(1).max(350) }))
      .mutation(async ({ ctx, input }) => {
        await cleanupExpiredClones();
        const userId = getUserId(ctx);
        const pending = pendingClones.get(input.token);
        if (!pending || pending.userId !== userId || pending.expiresAt <= Date.now()) {
          throw new TRPCError({ code: "NOT_FOUND", message: "انتهت صلاحية معاينة الصوت. أعد استخراج العينة." });
        }
        try {
          const audio = await generateSpeech({ voiceId: pending.voiceId, text: input.text });
          return { previewBase64: audio.toString("base64"), mimeType: "audio/mpeg" };
        } catch (error) { explainProviderError(error); }
      }),

    approveClone: protectedProcedure
      .input(z.object({ token: z.string().uuid(), saveToCloud: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await cleanupExpiredClones();
        const userId = getUserId(ctx);
        const pending = pendingClones.get(input.token);
        if (!pending || pending.userId !== userId || pending.expiresAt <= Date.now()) {
          throw new TRPCError({ code: "NOT_FOUND", message: "انتهت صلاحية معاينة الصوت. أعد استخراج العينة." });
        }
        const db = await requireDb();
        await requireOwnedConversation(db, userId, pending.conversationId);
        let sourceKey: string | null = null;
        let sourceAsset: { key: string; url: string } | null = null;
        let storageWarning = false;
        try {
          if (input.saveToCloud) {
            try {
              sourceAsset = await storagePut(
                `users/${userId}/voices/${randomUUID()}.wav`,
                pending.audio,
                "audio/wav",
              );
              sourceKey = sourceAsset.key;
            } catch {
              storageWarning = true;
              console.warn("[3ZAI] Approved voice saved without its source audio cloud copy.");
            }
          }
          const profileId = randomUUID();
          await db.transaction(async tx => {
            if (sourceAsset) {
              await tx.insert(voiceAssets).values({
                id: randomUUID(),
                userId,
                conversationId: pending.conversationId,
                kind: "source",
                fileName: pending.fileName,
                mimeType: "audio/wav",
                byteLength: pending.audio.length,
                storageKey: sourceAsset!.key,
              });
            }
            await tx.insert(voiceProfiles).values({
              id: profileId,
              userId,
              elevenVoiceId: pending.voiceId,
              name: pending.name,
              sourceAssetKey: sourceKey,
            });
            await tx.insert(messages).values({
              id: randomUUID(),
              userId,
              conversationId: pending.conversationId,
              role: "assistant",
              kind: "event",
              content: `تم اعتماد الصوت «${pending.name}» وحفظه في مكتبتك.`,
              metadata: { voiceProfileId: profileId, consentConfirmed: pending.consentConfirmed },
            });
            await tx.update(conversations).set({ updatedAt: new Date() })
              .where(and(eq(conversations.id, pending.conversationId), eq(conversations.userId, userId)));
          });
          pendingClones.delete(input.token);
          return { id: profileId, voiceId: pending.voiceId, name: pending.name, sourceUrl: sourceAsset?.url ?? null, storageWarning };
        } catch (error) {
          try { await deleteElevenLabsVoice(pending.voiceId); } catch {}
          pendingClones.delete(input.token);
          if (error instanceof TRPCError) throw error;
          console.error("[3ZAI] Failed to persist an approved voice.");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ الصوت المعتمد. أُزيلت النسخة المؤقتة؛ يمكنك إعادة المحاولة." });
        }
      }),

    rejectClone: protectedProcedure
      .input(z.object({ token: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await cleanupExpiredClones();
        const userId = getUserId(ctx);
        const pending = pendingClones.get(input.token);
        if (!pending || pending.userId !== userId) return { deleted: true as const };
        try {
          await deleteElevenLabsVoice(pending.voiceId);
          pendingClones.delete(input.token);
          return { deleted: true as const };
        } catch (error) { explainProviderError(error); }
      }),

    synthesize: protectedProcedure
      .input(z.object({
        conversationId: z.string().uuid(),
        voiceId: z.string().min(1).max(128),
        text: z.string().trim().min(1).max(MAX_TTS_TEXT_CHARS),
        modelId: z.enum(["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"]).default("eleven_multilingual_v2"),
        stability: z.number().min(0).max(1).default(0.45),
        similarityBoost: z.number().min(0).max(1).default(0.8),
        style: z.number().min(0).max(1).default(0),
        speed: z.number().min(0.7).max(1.2).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        await requireOwnedConversation(db, userId, input.conversationId);
        const ownedVoices = await db.select().from(voiceProfiles)
          .where(and(eq(voiceProfiles.userId, userId), eq(voiceProfiles.elevenVoiceId, input.voiceId))).limit(1);
        if (!ownedVoices[0]) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الصوت غير موجود في مكتبتك." });

        let audio: Buffer;
        try {
          audio = await generateSpeech({
            voiceId: input.voiceId,
            text: input.text,
            modelId: input.modelId,
            stability: input.stability,
            similarityBoost: input.similarityBoost,
            style: input.style,
            speed: input.speed,
          });
        } catch (error) { explainProviderError(error); }

        const preferences = await readPreferences(db, userId);
        if (IS_VERCEL && !preferences.saveToCloud && audio!.length > 3_000_000) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "تجاوز الصوت حد استجابة Vercel. قصّر النص أو اختر الحفظ السحابي ثم أعد التوليد.",
          });
        }
        let assetId: string | null = null;
        let savedToCloud = false;
        let audioUrl: string | null = null;
        let assetKey: string | null = null;
        if (preferences.saveToCloud) {
          try {
            const stored = await storagePut(
              `users/${userId}/audio/${input.conversationId}/${randomUUID()}.mp3`,
              audio!,
              "audio/mpeg",
            );
            assetId = randomUUID();
            audioUrl = stored.url;
            assetKey = stored.key;
          } catch {
            console.warn("[3ZAI] Generated audio could not be uploaded; keeping it available locally.");
          }
          savedToCloud = Boolean(assetId && assetKey);
        }

        const messageIds = { user: randomUUID(), assistant: randomUUID() };
        const fileName = `3zai-${Date.now()}.mp3`;
        await db.transaction(async tx => {
          if (assetId && assetKey) {
            await tx.insert(voiceAssets).values({
              id: assetId,
              userId,
              conversationId: input.conversationId,
              kind: "generated",
              fileName,
              mimeType: "audio/mpeg",
              byteLength: audio!.length,
              storageKey: assetKey,
            });
          }
          await tx.insert(messages).values([
            { id: messageIds.user, userId, conversationId: input.conversationId, role: "user", kind: "text", content: input.text },
            {
              id: messageIds.assistant,
              userId,
              conversationId: input.conversationId,
              role: "assistant",
              kind: "audio",
              content: input.text,
              assetId,
              metadata: { fileName, voiceName: ownedVoices[0]!.name, localOnly: !savedToCloud },
            },
          ]);
          await tx.update(conversations).set({ updatedAt: new Date() })
            .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId)));
        });

        return {
          messageId: messageIds.assistant,
          audioUrl,
          audioBase64: savedToCloud ? null : audio!.toString("base64"),
          mimeType: "audio/mpeg",
          fileName,
          savedToCloud,
          storageWarning: preferences.saveToCloud && !savedToCloud,
        };
      }),

    transcribe: protectedProcedure
      .input(z.object({
        conversationId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(128),
        audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64_CHARS),
        languageCode: z.enum(["ar", "en"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = getUserId(ctx);
        const db = await requireDb();
        await requireOwnedConversation(db, userId, input.conversationId);
        const audio = decodeAudio(input.audioBase64);
        if (audio.length > MAX_TRANSCRIPTION_FILE_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: IS_VERCEL
              ? "حجم ملف التفريغ على Vercel لا يتجاوز 3 MB."
              : "حجم ملف التفريغ لا يتجاوز 18 MB.",
          });
        }
        let transcript;
        try {
          transcript = await transcribeAudio({
            audio,
            fileName: cleanedFileName(input.fileName),
            mimeType: input.mimeType,
            languageCode: input.languageCode,
          });
        } catch (error) { explainProviderError(error); }

        const id = randomUUID();
        await db.transaction(async tx => {
          await tx.insert(messages).values({
            id,
            userId,
            conversationId: input.conversationId,
            role: "assistant",
            kind: "transcript",
            content: transcript!.text,
            metadata: {
              languageCode: transcript!.language_code ?? null,
              languageProbability: transcript!.language_probability ?? null,
              words: transcript!.words ?? [],
              duration: transcript!.audio_duration ?? null,
              fileName: cleanedFileName(input.fileName),
            },
          });
          await tx.update(conversations).set({ updatedAt: new Date() })
            .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId)));
        });
        return {
          messageId: id,
          text: transcript!.text,
          languageCode: transcript!.language_code ?? null,
          words: transcript!.words ?? [],
          duration: transcript!.audio_duration ?? null,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
