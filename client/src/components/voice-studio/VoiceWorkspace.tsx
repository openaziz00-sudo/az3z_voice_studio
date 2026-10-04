import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  Activity,
  AudioLines,
  BookOpen,
  Check,
  Cloud,
  Copy,
  Download,
  FileAudio,
  Headphones,
  Languages,
  LoaderCircle,
  LogOut,
  Menu,
  Mic,
  Moon,
  Music2,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { base64AudioUrl, extractFirstTenSeconds, fileToBase64 } from "@/lib/extract-audio";
import type { AppRouter } from "../../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type WorkspaceData = RouterOutputs["workspace"]["bootstrap"];
type VoiceMessage = RouterOutputs["workspace"]["getConversation"]["messages"][number];
type UserProfile = { id: number; name: string | null; email: string | null };
type ComposeMode = "tts" | "clone" | "stt";
type PendingPreview = { token: string; previewUrl: string; name: string; requiresVerification: boolean };

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_TRANSCRIPTION_FILE_BYTES = __IS_VERCEL_DEPLOYMENT__ ? 3_000_000 : 18 * 1024 * 1024;
const MAX_TRANSCRIPTION_FILE_MB = __IS_VERCEL_DEPLOYMENT__ ? 3 : 18;
const MAX_TTS_TEXT_CHARS = __IS_VERCEL_DEPLOYMENT__ ? 2_000 : 5_000;
const TOOL_ITEMS: Array<{ key: string; labelAr: string; labelEn: string; groupAr: string; groupEn: string; available: boolean; icon: LucideIcon }> = [
  { key: "guide", labelAr: "تعليمية وأدلة إرشادية", labelEn: "Guides & tutorials", groupAr: "التعلّم", groupEn: "Learn", available: true, icon: BookOpen },
  { key: "tts", labelAr: "تحويل النص إلى كلام", labelEn: "Text to speech", groupAr: "توليد الصوت", groupEn: "Voice generation", available: true, icon: AudioLines },
  { key: "stt", labelAr: "تحويل الكلام إلى نص", labelEn: "Speech to text", groupAr: "الصوت إلى نص", groupEn: "Speech to text", available: true, icon: FileAudio },
  { key: "clone", labelAr: "استنساخ الصوت", labelEn: "Voice cloning", groupAr: "الأصوات", groupEn: "Voices", available: true, icon: Mic },
  { key: "engine", labelAr: "محرك الكلام", labelEn: "Speech engine", groupAr: "توليد الصوت", groupEn: "Voice generation", available: false, icon: Activity },
  { key: "music", labelAr: "موسيقى", labelEn: "Music", groupAr: "توليد الصوت", groupEn: "Voice generation", available: false, icon: Music2 },
  { key: "dialogue", labelAr: "تحويل النص إلى حوار", labelEn: "Text to dialogue", groupAr: "توليد الصوت", groupEn: "Voice generation", available: false, icon: AudioLines },
  { key: "media", labelAr: "صور وفيديوهات", labelEn: "Images & video", groupAr: "إبداع", groupEn: "Create", available: false, icon: Video },
  { key: "changer", labelAr: "مُغيّر الصوت", labelEn: "Voice changer", groupAr: "تحرير الصوت", groupEn: "Audio editing", available: false, icon: Volume2 },
  { key: "isolation", labelAr: "عازل الصوت", labelEn: "Audio isolation", groupAr: "تحرير الصوت", groupEn: "Audio editing", available: false, icon: Headphones },
  { key: "dubbing", labelAr: "الدبلجة", labelEn: "Dubbing", groupAr: "تحرير الصوت", groupEn: "Audio editing", available: false, icon: Languages },
  { key: "sfx", labelAr: "مؤثرات صوتية", labelEn: "Sound effects", groupAr: "إبداع", groupEn: "Create", available: false, icon: Sparkles },
  { key: "alignment", labelAr: "المحاذاة القسرية", labelEn: "Forced alignment", groupAr: "تحرير الصوت", groupEn: "Audio editing", available: false, icon: Activity },
  { key: "concepts", labelAr: "المفاهيم", labelEn: "Concepts", groupAr: "التعلّم", groupEn: "Learn", available: false, icon: BookOpen },
  { key: "stream", labelAr: "فهم البث الصوتي", labelEn: "Streaming audio", groupAr: "تقنيات", groupEn: "Technology", available: false, icon: AudioLines },
  { key: "latency", labelAr: "فهم زمن الاستجابة", labelEn: "Latency", groupAr: "تقنيات", groupEn: "Technology", available: false, icon: Activity },
];

const COPY = {
  ar: {
    newChat: "محادثة جديدة", search: "ابحث في المحادثات…", history: "المحادثات", library: "مكتبة الأصوات", tools: "الأدوات", settings: "الإعدادات", signOut: "تسجيل الخروج", ready: "استوديو الصوت جاهز", workspace: "مساحة العمل", noChats: "لا توجد محادثات مطابقة", welcomeTitle: "ما الصوت الذي تريد أن تصنعه؟", welcomeText: "اكتب النص أو الفكرة، اختر صوتاً من مكتبتك، وسنحوّلها إلى مقطع صوتي قابل للاستماع والتنزيل.", startClone: "استنسخ صوتاً من فيديو", startTranscript: "حوّل ملفاً صوتياً إلى نص", noVoices: "ابدأ باستنساخ صوتك", noVoicesText: "ارفع فيديو أو تسجيلاً تملك حق استخدامه. سنستخرج أول 10 ثوانٍ محلياً قبل إرسال العينة للاستنساخ.", compose: "النص أو الموضوع الذي تريد أن ينطقه الصوت…", generate: "ولّد الصوت", generating: "جارٍ توليد الصوت…", chooseVoice: "اختر صوتاً", noVoiceSelected: "استنسخ صوتاً أولاً", textTooShort: "اكتب نصاً قبل التوليد.", cloneTitle: "استنساخ صوت", cloneHint: "ارفع ملف فيديو أو صوت؛ سنعالج أول 10 ثوانٍ فقط.", chooseFile: "اختيار فيديو أو صوت", processing: "استخراج الصوت محلياً…", sampleReady: "عينة أول 10 ثوانٍ — استمع قبل المتابعة", voiceName: "اسم الصوت في مكتبتك", consent: "لدي إذن باستخدام هذا التسجيل لاستنساخ الصوت.", privateSample: "يتم استخراج العينة داخل المتصفح. لن تُرسل إلى ElevenLabs إلا عند طلب الاستنساخ.", cloneAction: "استنسخ واسمع المعاينة", cloning: "جارٍ استنساخ الصوت وتجهيز معاينة…", previewTitle: "معاينة مؤقتة — لم يُحفظ الصوت بعد", previewHint: "استمع إلى النتيجة. لن يظهر الصوت في مكتبتك إلا بعد موافقتك.", previewText: "هذه معاينة مؤقتة للصوت. استمع إليها، ثم اعتمد الصوت إذا كنت راضياً.", previewAgain: "أعد توليد المعاينة", approve: "أوافق — احفظ الصوت", rejecting: "جارٍ حذف الصوت…", reject: "لا، احذف الصوت", verifiedWarning: "يتطلب الصوت تحققاً إضافياً في حساب ElevenLabs؛ قد لا يعمل حتى إكمال ذلك التحقق.", transcriptTitle: "تحويل الكلام إلى نص", transcriptHint: "ارفع ملفاً صوتياً أو فيديو صغيراً (حتى {limit} ميغابايت). سيُرسل إلى ElevenLabs للتفريغ.", transcribe: "حوّل إلى نص", transcribing: "جارٍ التفريغ…", selectAudio: "اختيار ملف صوتي أو فيديو", textCopied: "تم نسخ النص.", copy: "نسخ النص", cloud: "الحفظ السحابي", local: "محلي — تنزيل على جهازك", selectModel: "نموذج الصوت", options: "ضبط الصوت", stability: "الثبات", similarity: "التشابه", speed: "السرعة", guide: "دليل الاستخدام", guideStep1: "1. أنشئ محادثة، ثم استنسخ صوتاً تملك إذناً باستخدامه.", guideStep2: "2. استمع للمعاينة المؤقتة واعتمد الصوت فقط إذا وافقت عليه.", guideStep3: "3. اكتب النص المرغوب واختر الصوت والنموذج ثم ولّد المقطع.", guideStep4: "4. اختر الحفظ السحابي لمزامنة الملف، أو المحلي لتنزيله على جهازك.", apiTitle: "اتصال ElevenLabs", apiCheck: "اختبر الاتصال", connected: "متصل بخادم التطبيق", disconnected: "تعذر الاتصال", language: "اللغة", theme: "المظهر", dark: "داكن", light: "فاتح", saveMode: "مكان حفظ الصوت", account: "الحساب", saving: "جارٍ الحفظ…", close: "إغلاق", available: "متاح", comingSoon: "قريباً", audioOnlyNotice: "بعد إعادة تحميل الصفحة، يتوفر تشغيل الصوت المحفوظ سحابياً فقط. نزّل المقاطع المحلية قبل مغادرة هذه الصفحة.", loadError: "تعذر تحميل مساحة العمل.", uploadTooLarge: "الحد الأقصى للملف الصوتي {limit} ميغابايت.", connectionPending: "جارٍ فحص الاتصال…", searchTitle: "نتائج البحث", generatedAudio: "مقطع صوتي مولّد", transcript: "تفريغ الكلام", assistantEvent: "تحديث مساحة العمل", openTools: "عرض الأدوات", sourceConsent: "استخدم فقط صوتاً تملكه أو لديك إذن صريح باستنساخه.", docs: "وثائق ElevenLabs الرسمية", signOutAsk: "تسجيل الخروج من 3ZAI؟", openChat: "فتح المحادثة", more: "المزيد", selectAudioFirst: "اختر ملفاً أولاً.", chars: "حرف", menu: "القائمة", activity: "نشاط حديث", preferencesSaved: "حُفظت الإعدادات.", profile: "ملف المستخدم", noConnection: "الخادم غير متصل حالياً.", copyFailed: "لم يتمكن المتصفح من نسخ النص.", draft: "مسودة", temporary: "مؤقت", deleteDone: "حُذفت المعاينة من ElevenLabs.", cloneSaved: "تم اعتماد الصوت وحفظه في المكتبة.", cloneStorageWarning: "تم اعتماد الصوت، لكن تعذّر رفع عينة المصدر للسحابة؛ الصوت يعمل في المكتبة، والعينة لن تتوفر سحابياً.", downloaded: "بدأ تنزيل المقطع.", uploadFromHere: "رفع ملف", pendingExpired: "انتهت صلاحية المعاينة؛ ابدأ من جديد.", untitled: "محادثة صوتية جديدة", localNotSaved: "المقطع غير موجود على هذا الجهاز بعد الآن", connectionHelp: "الفحص لا يولّد صوتاً ولا يستهلك رصيد التوليد.", file: "الملف", storageNote: "النصوص وبيانات المحادثة تحفظ في مساحة حسابك. ملفات الصوت تحفظ سحابياً فقط عند اختيار ذلك.", accountNote: "الجلسة مرتبطة بتسجيل دخول Manus.", libraryEmpty: "لم تحفظ أي صوت بعد.", verified: "يتطلب تحققاً", processingFile: "معالجة الملف…", remainingSeconds: "أول 10 ثوانٍ", noResults: "لا توجد نتائج.", audioInput: "ملف صوت/فيديو", previewPlayback: "تشغيل المعاينة", promptInput: "النص المراد تحويله", chatHeading: "مساحة توليد الصوت", newSession: "جلسة جديدة", dragNotice: "استخرج العينة · راجعها · ثم قرر", characterLimit: "حتى {limit} حرف", security: "اعتماد الخادم لا يظهر في المتصفح.", clearFile: "إزالة الملف", outputSaved: "حُفظ الصوت سحابياً.", storageWarning: "أُنتج الصوت، لكن تعذّر رفعه للسحابة. نزّله محلياً قبل مغادرة الصفحة.", outputLocal: "الصوت جاهز للتنزيل المحلي.", errorTitle: "حدث خطأ", cancel: "إلغاء", voiceCreated: "تم إعداد معاينة الصوت.", chooseVoiceFirst: "اختر صوتاً معتمداً من المكتبة.", inputLanguage: "لغة التفريغ", details: "توقيت الكلمات", fileName: "اسم الملف", preferences: "تفضيلاتك", voiceNotice: "استنساخ صوت الآخرين يتطلب إذناً منهم.", sidebarClose: "إغلاق القائمة", sectionTools: "الأدوات الصوتية", autoSave: "حفظ إعداداتي تلقائياً", localOnly: "محفوظ محلياً", cloudOnly: "محفوظ سحابياً", dateToday: "اليوم", openSettings: "فتح الإعدادات", closeDialog: "إغلاق النافذة", dropFile: "اختر ملفاً من جهازك", settingsSaved: "تم تحديث إعدادات الحساب.", enterName: "أدخل اسماً للصوت.", agreeFirst: "أكّد امتلاكك الإذن قبل الاستنساخ.", selectVoice: "اختر صوتاً معتمداً", transcriptDone: "اكتمل التفريغ.", audioSaved: "تم حفظ سجل التوليد.", help: "مساعدة", pendingOnly: "معاينة غير معتمدة", appSubtitle: "استوديو الصوت", userMenu: "قائمة الحساب", soonDescription: "هذه الأداة غير موصولة في هذا الإصدار.", docsOpen: "فتح الوثائق", beta: "نسخة أولية", outputLabel: "النتيجة الصوتية", status: "الحالة", textLength: "طول النص", setting: "إعداد", noMessages: "لم تبدأ هذه المحادثة بعد.", waitingVoice: "اختر صوتاً أو استنسخ صوتاً جديداً للبدء.", testing: "فحص آمن للاتصال…", plan: "الخطة", currentUser: "المستخدم الحالي", createFirst: "إنشاء محادثة", featuredTools: "الأدوات الأساسية", serviceSettings: "اتصال الخدمة", settingDescription: "تحكم باللغة والثيم ومكان حفظ ملفات الصوت.", cloneFileName: "عينة WAV من الفيديو", uploadNote: "الفيديو الأصلي لا يغادر جهازك أثناء قص العينة.", previewGenerated: "تم توليد معاينة مؤقتة.", rejectFailed: "تعذر حذف النسخة المؤقتة؛ أعد المحاولة.", sessionExpired: "المعاينة صالحة لمدة 30 دقيقة.", approvalGate: "لا يُعتمد الصوت أو يُحفظ في المكتبة دون ضغط زر الموافقة.", transcriptionWords: "كلمة", clickToStart: "اختر إحدى الأدوات للبدء.", noVoiceProfile: "لم يُعتمد صوت بعد.", modelHelp: "اختر نموذجاً متعدد اللغات أو منخفض الاستجابة.", voiceSettingsSaved: "تُحفظ إعدادات الصوت على مستوى كل طلب.", playbackUnavailable: "لا يتوفر ملف الصوت في سجل هذه الجلسة.", lastUsed: "آخر استخدام", operationFailed: "تعذر إكمال العملية.", headingLibrary: "أصواتك المعتمدة", explainTools: "الميزات المتاحة الآن", poweredBy: "مدعوم من ElevenLabs", personalSpace: "مساحتك الشخصية", navHome: "الاستوديو", usingLocal: "الحفظ المحلي لا يرفع الصوت إلى السحابة.", subtitle: "الصوت يولّد عند الطلب، لا يرد بنص دردشة آلي.", promptLabel: "ما الذي تريد أن يقوله الصوت؟", selectedVideo: "الملف المختار", videoInput: "الفيديو أو التسجيل", recording: "عينة التسجيل", readyToClone: "العينة جاهزة للاستنساخ.", previewWillExpire: "ستُحذف النسخة المؤقتة تلقائياً بعد 30 دقيقة.", docsIntro: "هذه الأدوات تظهر هنا كتجربة أولية؛ ما عدا TTS وSTT والاستنساخ والدليل، لم تُوصل بعد.", regenerate: "إعادة التوليد", download: "تنزيل", words: "الكلمات", at: "عند", fileTooLong: "الملف كبير جداً.", chat: "المحادثة", ttsMode: "توليد الكلام", cloneMode: "استنساخ صوت", sttMode: "تفريغ الكلام", controlEnter: "Ctrl/⌘ + Enter للتوليد", previewSample: "استمع إلى عينة الصوت", saveAfterApproval: "يحفظ الملف الصوتي فقط بعد اعتمادك للصوت.", welcomeSmall: "من الفكرة إلى الصوت، في مساحة واحدة.", hide: "إخفاء", tryAgain: "حاول مجدداً", profileInitial: "مستخدم", cloudSaved: "مزامنة سحابية مفعّلة", localSaved: "تنزيل محلي", promptMax: "الحد {limit} حرف", noTranscript: "لا يوجد نص تفريغ بعد.", extractedSize: "حجم العينة", signInAgain: "أعد تسجيل الدخول وحاول مرة أخرى.", sampleSent: "سترسل العينة الصوتية فقط إلى ElevenLabs."
  },
  en: {
    newChat: "New conversation", search: "Search conversations…", history: "Conversations", library: "Voice library", tools: "Tools", settings: "Settings", signOut: "Sign out", ready: "Voice studio is ready", workspace: "Workspace", noChats: "No matching conversations", welcomeTitle: "What would you like to create?", welcomeText: "Write the text or idea, choose one of your voices, and generate an audio clip you can play and download.", startClone: "Clone a voice from video", startTranscript: "Transcribe an audio file", noVoices: "Start by cloning a voice", noVoicesText: "Upload a video or recording you have permission to use. We extract its first 10 seconds locally before sending the sample for cloning.", compose: "Text or topic for your voice to speak…", generate: "Generate speech", generating: "Generating audio…", chooseVoice: "Choose a voice", noVoiceSelected: "Clone a voice first", textTooShort: "Write some text before generating.", cloneTitle: "Clone a voice", cloneHint: "Upload a video or audio file; only its first 10 seconds are processed.", chooseFile: "Choose video or audio", processing: "Extracting audio locally…", sampleReady: "First 10-second sample — listen before continuing", voiceName: "Name in your library", consent: "I have permission to use this recording for voice cloning.", privateSample: "The sample is extracted in your browser. It is sent to ElevenLabs only when you request cloning.", cloneAction: "Clone and preview", cloning: "Cloning voice and preparing preview…", previewTitle: "Temporary preview — voice is not saved yet", previewHint: "Listen to the result. The voice enters your library only after you approve it.", previewText: "This is a temporary voice preview. Listen, then approve it if you are satisfied.", previewAgain: "Generate another preview", approve: "Approve and save voice", rejecting: "Deleting temporary voice…", reject: "No, delete it", verifiedWarning: "This voice requires additional verification in ElevenLabs and may not work until verified.", transcriptTitle: "Speech to text", transcriptHint: "Upload an audio or small video file (up to {limit} MB). It will be sent to ElevenLabs for transcription.", transcribe: "Transcribe", transcribing: "Transcribing…", selectAudio: "Choose audio or video", textCopied: "Text copied.", copy: "Copy text", cloud: "Cloud storage", local: "Local — download to this device", selectModel: "Speech model", options: "Voice controls", stability: "Stability", similarity: "Similarity", speed: "Speed", guide: "Quick guide", guideStep1: "1. Create a conversation, then clone a voice you have permission to use.", guideStep2: "2. Listen to the temporary preview; save it only if you approve.", guideStep3: "3. Write your text, select a voice and model, then generate the clip.", guideStep4: "4. Choose cloud storage to sync audio, or local to download it.", apiTitle: "ElevenLabs connection", apiCheck: "Test connection", connected: "Connected to the app server", disconnected: "Connection unavailable", language: "Language", theme: "Theme", dark: "Dark", light: "Light", saveMode: "Audio storage", account: "Account", saving: "Saving…", close: "Close", available: "Available", comingSoon: "Coming soon", audioOnlyNotice: "After reload, only cloud-saved audio is playable here. Download local clips before leaving this page.", loadError: "Could not load your workspace.", uploadTooLarge: "Audio upload limit is {limit} MB.", connectionPending: "Checking connection…", searchTitle: "Search results", generatedAudio: "Generated audio clip", transcript: "Speech transcript", assistantEvent: "Workspace update", openTools: "Browse tools", sourceConsent: "Only use a voice you own or have explicit permission to clone.", docs: "Official ElevenLabs docs", signOutAsk: "Sign out of 3ZAI?", openChat: "Open conversation", more: "More", selectAudioFirst: "Choose a file first.", chars: "chars", menu: "Menu", activity: "Recent activity", preferencesSaved: "Preferences saved.", profile: "User profile", noConnection: "The service is not connected.", copyFailed: "Your browser could not copy the text.", draft: "Draft", temporary: "Temporary", deleteDone: "Temporary preview deleted from ElevenLabs.", cloneSaved: "Voice approved and saved to your library.", cloneStorageWarning: "Voice approved, but the source sample could not be uploaded; the approved voice works, but the sample is not available in cloud storage.", downloaded: "Download started.", uploadFromHere: "Upload file", pendingExpired: "The preview expired; start again.", untitled: "New voice conversation", localNotSaved: "This audio is no longer on this device", verified: "Verification required", processingFile: "Processing file…", remainingSeconds: "First 10 seconds", noResults: "No results.", audioInput: "Audio/video file", previewPlayback: "Play preview", promptInput: "Text to convert", chatHeading: "Voice generation workspace", newSession: "New session", dragNotice: "Extract · review · decide", characterLimit: "Up to {limit} characters", security: "The server credential never reaches the browser.", clearFile: "Remove file", outputSaved: "Audio saved to cloud.", storageWarning: "Audio was generated but could not be uploaded. Download it before leaving this page.", outputLocal: "Audio is ready for local download.", errorTitle: "Something went wrong", cancel: "Cancel", voiceCreated: "Voice preview is ready.", chooseVoiceFirst: "Choose an approved voice from your library.", inputLanguage: "Transcript language", details: "Word timing", fileName: "File name", preferences: "Your preferences", voiceNotice: "Clone another person's voice only with their permission.", sidebarClose: "Close navigation", sectionTools: "Voice tools", autoSave: "Save my preferences automatically", localOnly: "Local only", cloudOnly: "Cloud saved", dateToday: "Today", openSettings: "Open settings", closeDialog: "Close dialog", dropFile: "Choose a file from your device", settingsSaved: "Account settings updated.", enterName: "Name your voice.", agreeFirst: "Confirm permission before cloning.", selectVoice: "Select an approved voice", transcriptDone: "Transcription complete.", audioSaved: "Generation saved to history.", help: "Help", pendingOnly: "Unapproved preview", appSubtitle: "Voice studio", userMenu: "Account menu", soonDescription: "This tool is not connected in this version.", docsOpen: "Open documentation", beta: "Early access", outputLabel: "Audio result", status: "Status", textLength: "Text length", setting: "Setting", noMessages: "This conversation has not started yet.", waitingVoice: "Choose or clone a voice to begin.", testing: "Testing the connection…", plan: "Plan", currentUser: "Current user", createFirst: "Create conversation", featuredTools: "Core tools", serviceSettings: "Service connection", settingDescription: "Set language, theme, and audio storage preference.", cloneFileName: "WAV sample from video", uploadNote: "The original video stays on your device while the sample is trimmed.", previewGenerated: "Temporary preview generated.", rejectFailed: "Could not delete the temporary voice; try again.", sessionExpired: "The preview is available for 30 minutes.", approvalGate: "A voice is not approved or added to your library until you press Approve.", transcriptionWords: "words", clickToStart: "Choose a tool to begin.", noVoiceProfile: "No approved voices yet.", modelHelp: "Choose a multilingual or low-latency model.", voiceSettingsSaved: "Voice controls apply to each generation.", playbackUnavailable: "Audio is not available in this session history.", lastUsed: "Last used", operationFailed: "Could not complete the operation.", headingLibrary: "Your approved voices", explainTools: "Available now", poweredBy: "Powered by ElevenLabs", personalSpace: "Your personal space", navHome: "Studio", usingLocal: "Local mode does not upload audio to cloud storage.", subtitle: "Audio is generated on demand, not as an automatic text-chat reply.", promptLabel: "What should the voice say?", selectedVideo: "Selected file", videoInput: "Video or recording", recording: "Recording sample", readyToClone: "Sample is ready to clone.", previewWillExpire: "The temporary clone is removed automatically after 30 minutes.", docsIntro: "This is an early release; only TTS, STT, cloning, and the guide are connected.", regenerate: "Regenerate", download: "Download", words: "Words", at: "at", fileTooLong: "File is too large.", chat: "Conversation", ttsMode: "Generate speech", cloneMode: "Clone voice", sttMode: "Transcribe", controlEnter: "Ctrl/⌘ + Enter to generate", previewSample: "Listen to the sample", saveAfterApproval: "The audio sample is saved only after you approve the voice.", welcomeSmall: "From idea to audio, in one place.", hide: "Hide", tryAgain: "Try again", profileInitial: "User", cloudSaved: "Cloud sync enabled", localSaved: "Local download", promptMax: "{limit} character limit", noTranscript: "No transcript yet.", extractedSize: "Sample size", signInAgain: "Sign in again and retry.", connectionHelp: "This check does not generate audio or use generation credits.", file: "File", storageNote: "Text and conversation metadata stay in your account. Audio files are saved to cloud only when selected.", accountNote: "This session uses Manus sign-in.", libraryEmpty: "No approved voices yet.", sampleSent: "Only the audio sample is sent to ElevenLabs."
  },
} as const;

type CopyText = { [Key in keyof typeof COPY.ar]: string };

export default function VoiceWorkspace({ user, onLogout }: { user: UserProfile; onLogout: () => Promise<void> }) {
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [themeChoice, setThemeChoice] = useState<"dark" | "light">("dark");
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    try { return localStorage.getItem(`3zai:active:${user.id}`); } catch { return null; }
  });
  const [mode, setMode] = useState<ComposeMode>("tts");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [modelId, setModelId] = useState<"eleven_multilingual_v2" | "eleven_flash_v2_5" | "eleven_turbo_v2_5">("eleven_multilingual_v2");
  const [text, setText] = useState("");
  const [stability, setStability] = useState(0.45);
  const [similarity, setSimilarity] = useState(0.8);
  const [speed, setSpeed] = useState(1);
  const [showVoiceControls, setShowVoiceControls] = useState(false);
  const [localAudioUrls, setLocalAudioUrls] = useState<Record<string, string>>({});
  const [cloneSource, setCloneSource] = useState<File | null>(null);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [hasCloneConsent, setHasCloneConsent] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [previewText, setPreviewText] = useState("هذه معاينة مؤقتة للصوت. استمع إليها، ثم اعتمد الصوت إذا كنت راضياً.");
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [expandedWords, setExpandedWords] = useState<string | null>(null);
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null);
  const localAudioUrlsRef = useRef<Record<string, string>>({});
  const sampleUrlRef = useRef<string | null>(null);
  const pendingPreviewUrlRef = useRef<string | null>(null);

  const workspace = trpc.workspace.bootstrap.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const createConversation = trpc.workspace.createConversation.useMutation({
    onSuccess: async conversation => {
      if (!conversation) return;
      setActiveConversationId(conversation.id);
      await utils.workspace.bootstrap.invalidate();
      await utils.workspace.getConversation.invalidate({ conversationId: conversation.id });
    },
    onError: error => toast.error(error.message || COPY[language].operationFailed),
  });
  const renameConversation = trpc.workspace.renameConversation.useMutation();
  const activeConversation = workspace.data?.conversations.find(item => item.id === activeConversationId);
  const activeIdForQuery = activeConversationId ?? ZERO_UUID;
  const conversation = trpc.workspace.getConversation.useQuery(
    { conversationId: activeIdForQuery },
    { enabled: Boolean(activeConversationId), retry: false, refetchOnWindowFocus: false },
  );
  const savePreferences = trpc.workspace.savePreferences.useMutation({
    onSuccess: () => { void utils.workspace.bootstrap.invalidate(); },
    onError: error => toast.error(error.message || COPY[language].operationFailed),
  });
  const connection = trpc.voice.connectionStatus.useQuery(undefined, { enabled: settingsOpen, retry: false, refetchOnWindowFocus: false });
  const beginClone = trpc.voice.beginClone.useMutation();
  const previewPending = trpc.voice.previewPending.useMutation();
  const approveClone = trpc.voice.approveClone.useMutation();
  const rejectClone = trpc.voice.rejectClone.useMutation();
  const synthesize = trpc.voice.synthesize.useMutation();
  const transcribe = trpc.voice.transcribe.useMutation();
  const initialConversationCreated = useRef(false);
  const t: CopyText = COPY[language];
  const voiceRows = workspace.data?.voices ?? [];
  const chatRows = workspace.data?.conversations ?? [];
  const visibleChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return query ? chatRows.filter(row => row.title.toLocaleLowerCase().includes(query)) : chatRows;
  }, [chatRows, searchQuery]);
  const messageRows: VoiceMessage[] = conversation.data?.messages ?? [];

  useEffect(() => { localAudioUrlsRef.current = localAudioUrls; }, [localAudioUrls]);
  useEffect(() => { sampleUrlRef.current = sampleUrl; }, [sampleUrl]);
  useEffect(() => { pendingPreviewUrlRef.current = pendingPreview?.previewUrl ?? null; }, [pendingPreview?.previewUrl]);
  useEffect(() => {
    const scroller = messagesScrollerRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [conversation.dataUpdatedAt, messageRows.length, synthesize.isPending, transcribe.isPending]);

  useEffect(() => {
    if (!workspace.data) return;
    const prefs = workspace.data.preferences;
    setLanguage(prefs.language);
    setThemeChoice(prefs.theme);
    setSaveToCloud(prefs.saveToCloud);
  }, [workspace.data]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    if (themeChoice !== theme) toggleTheme?.();
  }, [themeChoice, theme, toggleTheme]);

  useEffect(() => {
    if (!workspace.data || activeConversationId || chatRows.length === 0) return;
    setActiveConversationId(chatRows[0]!.id);
  }, [workspace.data, activeConversationId, chatRows]);

  useEffect(() => {
    if (!workspace.isFetched || !workspace.data || chatRows.length > 0 || initialConversationCreated.current || createConversation.isPending) return;
    initialConversationCreated.current = true;
    createConversation.mutate({ title: t.untitled });
  }, [workspace.isFetched, workspace.data, chatRows.length, createConversation.isPending]);

  useEffect(() => {
    if (!activeConversationId) return;
    try { localStorage.setItem(`3zai:active:${user.id}`, activeConversationId); } catch { /* storage may be disabled */ }
  }, [activeConversationId, user.id]);

  useEffect(() => {
    if (!selectedVoiceId && voiceRows.length > 0) setSelectedVoiceId(voiceRows[0]!.elevenVoiceId);
    if (selectedVoiceId && voiceRows.length > 0 && !voiceRows.some(voice => voice.elevenVoiceId === selectedVoiceId)) {
      setSelectedVoiceId(voiceRows[0]!.elevenVoiceId);
    }
  }, [voiceRows, selectedVoiceId]);

  useEffect(() => () => {
    const urls = new Set([
      ...Object.values(localAudioUrlsRef.current),
      sampleUrlRef.current,
      pendingPreviewUrlRef.current,
    ].filter((url): url is string => Boolean(url)));
    urls.forEach(URL.revokeObjectURL);
  }, []);

  const persistPreferences = (next: { language: "ar" | "en"; theme: "dark" | "light"; saveToCloud: boolean }) => {
    savePreferences.mutate(next);
  };

  const changeLanguage = (next: "ar" | "en") => {
    setLanguage(next);
    persistPreferences({ language: next, theme: themeChoice, saveToCloud });
  };

  const changeTheme = () => {
    const next = themeChoice === "dark" ? "light" : "dark";
    setThemeChoice(next);
    persistPreferences({ language, theme: next, saveToCloud });
  };

  const changeCloudPreference = (next: boolean) => {
    setSaveToCloud(next);
    persistPreferences({ language, theme: themeChoice, saveToCloud: next });
  };

  const createNewConversation = () => createConversation.mutate({ title: t.untitled });
  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    setMobileNavOpen(false);
  };

  const clearSample = () => {
    setCloneSource(null);
    setSampleFile(null);
    setExtractProgress(0);
    setHasCloneConsent(false);
    setVoiceName("");
    setSampleUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const onCloneFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
      toast.error(t.fileTooLong);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(t.fileTooLong);
      return;
    }
    clearSample();
    setCloneSource(file);
    setExtracting(true);
    setExtractProgress(0.02);
    try {
      const extracted = await extractFirstTenSeconds(file, progress => setExtractProgress(progress));
      setSampleFile(extracted);
      setSampleUrl(URL.createObjectURL(extracted));
      toast.success(t.readyToClone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.operationFailed);
      clearSample();
    } finally {
      setExtracting(false);
    }
  };

  const handleBeginClone = async () => {
    if (!activeConversationId || !sampleFile) return toast.error(t.selectAudioFirst);
    if (!voiceName.trim()) return toast.error(t.enterName);
    if (!hasCloneConsent) return toast.error(t.agreeFirst);
    try {
      const result = await beginClone.mutateAsync({
        conversationId: activeConversationId,
        name: voiceName.trim(),
        consentConfirmed: true,
        fileName: sampleFile.name,
        audioBase64: await fileToBase64(sampleFile),
      });
      setPendingPreview({
        token: result.token,
        previewUrl: base64AudioUrl(result.previewBase64, result.mimeType),
        name: voiceName.trim(),
        requiresVerification: result.requiresVerification,
      });
      setPreviewText("هذه معاينة مؤقتة للصوت. استمع إليها، ثم اعتمد الصوت إذا كنت راضياً.");
      toast.success(t.voiceCreated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.operationFailed);
    }
  };

  const handlePreviewAgain = async () => {
    if (!pendingPreview) return;
    try {
      const result = await previewPending.mutateAsync({ token: pendingPreview.token, text: previewText.trim() });
      const nextUrl = base64AudioUrl(result.previewBase64, result.mimeType);
      setPendingPreview(current => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return current ? { ...current, previewUrl: nextUrl } : current;
      });
      toast.success(t.previewGenerated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.pendingExpired);
    }
  };

  const handleApprove = async () => {
    if (!pendingPreview) return;
    try {
      const saved = await approveClone.mutateAsync({ token: pendingPreview.token, saveToCloud });
      URL.revokeObjectURL(pendingPreview.previewUrl);
      setPendingPreview(null);
      setSelectedVoiceId(saved.voiceId);
      await Promise.all([
        utils.workspace.bootstrap.invalidate(),
        activeConversationId ? utils.workspace.getConversation.invalidate({ conversationId: activeConversationId }) : Promise.resolve(),
      ]);
      if (saved.storageWarning) toast.warning(t.cloneStorageWarning);
      else toast.success(t.cloneSaved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.operationFailed);
    }
  };

  const handleReject = async () => {
    if (!pendingPreview) return;
    try {
      await rejectClone.mutateAsync({ token: pendingPreview.token });
      URL.revokeObjectURL(pendingPreview.previewUrl);
      setPendingPreview(null);
      clearSample();
      toast.success(t.deleteDone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.rejectFailed);
    }
  };

  const handleGenerate = async () => {
    if (!activeConversationId) return;
    if (!text.trim()) return toast.error(t.textTooShort);
    if (!selectedVoiceId) {
      setMode("clone");
      return toast.error(t.chooseVoiceFirst);
    }
    try {
      const result = await synthesize.mutateAsync({
        conversationId: activeConversationId,
        voiceId: selectedVoiceId,
        text: text.trim(),
        modelId,
        stability,
        similarityBoost: similarity,
        speed,
      });
      if (result.audioBase64) {
        const objectUrl = base64AudioUrl(result.audioBase64, result.mimeType);
        setLocalAudioUrls(current => ({ ...current, [result.messageId]: objectUrl }));
      }
      if (activeConversation?.title === t.untitled) {
        const title = text.trim().replace(/\s+/g, " ").slice(0, 52);
        if (title) renameConversation.mutate({ conversationId: activeConversationId, title });
      }
      setText("");
      await Promise.all([
        utils.workspace.getConversation.invalidate({ conversationId: activeConversationId }),
        utils.workspace.bootstrap.invalidate(),
      ]);
      if (result.storageWarning) toast.warning(t.storageWarning);
      else toast.success(result.savedToCloud ? t.outputSaved : t.outputLocal);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.operationFailed);
    }
  };

  const handleTranscription = async () => {
    if (!activeConversationId || !transcriptFile) return toast.error(t.selectAudioFirst);
    if (transcriptFile.size > MAX_TRANSCRIPTION_FILE_BYTES) return toast.error(t.uploadTooLarge.replace("{limit}", String(MAX_TRANSCRIPTION_FILE_MB)));
    try {
      const result = await transcribe.mutateAsync({
        conversationId: activeConversationId,
        fileName: transcriptFile.name,
        mimeType: transcriptFile.type || "application/octet-stream",
        audioBase64: await fileToBase64(transcriptFile),
        languageCode: language,
      });
      setTranscriptFile(null);
      await Promise.all([
        utils.workspace.getConversation.invalidate({ conversationId: activeConversationId }),
        utils.workspace.bootstrap.invalidate(),
      ]);
      toast.success(t.transcriptDone);
      setExpandedWords(result.messageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.operationFailed);
    }
  };

  const refreshConnection = async () => {
    const result = await connection.refetch();
    if (result.data?.connected) toast.success(t.connected);
    else toast.error(result.data?.message || t.noConnection);
  };

  const downloadAudio = async (source: string | null, fileName: string) => {
    if (!source) return toast.error(t.localNotSaved);
    try {
      const response = await fetch(source, { credentials: "include" });
      if (!response.ok) throw new Error("audio fetch failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(t.downloaded);
    } catch {
      toast.error(t.operationFailed);
    }
  };

  const copyText = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t.textCopied);
    } catch { toast.error(t.copyFailed); }
  };

  const onKeyDownComposer = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleGenerate();
    }
  };

  if (workspace.isLoading) {
    return <main className="workspace-loading" dir={language === "ar" ? "rtl" : "ltr"}><LoaderCircle className="spin" size={22} /> {t.ready}</main>;
  }
  if (workspace.error || !workspace.data) {
    return <main className="workspace-loading" dir={language === "ar" ? "rtl" : "ltr"}><div className="error-card"><p>{workspace.error?.message || t.loadError}</p><button className="secondary-button" onClick={() => void workspace.refetch()}>{t.tryAgain}</button></div></main>;
  }

  return (
    <div className="studio-shell" dir={language === "ar" ? "rtl" : "ltr"}>
      {mobileNavOpen ? <button className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-label={t.sidebarClose} /> : null}
      <aside className={`studio-sidebar ${mobileNavOpen ? "studio-sidebar--open" : ""}`} aria-label={t.workspace}>
        <div className="sidebar-top">
          <BrandMark size={34} />
          <button className="icon-button mobile-only" onClick={() => setMobileNavOpen(false)} aria-label={t.sidebarClose}><X size={18} /></button>
        </div>
        <button className="new-chat-button" onClick={createNewConversation} disabled={createConversation.isPending}>
          {createConversation.isPending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          <span>{t.newChat}</span>
        </button>
        <label className="search-box">
          <Search size={15} />
          <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />
          {searchQuery ? <button type="button" onClick={() => setSearchQuery("")} aria-label={t.clearFile}><X size={14} /></button> : null}
        </label>
        <div className="sidebar-section-label">{t.history}</div>
        <nav className="conversation-list" aria-label={t.history}>
          {visibleChats.length ? visibleChats.map(chat => (
            <button key={chat.id} className={`conversation-link ${chat.id === activeConversationId ? "is-active" : ""}`} onClick={() => selectConversation(chat.id)}>
              <span className="conversation-link-icon"><AudioLines size={15} /></span>
              <span className="conversation-link-copy"><span className="conversation-link-title">{chat.title}</span><span className="conversation-link-date">{new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(chat.updatedAt))}</span></span>
            </button>
          )) : <p className="sidebar-empty">{t.noChats}</p>}
        </nav>
        <div className="sidebar-section-label sidebar-section-spaced">{t.library}</div>
        <div className="voice-library-list">
          {voiceRows.length ? voiceRows.map(voice => (
            <button key={voice.id} className={`voice-library-item ${selectedVoiceId === voice.elevenVoiceId ? "is-selected" : ""}`} onClick={() => { setSelectedVoiceId(voice.elevenVoiceId); setMode("tts"); }}>
              <span className="voice-mini-icon"><Mic size={14} /></span>
              <span>{voice.name}</span>
              {selectedVoiceId === voice.elevenVoiceId ? <Check size={14} className="voice-check" /> : null}
            </button>
          )) : <div className="library-empty"><span className="voice-mini-icon"><Mic size={14} /></span><span>{t.libraryEmpty}</span></div>}
        </div>
        <button className="tools-open-button" onClick={() => setToolsOpen(true)}><Sparkles size={16} /><span>{t.openTools}</span><span className="tools-count">{TOOL_ITEMS.filter(item => item.available).length}</span></button>
        <div className="sidebar-footer">
          <div className="storage-state"><span className={`storage-dot ${saveToCloud ? "is-cloud" : "is-local"}`} />{saveToCloud ? t.cloudSaved : t.localSaved}</div>
          <button className="account-row" onClick={() => setSettingsOpen(true)} aria-label={t.openSettings}>
            <span className="account-avatar">{user.name?.trim().charAt(0).toUpperCase() || "3"}</span>
            <span className="account-copy"><strong>{user.name || t.profileInitial}</strong><small>{user.email || t.account}</small></span>
            <Settings size={15} />
          </button>
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-only" onClick={() => setMobileNavOpen(true)} aria-label={t.menu}><Menu size={19} /></button>
            <div className="topbar-heading"><span>{t.chatHeading}</span><small>{t.subtitle}</small></div>
          </div>
          <div className="topbar-actions">
            <span className={`service-pill ${connection.data?.connected ? "service-pill--online" : ""}`}><span />{t.poweredBy}</span>
            <button className="icon-button" onClick={() => { setToolsOpen(true); }} aria-label={t.openTools}><Sparkles size={17} /></button>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label={t.openSettings}><Settings size={17} /></button>
            <button className="icon-button" onClick={changeTheme} aria-label={t.theme}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </header>

        <section className="chat-stage">
          <div className="chat-headline">
            <div className="chat-headline-copy">
              <span className="eyebrow">{t.personalSpace}</span>
              <h1>{activeConversation?.title || t.workspace}</h1>
            </div>
            <div className="chat-headline-actions">
              <span className={`storage-badge ${saveToCloud ? "" : "storage-badge--local"}`}>{saveToCloud ? <Cloud size={13} /> : <Download size={13} />}{saveToCloud ? t.cloud : t.local}</span>
              <button className="secondary-button small-button" onClick={createNewConversation}><Plus size={15} />{t.newSession}</button>
            </div>
          </div>

          <div ref={messagesScrollerRef} className="messages-scroller" aria-live="polite">
            {conversation.isLoading ? <div className="messages-loading"><LoaderCircle size={18} className="spin" /></div> : null}
            {!conversation.isLoading && messageRows.length === 0 ? (
              <div className="welcome-panel">
                <div className="welcome-symbol"><BrandMark size={64} wordmark={false} /></div>
                <p className="eyebrow">{t.welcomeSmall}</p>
                <h2>{voiceRows.length ? t.welcomeTitle : t.noVoices}</h2>
                <p>{voiceRows.length ? t.welcomeText : t.noVoicesText}</p>
                <div className="welcome-actions">
                  {voiceRows.length ? <button className="primary-button" onClick={() => { setMode("tts"); document.getElementById("speech-prompt")?.focus(); }}><AudioLines size={17} />{t.ttsMode}</button> : null}
                  <button className={voiceRows.length ? "secondary-button" : "primary-button"} onClick={() => setMode("clone")}><Video size={17} />{t.startClone}</button>
                  <button className="secondary-button" onClick={() => setMode("stt")}><FileAudio size={17} />{t.startTranscript}</button>
                </div>
              </div>
            ) : null}
            <div className="messages-list">
              {messageRows.map(message => <MessageCard key={message.id} message={message} t={t} localUrl={localAudioUrls[message.id]} expanded={expandedWords === message.id} onToggleWords={() => setExpandedWords(current => current === message.id ? null : message.id)} onDownload={downloadAudio} onCopy={copyText} />)}
            </div>
            {(synthesize.isPending || transcribe.isPending || beginClone.isPending) ? <div className="assistant-progress"><span className="pulse-dot" />{synthesize.isPending ? t.generating : transcribe.isPending ? t.transcribing : t.cloning}</div> : null}
            <div className="scroll-end" />
          </div>

          <section className="composer" aria-label={t.promptLabel}>
            <div className="composer-tabs" role="tablist" aria-label={t.sectionTools}>
              <button role="tab" aria-selected={mode === "tts"} className={mode === "tts" ? "is-active" : ""} onClick={() => setMode("tts")}><AudioLines size={15} />{t.ttsMode}</button>
              <button role="tab" aria-selected={mode === "clone"} className={mode === "clone" ? "is-active" : ""} onClick={() => setMode("clone")}><Mic size={15} />{t.cloneMode}</button>
              <button role="tab" aria-selected={mode === "stt"} className={mode === "stt" ? "is-active" : ""} onClick={() => setMode("stt")}><FileAudio size={15} />{t.sttMode}</button>
            </div>

            {mode === "tts" ? (
              <div className="composer-body">
                <div className="composer-select-row">
                  <label className="field-inline"><span><Mic size={14} />{t.chooseVoice}</span>
                    <select value={selectedVoiceId} onChange={event => setSelectedVoiceId(event.target.value)} disabled={!voiceRows.length} aria-label={t.chooseVoice}>
                      {!voiceRows.length ? <option value="">{t.noVoiceSelected}</option> : null}
                      {voiceRows.map(voice => <option key={voice.id} value={voice.elevenVoiceId}>{voice.name}</option>)}
                    </select>
                  </label>
                  <label className="field-inline"><span><Sparkles size={14} />{t.selectModel}</span>
                    <select value={modelId} onChange={event => setModelId(event.target.value as typeof modelId)} aria-label={t.selectModel}>
                      <option value="eleven_multilingual_v2">Multilingual v2</option>
                      <option value="eleven_flash_v2_5">Flash v2.5 · سريع</option>
                      <option value="eleven_turbo_v2_5">Turbo v2.5</option>
                    </select>
                  </label>
                  <button className={`icon-button control-toggle ${showVoiceControls ? "is-open" : ""}`} onClick={() => setShowVoiceControls(value => !value)} aria-expanded={showVoiceControls} aria-label={t.options}><SlidersHorizontal size={16} /></button>
                </div>
                {showVoiceControls ? <div className="voice-controls">
                  <RangeControl label={t.stability} value={stability} onChange={setStability} min={0} max={1} step={0.05} />
                  <RangeControl label={t.similarity} value={similarity} onChange={setSimilarity} min={0} max={1} step={0.05} />
                  <RangeControl label={t.speed} value={speed} onChange={setSpeed} min={0.7} max={1.2} step={0.05} display={(speed).toFixed(2)} />
                </div> : null}
                <label className="prompt-area">
                  <span className="visually-hidden">{t.promptLabel}</span>
                  <textarea id="speech-prompt" value={text} onChange={event => setText(event.target.value.slice(0, MAX_TTS_TEXT_CHARS))} onKeyDown={onKeyDownComposer} maxLength={MAX_TTS_TEXT_CHARS} placeholder={t.compose} dir="auto" aria-describedby="prompt-helper" />
                </label>
                <div className="composer-footer">
                  <div className="composer-meta"><span id="prompt-helper">{t.controlEnter}</span><span>{text.length.toLocaleString(language === "ar" ? "ar-SA" : "en-US")} / {MAX_TTS_TEXT_CHARS.toLocaleString(language === "ar" ? "ar-SA" : "en-US")}</span></div>
                  <button className="primary-button generate-button" disabled={synthesize.isPending || !text.trim() || !voiceRows.length} onClick={() => void handleGenerate()}>
                    {synthesize.isPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                    {synthesize.isPending ? t.generating : t.generate}
                  </button>
                </div>
                {!voiceRows.length ? <p className="subtle-note">{t.waitingVoice} <button className="text-link" onClick={() => setMode("clone")}>{t.startClone}</button></p> : null}
              </div>
            ) : null}

            {mode === "clone" ? (
              <div className="composer-body clone-body">
                {!pendingPreview ? <>
                  <div className="panel-heading"><div><h2>{t.cloneTitle}</h2><p>{t.cloneHint}</p></div><span className="tool-status">{t.beta}</span></div>
                  <label className="upload-drop">
                    <input type="file" accept="audio/*,video/*,.mp4,.mov,.webm,.mkv,.m4a,.wav,.mp3" onChange={event => void onCloneFile(event.target.files?.[0])} aria-label={t.videoInput} />
                    <span className="upload-icon"><Upload size={18} /></span>
                    <span className="upload-copy"><strong>{cloneSource?.name || t.dropFile}</strong><small>{cloneSource ? `${(cloneSource.size / (1024 * 1024)).toFixed(1)} MB · ${t.remainingSeconds}` : `${t.chooseFile} · 100 MB`}</small></span>
                    {cloneSource ? <button type="button" className="icon-button clear-file" onClick={event => { event.preventDefault(); clearSample(); }} aria-label={t.clearFile}><X size={16} /></button> : <Video size={17} className="upload-right-icon" />}
                  </label>
                  {extracting ? <div className="progress-row"><LoaderCircle className="spin" size={15} /><span>{t.processing}</span><div className="progress-track"><i style={{ width: `${Math.max(8, extractProgress * 100)}%` }} /></div><small>{Math.round(extractProgress * 100)}%</small></div> : null}
                  {sampleFile && sampleUrl ? <div className="sample-review"><div className="sample-review-top"><span><Check size={14} />{t.sampleReady}</span><small>{(sampleFile.size / 1024).toFixed(0)} KB</small></div><audio controls preload="metadata" src={sampleUrl} aria-label={t.previewSample} /><button type="button" className="text-link" onClick={() => void downloadAudio(sampleUrl, sampleFile.name)}><Download size={14} />{t.download} · {sampleFile.name}</button></div> : null}
                  <div className="clone-fields">
                    <label className="form-field"><span>{t.voiceName}</span><input value={voiceName} onChange={event => setVoiceName(event.target.value)} maxLength={120} placeholder={language === "ar" ? "مثال: صوتي الهادئ" : "e.g. My calm voice"} /></label>
                    <label className="consent-check"><input type="checkbox" checked={hasCloneConsent} onChange={event => setHasCloneConsent(event.target.checked)} /><span>{t.consent}<small>{t.voiceNotice}</small></span></label>
                  </div>
                  <div className="privacy-note"><ShieldCheck size={15} /><span>{t.privateSample} {t.uploadNote}</span></div>
                  <button className="primary-button full-width" disabled={beginClone.isPending || extracting || !sampleFile || !hasCloneConsent || !voiceName.trim()} onClick={() => void handleBeginClone()}>
                    {beginClone.isPending ? <LoaderCircle className="spin" size={16} /> : <Mic size={16} />}{beginClone.isPending ? t.cloning : t.cloneAction}
                  </button>
                </> : <div className="pending-preview-panel">
                  <div className="pending-preview-heading"><span className="pending-preview-icon"><AudioLines size={19} /></span><div><h2>{t.previewTitle}</h2><p>{pendingPreview.name} · {t.sessionExpired}</p></div><span className="temporary-tag">{t.temporary}</span></div>
                  <p className="preview-explain">{t.previewHint}</p>
                  <audio controls autoPlay preload="auto" src={pendingPreview.previewUrl} aria-label={t.previewPlayback} />
                  {pendingPreview.requiresVerification ? <p className="warning-note">{t.verifiedWarning}</p> : null}
                  <label className="form-field preview-text-field"><span>{t.promptLabel}</span><textarea value={previewText} onChange={event => setPreviewText(event.target.value.slice(0, 350))} maxLength={350} dir="auto" /></label>
                  <div className="approval-note"><ShieldCheck size={15} /><span>{t.approvalGate} {t.previewWillExpire}</span></div>
                  <div className="approval-actions">
                    <button className="primary-button" disabled={approveClone.isPending} onClick={() => void handleApprove()}>{approveClone.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{t.approve}</button>
                    <button className="danger-outline-button" disabled={rejectClone.isPending} onClick={() => void handleReject()}>{rejectClone.isPending ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={15} />}{rejectClone.isPending ? t.rejecting : t.reject}</button>
                    <button className="secondary-button preview-again" disabled={previewPending.isPending || !previewText.trim()} onClick={() => void handlePreviewAgain()}>{previewPending.isPending ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}{t.previewAgain}</button>
                  </div>
                </div>}
              </div>
            ) : null}

            {mode === "stt" ? (
              <div className="composer-body stt-body">
                <div className="panel-heading"><div><h2>{t.transcriptTitle}</h2><p>{t.transcriptHint.replace("{limit}", String(MAX_TRANSCRIPTION_FILE_MB))}</p></div><span className="tool-status">Scribe v2</span></div>
                <label className="upload-drop upload-drop--compact">
                  <input type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.webm,.mov" onChange={event => { const file = event.target.files?.[0] ?? null; setTranscriptFile(file); if (file && file.size > MAX_TRANSCRIPTION_FILE_BYTES) toast.error(t.uploadTooLarge.replace("{limit}", String(MAX_TRANSCRIPTION_FILE_MB))); }} aria-label={t.audioInput} />
                  <span className="upload-icon"><FileAudio size={18} /></span>
                  <span className="upload-copy"><strong>{transcriptFile?.name || t.dropFile}</strong><small>{transcriptFile ? `${(transcriptFile.size / (1024 * 1024)).toFixed(1)} MB` : t.selectAudio}</small></span>
                  {transcriptFile ? <button type="button" className="icon-button clear-file" onClick={event => { event.preventDefault(); setTranscriptFile(null); }} aria-label={t.clearFile}><X size={16} /></button> : <Upload size={17} className="upload-right-icon" />}
                </label>
                <div className="privacy-note"><ShieldCheck size={15} /><span>{t.sampleSent} {t.security}</span></div>
                <div className="composer-footer"><div className="composer-meta"><span>{t.inputLanguage}: {language === "ar" ? "العربية" : "English"}</span></div><button className="primary-button" disabled={!transcriptFile || transcribe.isPending || transcriptFile.size > MAX_TRANSCRIPTION_FILE_BYTES} onClick={() => void handleTranscription()}>{transcribe.isPending ? <LoaderCircle className="spin" size={16} /> : <FileAudio size={16} />}{transcribe.isPending ? t.transcribing : t.transcribe}</button></div>
              </div>
            ) : null}
          </section>
        </section>
      </main>

      {settingsOpen ? <SettingsDialog
        language={language}
        theme={themeChoice}
        saveToCloud={saveToCloud}
        connection={connection.data}
        connectionLoading={connection.isFetching}
        saving={savePreferences.isPending}
        user={user}
        t={t}
        onClose={() => setSettingsOpen(false)}
        onLanguage={changeLanguage}
        onTheme={changeTheme}
        onStorage={changeCloudPreference}
        onTest={() => void refreshConnection()}
        onLogout={() => { setSettingsOpen(false); void onLogout().then(() => toast.success(t.signOut)); }}
      /> : null}
      {toolsOpen ? <ToolCatalog language={language} t={t} onClose={() => setToolsOpen(false)} onSelect={(nextMode) => { setMode(nextMode); setToolsOpen(false); }} onGuide={() => { setToolsOpen(false); setGuideOpen(true); }} /> : null}
      {guideOpen ? <GuideDialog language={language} t={t} onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}

function MessageCard({
  message,
  t,
  localUrl,
  expanded,
  onToggleWords,
  onDownload,
  onCopy,
}: {
  message: VoiceMessage;
  t: CopyText;
  localUrl?: string;
  expanded: boolean;
  onToggleWords: () => void;
  onDownload: (source: string | null, fileName: string) => void;
  onCopy: (content: string) => void;
}) {
  const metadata = message.metadata ?? {};
  const fileName = typeof metadata.fileName === "string" ? metadata.fileName : message.fileName || "3zai-audio.mp3";
  const voiceName = typeof metadata.voiceName === "string" ? metadata.voiceName : "3ZAI";
  const words = Array.isArray(metadata.words) ? metadata.words as Array<Record<string, unknown>> : [];
  const source = message.assetUrl || localUrl || null;

  if (message.role === "user" && message.kind === "text") {
    return <article className="message-row message-row--user"><div className="user-message-bubble"><p>{message.content}</p></div></article>;
  }
  if (message.kind === "event") {
    return <article className="event-message"><span><Check size={14} /></span><p>{message.content}</p></article>;
  }
  if (message.kind === "audio") {
    return <article className="message-row message-row--assistant"><div className="assistant-message-card"><div className="assistant-message-top"><span className="assistant-avatar"><AudioLines size={15} /></span><div><strong>{voiceName}</strong><small>{t.generatedAudio}</small></div><span className="assistant-spacer" /><span className={`saved-chip ${message.assetUrl ? "saved-chip--cloud" : ""}`}>{message.assetUrl ? <Cloud size={12} /> : <Download size={12} />}{message.assetUrl ? t.cloudOnly : t.localOnly}</span></div><p className="generated-copy">{message.content}</p>{source ? <audio className="generated-audio" controls preload="metadata" src={source} /> : <p className="audio-unavailable"><Volume2 size={15} />{t.playbackUnavailable}</p>}<div className="message-actions"><button onClick={() => onDownload(source, fileName)} disabled={!source}><Download size={14} />{t.download}</button><button onClick={() => onCopy(message.content)}><Copy size={14} />{t.copy}</button><span>{fileName}</span></div></div></article>;
  }
  if (message.kind === "transcript") {
    return <article className="message-row message-row--assistant"><div className="assistant-message-card transcript-card"><div className="assistant-message-top"><span className="assistant-avatar"><FileAudio size={15} /></span><div><strong>{t.transcript}</strong><small>{typeof metadata.languageCode === "string" ? metadata.languageCode.toUpperCase() : "Scribe v2"}</small></div><span className="assistant-spacer" /><button className="message-icon-button" onClick={() => onCopy(message.content)} aria-label={t.copy}><Copy size={15} /></button></div><p className="transcript-copy" dir="auto">{message.content}</p>{words.length ? <><button className="timestamps-toggle" onClick={onToggleWords} aria-expanded={expanded}>{t.details} <span>{words.length} {t.transcriptionWords}</span></button>{expanded ? <div className="word-timings">{words.slice(0, 200).map((word, index) => <span key={index}><strong>{String(word.text ?? "")}</strong><small>{Number(word.start ?? 0).toFixed(2)}–{Number(word.end ?? 0).toFixed(2)}s</small></span>)}</div> : null}</> : null}<div className="message-actions"><button onClick={() => onCopy(message.content)}><Copy size={14} />{t.copy}</button><span>{typeof metadata.fileName === "string" ? metadata.fileName : t.transcript}</span></div></div></article>;
  }
  return <article className="message-row message-row--assistant"><div className="assistant-message-card"><div className="assistant-message-top"><span className="assistant-avatar"><Sparkles size={15} /></span><div><strong>{t.assistantEvent}</strong><small>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</small></div></div><p>{message.content}</p></div></article>;
}

function RangeControl({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; display?: string }) {
  return <label className="range-control"><span>{label}<small>{display ?? value.toFixed(2)}</small></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function SettingsDialog({
  language, theme, saveToCloud, connection, connectionLoading, saving, user, t, onClose, onLanguage, onTheme, onStorage, onTest, onLogout,
}: {
  language: "ar" | "en";
  theme: "dark" | "light";
  saveToCloud: boolean;
  connection?: { connected: boolean; message: string };
  connectionLoading: boolean;
  saving: boolean;
  user: UserProfile;
  t: CopyText;
  onClose: () => void;
  onLanguage: (language: "ar" | "en") => void;
  onTheme: () => void;
  onStorage: (saveToCloud: boolean) => void;
  onTest: () => void;
  onLogout: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" dir={language === "ar" ? "rtl" : "ltr"}>
    <header className="dialog-header"><div><span className="eyebrow">{t.personalSpace}</span><h2 id="settings-title">{t.settings}</h2></div><button className="icon-button" onClick={onClose} aria-label={t.closeDialog}><X size={18} /></button></header>
    <div className="dialog-content">
      <div className="settings-account"><span className="account-avatar account-avatar--large">{user.name?.trim().charAt(0).toUpperCase() || "3"}</span><div><strong>{user.name || t.profileInitial}</strong><small>{user.email || t.account}</small></div><ShieldCheck size={18} /></div>
      <p className="settings-section-label">{t.preferences}</p>
      <label className="settings-row"><span><Languages size={16} /><span>{t.language}<small>{language === "ar" ? "العربية" : "English"}</small></span></span><select value={language} onChange={event => onLanguage(event.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></select></label>
      <button className="settings-row settings-row-button" onClick={onTheme}><span>{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}<span>{t.theme}<small>{theme === "dark" ? t.dark : t.light}</small></span></span><span className={`switch ${theme === "dark" ? "is-on" : ""}`}><i /></span></button>
      <div className="settings-row settings-row--stack"><span><Cloud size={16} /><span>{t.saveMode}<small>{saveToCloud ? t.cloud : t.local}</small></span></span><div className="segmented-control"><button className={saveToCloud ? "is-selected" : ""} onClick={() => onStorage(true)}><Cloud size={13} />{t.cloud}</button><button className={!saveToCloud ? "is-selected" : ""} onClick={() => onStorage(false)}><Download size={13} />{t.local}</button></div></div>
      <p className="settings-note">{t.storageNote}</p>
      <p className="settings-section-label">{t.serviceSettings}</p>
      <div className="connection-card"><div><span className={`connection-dot ${connection?.connected ? "is-online" : ""}`} /><strong>{t.apiTitle}</strong><small>{connectionLoading ? t.testing : connection?.message || t.connectionHelp}</small></div><button className="secondary-button small-button" onClick={onTest} disabled={connectionLoading}>{connectionLoading ? <LoaderCircle size={14} className="spin" /> : <Activity size={14} />}{t.apiCheck}</button></div>
      <p className="settings-note">{t.security} {t.connectionHelp}</p>
      <a className="docs-link" href="https://elevenlabs.io/docs/api-reference/introduction" target="_blank" rel="noreferrer"><BookOpen size={15} />{t.docs}<span>↗</span></a>
      <button className="logout-button" onClick={onLogout}><LogOut size={15} />{t.signOut}</button>
      {saving ? <p className="save-status"><LoaderCircle size={13} className="spin" />{t.saving}</p> : null}
    </div>
    <footer className="dialog-footer">3ZAI Voice Studio <span>{t.beta}</span></footer>
  </section></div>;
}

function ToolCatalog({ language, t, onClose, onSelect, onGuide }: { language: "ar" | "en"; t: CopyText; onClose: () => void; onSelect: (mode: ComposeMode) => void; onGuide: () => void }) {
  const groups = [...new Set(TOOL_ITEMS.map(item => language === "ar" ? item.groupAr : item.groupEn))];
  const onPick = (key: string) => {
    if (key === "guide") return onGuide();
    if (key === "tts" || key === "clone" || key === "stt") onSelect(key);
  };
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="tools-dialog" role="dialog" aria-modal="true" aria-labelledby="tools-title" dir={language === "ar" ? "rtl" : "ltr"}>
    <header className="dialog-header"><div><span className="eyebrow">{t.explainTools}</span><h2 id="tools-title">{t.tools}</h2></div><button className="icon-button" onClick={onClose} aria-label={t.closeDialog}><X size={18} /></button></header>
    <p className="tools-intro">{t.docsIntro}</p>
    <div className="tools-content">{groups.map(group => <section className="tool-group" key={group}><h3>{group}</h3><div className="tool-grid">{TOOL_ITEMS.filter(item => (language === "ar" ? item.groupAr : item.groupEn) === group).map(item => <button key={item.key} className={`tool-card ${item.available ? "is-available" : "is-disabled"}`} disabled={!item.available} onClick={() => onPick(item.key)}><span className="tool-card-icon"><item.icon size={17} /></span><span className="tool-card-copy"><strong>{language === "ar" ? item.labelAr : item.labelEn}</strong><small>{item.available ? t.available : t.soonDescription}</small></span><span className={`tool-chip ${item.available ? "tool-chip--ready" : ""}`}>{item.available ? t.available : t.comingSoon}</span></button>)}</div></section>)}</div>
    <footer className="dialog-footer">{t.poweredBy} · <a href="https://elevenlabs.io/docs/api-reference/introduction" target="_blank" rel="noreferrer">{t.docsOpen} ↗</a></footer>
  </section></div>;
}

function GuideDialog({ language, t, onClose }: { language: "ar" | "en"; t: CopyText; onClose: () => void }) {
  const steps = [t.guideStep1, t.guideStep2, t.guideStep3, t.guideStep4];
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" dir={language === "ar" ? "rtl" : "ltr"}><header className="dialog-header"><div><span className="eyebrow">{t.beta}</span><h2 id="guide-title">{t.guide}</h2></div><button className="icon-button" onClick={onClose} aria-label={t.closeDialog}><X size={18} /></button></header><ol className="guide-steps">{steps.map((step, index) => <li key={index}><span>{index + 1}</span><p>{step.replace(/^\d\.\s*/, "")}</p></li>)}</ol><div className="privacy-note"><ShieldCheck size={16} /><span>{t.voiceNotice} {t.approvalGate}</span></div><footer className="dialog-footer"><a href="https://elevenlabs.io/docs/overview/intro" target="_blank" rel="noreferrer">{t.docs} ↗</a><button className="primary-button small-button" onClick={onClose}>{t.close}</button></footer></section></div>;
}
