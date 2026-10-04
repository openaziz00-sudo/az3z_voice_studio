# عقود ElevenLabs المستخدمة في 3ZAI Voice Studio

هذه الواجهة تستدعي ElevenLabs من الخادم فقط؛ مفتاح `ELEVENLABS_API_KEY` يبقى سرياً ولا يصل إلى المتصفح.

| الغرض | العقد الذي يعتمد عليه التطبيق |
| --- | --- |
| فحص الاتصال دون توليد صوت | `GET https://api.elevenlabs.io/v1/user` باستخدام ترويسة `xi-api-key`؛ لا يعيد التطبيق تفاصيل اعتماد أو رصيد المستخدم. |
| استنساخ فوري مؤقت | `POST https://api.elevenlabs.io/v1/voices/add` بصيغة `multipart/form-data` مع `name` وملف `files`؛ الاستجابة تتضمن `voice_id` و`requires_verification`. |
| معاينة أو توليد الكلام | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` مع النص ومعرّف النموذج وإعدادات الصوت؛ الاستجابة بايتات صوتية. |
| تحويل الكلام إلى نص | `POST https://api.elevenlabs.io/v1/speech-to-text` بصيغة متعددة الأجزاء مع `model_id=scribe_v2` والملف؛ تحفظ النتيجة النصية وتفاصيل الكلمات الزمنية عند ورودها. |
| رفض معاينة مستنسخة | `DELETE https://api.elevenlabs.io/v1/voices/{voice_id}`؛ يستخدم لحذف الصوت الخارجي المؤقت إذا رفض المستخدم أو تعذر تثبيته بعد الاعتماد. |

## قواعد المنتج

- يُستخرج أول 10 ثوانٍ محلياً بواسطة FFmpeg.wasm؛ لا يرسل المتصفح الفيديو الأصلي لهذا المسار.
- استدعاء الاستنساخ ينشئ Voice Clone داخل مساحة ElevenLabs؛ تبقى بياناته مؤقتة في ذاكرة خادم 3ZAI، لا في مكتبة التطبيق، حتى موافقة المستخدم الصريحة.
- معاينة الكلام تولَّد بعد إنشاء الاستنساخ؛ الرفض يطلب حذف الصوت البعيد، ويجري تنظيف الأصوات المنتهية بعد 30 دقيقة.
- إعدادات الصوت والنصوص والمخرجات تمر عبر جلسة المستخدم الموثّقة وملكية الصفوف في قاعدة البيانات.

## المصادر الرسمية

- [Create speech — TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Create IVC voice](https://elevenlabs.io/docs/api-reference/voices/add)
- [Create transcript — STT](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Delete voice](https://elevenlabs.io/docs/api-reference/voices/delete)
- [Get voice](https://elevenlabs.io/docs/api-reference/voices/get)
