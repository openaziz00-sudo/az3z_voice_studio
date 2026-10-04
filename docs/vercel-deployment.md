# نشر 3ZAI Voice Studio على Vercel

## القرار التقني

المشروع تطبيق React/Vite مع خادم Express/tRPC. وفق توثيق Vercel، تطبيق Express يمكن اكتشافه تلقائياً إذا وُجد ملف `app`, `index` أو `server` ذي امتداد مدعوم في جذر المشروع (أو تحت `src/`)، ويصدّر تطبيق Express افتراضياً أو يبدأ مستمعاً. يبني Vercel التطبيق كـFunction Express واحدة.

الأصول الثابتة لتطبيق Express على Vercel يجب أن تكون تحت `public/**` لتُقدّم عبر CDN؛ `express.static()` لا يخدم الأصول على Vercel. لذلك سيظل البناء الحالي لـManus يكتب إلى `dist/public`، بينما يخرج بناء Vercel إلى مجلد `public` في جذر المشروع.

## متغيرات البيئة

يجب تعيينها من Vercel Project Settings، لا في Git ولا في ملفات العميل:

- `DATABASE_URL`
- `MANUS_PROJECT_ID`
- `MANUS_JWT_SECRET`
- `MANUS_OAUTH_API_URL`
- `MANUS_OAUTH_PORTAL_URL`
- `MANUS_API_URL`
- `MANUS_API_KEY`
- `ELEVENLABS_API_KEY`

قد يكون `OWNER_OPEN_ID` اختيارياً فقط إذا كانت هناك حاجة إلى دور مالك/مشرف مخصص. عيّن بيانات الاعتماد كـSensitive في Vercel، وأعد النشر لتطبيق التغييرات. لا تكشف أي قيمة سرية ضمن README أو مستودع Git.

بعد معرفة نطاق الإنتاج، راجع الحاجة لتسجيل عنوان OAuth callback لدى Manus:
`https://<نطاق-Vercel>/api/oauth/callback`.

## المصادر الرسمية

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express) — مدخل التطبيق، تصدير Express، الأصول الثابتة، وحدود Function. آخر تحديث ظاهر: 2026-08-10.
- [How to ship an Express app on Vercel](https://vercel.com/kb/guide/ship-a-express-app-on-vercel) — تدفق النشر من Git/CLI ومتطلبات اكتشاف التطبيق. آخر تحديث ظاهر: 2026-09-29.
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) — بناء Vite وrewrites لواجهة SPA. آخر تحديث ظاهر: 2026-08-26.

> إنشاء مشروع Vercel أو نجاح البناء وحده لا يعني أن تسجيل الدخول أو قاعدة البيانات أو الصوت يعمل. لا يُعد النشر جاهزاً للمستخدم حتى تُضبط المتغيرات الحساسة ويُتحقق من النطاق ومسار OAuth والتكاملات الفعلية.

## حد حجم Function

تذكر [وثائق حدود Vercel Functions](https://vercel.com/docs/functions/limitations) أن أقصى حجم لجسم الطلب أو الاستجابة هو **4.5 MB**. لتجنب تجاوز حد الطلب بسبب ترميز ملف التفريغ إلى Base64/JSON، يُضبط STT إلى 3 MB خام في نسخة Vercel، بينما يبقى حد Manus 18 MB. يحدد Vercel النص المرسل إلى TTS بـ2,000 محرف (مقابل 5,000 في Manus) لتقليل خطر تجاوز حد الاستجابة عند إعادة الصوت داخل tRPC. هذه حدود مرحلية واضحة؛ النقل المباشر إلى التخزين خارج نطاق هذا التغيير.

قائمة جميع أسماء متغيرات البيئة وتحديد السرّي/العام، مع قالب فارغ آمن، موجودة في [`vercel-environment-variables.md`](./vercel-environment-variables.md). لم تُنسخ القيم الفعلية إلى ملفات المشروع.

## روابط الملفات الصوتية

تخزين Manus يعيد مسارات `/manus-storage/{key}` التي تخدمها بوابة Manus؛ هذه المسارات ليست ضمن نطاق Vercel. عند التشغيل بـ`VERCEL=1` يجب أن يعيد الخادم روابط GET موقعة قصيرة العمر بعد فحص ملكية المحادثة/الأصل، وأن يبقى `storageKey` هو القيمة الدائمة في قاعدة البيانات. أما في Manus فيستمر استعمال المسار النسبي الأصلي.
