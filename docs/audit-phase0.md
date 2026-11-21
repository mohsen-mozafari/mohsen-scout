# ممیزی فاز ۰ — mohsen-scout @ upgrade/engine-v2 (مبنا: 0e9ddd5)

> نویسنده: مشاور (پرسش-پاسخ داخلی — هدف فقط فهم وضعیت پیش از شروع تغییرات).

## 0) مرجع ثابت (Anchor) — تأیید قبل از هر کاری

- `git fetch --all --tags`: اجرا شد (origin).
- `git cat-file -t 0e9ddd5` → **commit** ✓ (مبنا روی همه شاخه‌ها موجود است).
- **Run 139 (GitHub Actions)**: name `Build MOHSEN SCOUT APK`، run_number 139، conclusion **success**، head_sha `0e9ddd54e9c43735f9f141443f25ed6e27b7b325` (با `0e9ddd5` همخوانی دارد)، event `push`, status `completed`, run id `44857862759`. Workflow تنها در مخزن: `Build MOHSEN SCOUT APK` (`.github/workflows/android-apk.yml`) — APK آن کاربر تحویل داده و تست کرده است. ✅ اجرای مرجع تأیید شد (run 139 == 0e9ddd5, success).
- **main قطعی‌تر از 0e9ddd5 است**: main = `259a998` ("Merge verified engine-v3 rewrite from green build 145"). کامیت‌های اضافه روی main نسبت به 0e9ddd5 (۲۰ کامیت، جدید → قدیمی):
  259a998 (main tip), 9e5dddf, d972430, 99b5d29, 99ddad1, e638a3a, d475fc1 ("Merge verified engine-v2 upgrade from green build 1663d16"), 1663d16, fda3383, aa3477d, 043e4d5, beb26ad, b7967e7, 729ecdf, 20ac9a4, 4f993ae, 1aeabac, 1af2ac9, 990fc94.
  **مبنای کار همچنان 0e9ddd5** (گزارش تفاوت را می‌نویسم). در ادامه در مرحله apply طبق دستور شما برنامه rebase + نهایتاً ff-only روی main راست‌گردانی می‌شود — با ذکر تفاوت در گزارش.
- **وضعیت شاخه**: در کارگاه `/root/workspace/engine-v2-anchor` روی `upgrade/engine-v2` هستیم، HEAD = `0e9ddd5`. دستور `git switch -c upgrade/engine-v2 0e9ddd5` **در این کارگاه غیرممکن است** (branch در قبل وجود دارد و در worktree دیگری — از دوره زمانی قبلی — چک‌اوت شده). وضعیت دلخواه کاربر ("روی upgrade/engine-v2 @ 0e9ddd5") **از قبل در حالت مطلوب است** — HEAD همین commit است. خلاصه: باقی می‌مانیم روی این شاخه/HEAD و کار را ادامه می‌دهیم؛ تفاوت‌های محیطی در گزارش نهایی گزارش می‌شوند.
  (در `scout-git` HEAD روی `upgrade/engine-v4` @ 9e5dddf است — هیچ تغییری روی آن انجام نمی‌شود.)

## 1) استک (Stack) — تشخیص از روی کد

- Expo (58.x) + React Native (0.88.1), Expo Router, TypeScript (6.0.3), React 19, zustand (state).
- ذخیره‌سازی: SQLite (`expo-sqlite`) + AsyncStorage (`@react-native-async-storage`)، کلیدها در Expo SecureStore (`lib/vault.ts`).
- شبکه: `fetch` (Expo), zod schema validation، YouTube Data API (YouTube Search v3 + videos.list statistics) — کلید از vault.
- AI: OpenRouter (`lib/api.ts` getOpinion/getFreeModels) — فعلاً در `app/detail.tsx:88` و `app/(tabs)/index.tsx:240` استفاده می‌شود.
- UI: heroui-native + uniwind/Tailwind4, react-native-gesture-handler, reanimated 4.7, lucide icons.
- Test: `tsx --test tests/*.test.ts` — روی JVM اجرا می‌شود ✓ (core.test.ts 60KB، idea-generation.test.ts 22KB، engine-ai-review.test.ts 6KB و بقیه).

## 2) نقشه جریان داده (Data flow) — قبل از شروع تغییر (کوتاه‌خوانی)

### خبر (RSS) — سینا۳اس:
`app/cosmic-news.tsx runScan` → `fetchSpaceNews(spaceNewsSources)` [lib/space.ts:363] → خواندن RSS از 9 فید پیش‌فرض (NASA، JPL، CNEOS، ESA×2، Space.com، Phys.org، Universe Today، Sky&Telescope) → `parseRssFeed` (قطعات ۸۰ تایی + بریدگی تیتر 300 / خلاصه 1200) → `FeedRegistryRecord` + `SpaceNewsItem` → `allEngineNews` (ترکیب cache جدید + سورت publishedAt desc) → به `buildInternalResearch(news: allEngineNews.map(...))`.

### یوتیوب خودکار — سیناریوی اصلی:
`store.research` [lib/store.ts:94] → `searchYouTube(input)` [lib/api.ts:328] → planهای ۴ درخواست (buckets relevance/popularity/recent/explainer، search.list maxResults=50، حداکثر ۱۲ درخواست) → برای هر دسته ۵۰ آیتم + `videos.list statistics(viewCount, likeCount)` → `Report` → `store.reports` + `store.videos` (کلید گلوبال [store.ts:172]).
- بخش دیگر: `searchYouTubeSample` [api.ts:601] — برای `app/trend-intelligence.tsx` (۵۰ نتیجه/صفحه، manual) و `app/deep-research.tsx:121` — نتایج در TopicDossier ذخیره می‌شوند.

### موتور داخلی — خروجی اصلی:
`buildInternalResearch(input)` [lib/engine.ts:157] — ورودی: `input.videos ← collectEngineVideoEvidence(reports, store.videos)` [lib/dashboard.ts:32] (dedupe با id، filter شرایط، sort, slice(0,300))، `input.news ← engineNews`، wiki, feedback, priorMemory.
- خروجی: `InternalResearchResult` (summary, evidence, angles, verificationQuestions, limitations, intelligence) → به Dashboard (index.tsx:447)، CosmicNews، TopicDossier، `generateEditorialIdeas` (ایده‌ها), `createResearchMemoryEntry`.

### ایده‌ها:
`Idea` [lib/types.ts:69] با `engineGenerated`, `engineScore`, `engineScoreReason` — `generateEditorialIdeas` [lib/idea-generation.ts:389] — داشبورد: `rankDashboardIdeas` [lib/dashboard.ts:63], `selectDashboardIdeas`.

### AI دوم (فعلی):
`getOpinion(key, model, prompt, fetcher)` [lib/api.ts:959] — opinion در app/detail.tsx:88 + index.tsx:240.

## 3) شکاف‌ها (Gaps) — با نام فایل:خط (پیش‌خوان)

### Phase 1 — بی‌وابستگی / صحت خروجی
- **G1 — بریدگی ورودی ورودی موتور**: `collectEngineVideoEvidence` limit پیش‌فرض **300** [lib/dashboard.ts:36] — موتور ورودی را نادرست قطع می‌کند. داده‌های زیاد رسیده به شرکت منبع: `store.videos` شامل همه جستجوهای خودکار (store.research:172) + report.videos + cache موجود (getCachedSpaceNews).
- **G2 — commentCount در searchYouTube** [lib/api.ts:438-453]: fields `statistics(viewCount,likeCount)` — engagement ratio (likes+comments)/views یا likes/(views+1) نیاز به commentCount دارد.
- **G3 — commentCount در searchYouTubeSample** [lib/api.ts:700] + `YouTubeSampleVideo` [lib/api.ts:512-523] فاقد commentCount.
- **G4 — داده‌ی اتک بی‌کافت موتور**: همه ویدئوهای نگه‌داشته شده به موتور می‌رسند، اما فیلدهای اصلی برای فاز 2 جدید نیاز: growthRate (views/hour — وجود دارد: publishedAt+viewCount+fetchedAt), engagementRatio (لایسن+comments — G2), outlierScore (views vs channel median — نیاز به stats کانال در بازه ویدئو — G6), titlePatterns، recency.
- **G5 — عملکرد اصلی thread**: `buildInternalResearch` در Main thread اجرا می‌شود (index.tsx:447, cosmic-news.tsx:126 — داخل setTimeout UI) — در فازی که خوشه‌بندی جدید می‌آید باید مسیریابی متریک برنامه کار شود.
- **G6 — stats روی store.videos**: `Video` [lib/types.ts:36] فقط viewCount/likeCount (وجود دارد)؛ `EngineVideoEvidence` (dashboard.ts:19-25) همچنان فقط viewCount/likeCount — commentCount + (اختیاری) stats کانال باید به `EngineVideoEvidence` اضافه شوند و در reports هم حفظ شوند (report.videos شامل میدیا stats است برای deep-research).
- **G7 — خبر ورودی coverage**: `EngineNewsItem` [lib/engine.ts:22-30] فقط title/summary/sourceName/sourceUrl/publishedAt/sourceId — coverage نویسی در فاز 1: به صورت `{newsBySource, total}` در engine input + selfEvaluation.

### Phase 2 — موتور ارتقا (تغییر بزرگ)
- **H1 — ویژگی‌های جدید**: growthRate، engagementRatio (likes+comments)/views، outlierScore، titlePatterns (عدد/سؤال)، channelSizeRatio، recency — فاز 2 (ویژگی‌ها).
- **H2 — TF-IDF + n-gram + پشتیبانی فارسی** خوشه‌بندی موضوعی — نیاز جدید (tokenizeResearchText وجود دارد — intelligence.ts:182).
- **H3 — خوشه بندی/momentum بر اساس ایتم‌های پردازش‌شده** (ویدیو+خبر در بازه موضوع خاص).
- **H4 — Correlation news↔YouTube (Gap: پیوند اخبار گرم با کمترین ویدیو، Risk: رقابت شدید)** — جدید.
- **H5 — Opportunity score** — جدید (وزن‌دار، توضیح‌پذیر، باز [0-100]).
- **H6 — Income estimate (niche × views × RPM تخمینی — فرض‌های صریح، برچسب estimate)** — جدید.
- **H7 — Idea Generator (از شواهد واقعی: عنوان پیشنهادی، زاویه، ویدیوهای مرجع با id+url+views، خبرهای پشتیبان، risk, best time)** — جدید.
- **H8 — Explainability در بازگشت شده (score + reasons per opportunity)** — جدید.
- **H9 — شاید به جای `generateEditorialIdeas` یا به عنوان پوشش‌کننده آن در store.research + cosmic-news** — wire plan (جدید).

### Phase 3 — AI دوم (OpenRouter)
- **I1 — Complement (مکمل باز نگر)**: input = engine v2 result (خروجی‌های خلاصه، opportunities با امتیاز+دلیل+ref)، output = بازنویسی مفاهیم، پر کردن ضعف، تقویت عنوان پیشنهادی (محدود input/output). Strict JSON schema با validate.
- **I2 — fallback**: هر خطا/timeout/نبود کلید → null → استفاده از نتیجه بدون AI.

### Phase 4 — داشبورد و UX
- **J1 — هیات محقق**: جزئیات روی نگارش صفحه اول (Tap)، خروجی فقط خلاصه (قبل وجود قالب).
- **J2 — states**: Loading/Empty/Error مشخص (وجود دارد — برای engine v2 جدید).
- **J3 — non-blocking**: Engine v2 با budget + schedule (setTimeout 0) — جدید.

### Performance (قید جهانی — فاز 0)
- **K1 — Main thread محافظت‌شده برای engine v2** — جدید.
- **K2 — Stage timing logs + selfEvaluation stage timings + coverage** — جدید.
- **K3 — Fallback بر روی exception/timeout مرحله** — جدید.
- **K4 — JVM baseline timing test با داده‌ی نمونه بزرگ (300+200) در Actions** (فاز 0, Phase 2 — اگر worse شد باید قبل از ادامه رفع).
- **K5 — Worst-case داده زیاد (300 videos + 200 news) — کش/incremental + fallback**.

## 4) Baseline JVM timing test (فاز 0)

`tests/engine-v2.test.ts` (tsx --test):
- Synthetic data: 300 videos (fa+en titles/descriptions, view/like/comment stats, publishedAt) + 200 news (fa+en, publishedAt) → `runEngineV2({videos, news, now})`.
- Assert: result.opportunities non-empty; timings printed via console.log; total processingMs < 4000ms (JVM baseline) — در Actions گزارش می‌شود (نیاز به instrumentation: selfEvaluation.stageTimings + global budget check).

## 5) فایل‌های هدف پیش‌خوان (فاز 1-4 — به نتیجه فاز 1 بیشتر قابل تغییر)

Phase 1 (صحت خروجی):
- lib/dashboard.ts: collectEngineVideoEvidence — cap ↑ 300→500 + coverage out (videosFromReports, videosFromStored, unique, retained, droppedForMissing, droppedAsExpired) + new `collectEngineVideoEvidenceDetailed`.
- lib/api.ts: searchYouTube — fields + commentCount; Video type — commentCount. searchYouTubeSample — fields + commentCount; YouTubeSampleVideo + commentCount.
- engine input coverage (cosmic-news.tsx, index.tsx, store.research, store.analyze) + selfEvaluation.coverage (newsBySource/total/reaching + videosFromReports/FromStored/Retained).

Phase 2 (موتور v2):
- lib/engine/types.ts, lib/engine/features.ts (growthRate, engagementRatio, outlierScore, titlePatterns, channelSizeRatio, recencyHours), lib/engine/topics.ts (TF-IDF+n-gram, clusters, momentum, gap/risk), lib/engine/opportunity-scorer.ts (scores + reasons, weights), lib/engine/idea-generator.ts (EngineV2Opportunity), lib/engine/income-estimator.ts (Niche table, RPM), lib/engine/orchestrator.ts (stage pipeline, budget, timing, fallback).
- lib/types.ts: Idea + engineV2 field.
- apps wiring: index.tsx (useEngineV2Opportunities), cosmic-news.tsx, store.research/analyze.

Phase 3 (AI):
- lib/engine/complement.ts — OpenRouter schema/prompt/fallback (getOpinion reuse).

Phase 4 (UX):
- app/(tabs)/index.tsx — show top 3-5 opportunities (score, reason, risk); details on tap; Loading/Empty/Error.

Phase 5 (Build/Delivery):
- .github/workflows/android-apk.yml — [forbidden unless needed] — فقط اگر مرحله test جدید لازم باشد (اما npm test قبلاً در جریان هست — احتمالا تغییر نمی‌خواهیم. لغو: بدون تغییر workflow).
- scripts/setup-android-signing.sh — check version bump (1.5.9 → next patch/minor).

## 6) قواعد عملیاتی در حین اجرا

- هر دور build: یک push به `ci/apk-build` (build auto; manual dispatch غیرممکن که auto است — با `gh` نیز در دسترس). قبل build: `gh run list` — هیچ run queued نباشد (پاسخ گزارش می‌شود).
- بیلد سبز نشود: اولین خطای لاگ → ریشه‌ای بررسی → رفع → بیلد دوباره (تا ۳ بار خطای مشابه چون دیگر روش عوض شود).
- بعد از سبز: تغییرات به main: `git merge --ff-only` (راست‌گردانی به درخت سبز — با اعتراض گزارش کوتاه برای main ahead قبلی باز *in محیط محلی*، بعد بازگشت به ci برای Confirming build).
- Secrets/keys: هیچ کلیدی در کد ننویسم (وجود کلیدهای موجود فقط از توضیح به کاربر — فرض: وجود کلیدهای موجود بدون hardcode).

## 7) لیست فایل‌های جدید/اصلاحی — بررسی شاهسولی (موقع پیاده‌سازی)

- `tests/engine-v2.test.ts` — Phase 2-3 (همچنین برای Phase 0 timing test).
- `lib/engine/` — Phase 2-3.
- `docs/audit-phase1.md, docs/audit-phase2.md ...` — گزارش هر فاز (فرض: در حین کار نوشته می‌شود).
- Version bump: `app.config.ts` / `android/app/build.gradle`? — بررسی: setup-android-signing.sh — versionCode/Name در app.config.ts (Expo). بررسی قبل پشته‌خواب.
