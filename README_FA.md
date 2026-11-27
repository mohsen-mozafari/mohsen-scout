# MOHSEN SCOUT — راهنمای استفاده

مالک برنامه Mohsen است. رابط کاربری به‌صورت پیش‌فرض فارسی است و از مسیر Settings → Profile & defaults → App language می‌توان آن را به English تغییر داد. عنوان خبرها و ویدئوهای ناشران خارجی به زبان اصلی باقی می‌مانند و ترجمه یا بازنویسی نمی‌شوند. این برنامه شخصی است و ثبت‌نام ایمیلی یا سرور اجباری ندارد.

## زبان و نمایش راست‌به‌چپ

- زبان پیش‌فرض نصب جدید فارسی است؛ تنظیم زبان در ترجیحات محلی ذخیره می‌شود و داده‌های قدیمی نیز هنگام خواندن با مقدار امن فارسی مهاجرت می‌کنند.
- چیدمان رابط فارسی راست‌به‌چپ و رابط انگلیسی چپ‌به‌راست است. نام ناشرها، عنوان‌های اصلی خبر/ویدئو و داده‌های واقعی منبع دست‌کاری نمی‌شوند.
- تغییر زبان را در بخش Profile & defaults انتخاب و با Save defaults ذخیره کنید.

## شروع

۱. Settings را باز کنید. بخش YouTube API را انتخاب کنید.
۲. در [Google Cloud](https://console.cloud.google.com/apis/library/youtube.googleapis.com) یک پروژه بسازید و YouTube Data API v3 را فعال کنید.
۳. در Credentials یک API key بسازید. آن را به YouTube Data API v3 محدود کنید. محدودیت برنامه‌ای ناسازگار مانند HTTP referrer برای کلاینت Android ممکن است درخواست را مسدود کند؛ کلید را عمومی یا داخل کد قرار ندهید.
۴. کلید را فقط در ورودی ماسک‌شده برنامه وارد کنید و Save key سپس Test key را بزنید. هرگز کلید را در چت نفرستید. در Android از SecureStore استفاده می‌شود؛ در پیش‌نمایش مرورگر فقط در حافظه نگه‌داری می‌شود و با بارگذاری مجدد از بین می‌رود.
۵. در Space Radar نیچ موردنظر را انتخاب کنید. برای پژوهش عمومی و قبلی YouTube، از گزینه YouTube research در همان صفحه استفاده کنید؛ موضوع، منطقه و زبان‌ها را آنجا انتخاب و START RESEARCH را بزنید. منطقه، محل بینندگان را مشخص نمی‌کند؛ زبان فقط راهنمای ارتباط نتایج است و فیلتر قطعی زبان نیست.
۶. CONTINUE ANALYSIS یک اقدام جداگانه است. ایده‌ها فرضیه‌های تحریریه‌ای هستند، نه اثبات روند یا شکاف بازار. نمونه‌های واقعی، محدودیت‌ها و پرسش‌ها را بررسی کنید.

## محدودیت پژوهش و سهمیه

در هر اجرای پژوهش حداکثر ۱۲ جستجو، برای هر ترکیب حداکثر دو صفحه و حداکثر ۱۰۰ ویدیوی یکتا دریافت می‌شود. چندزبان‌بودن می‌تواند نمونه بعضی ترکیب‌ها را محدود کند. سقف تعداد، تضمین تعداد نتایج نیست. نتایج همسان تا ۱۵ دقیقه دوباره استفاده می‌شوند.

شمارنده محلی هر جستجو را ۱۰۰ واحد و تست اتصال را ۱ واحد تخمین می‌زند؛ تلاش‌های مجدد نیز شمرده می‌شوند. Google سهمیه واقعی پروژه را کنترل می‌کند؛ مصرف سایر برنامه‌ها در شمارنده این برنامه دیده نمی‌شود. بازنشانی روز با منطقه زمانی Pacific انجام می‌شود. در quotaExceeded درخواست‌های بعدی همان روز متوقف می‌شوند. خطاهای کلید، دسترسی، اینترنت، زمان‌انتظار و پاسخ نامعتبر پیام قابل فهم دارند.

موتور، تغییر بازدید هر ویدئو را میان snapshotهای واقعی محاسبه می‌کند و در صورت کفایت فاصله زمانی، views/hour و views/day و مقایسه با خط پایه کانال را نشان می‌دهد. این‌ها اندازه‌گیری همان ویدئوها هستند، نه پیش‌بینی قطعی بازدید آینده یا سرشماری کل بازار. داده‌های ناموجود حدس زده نمی‌شوند و هیچ تضمین وایرال‌شدن یا درصد موفقیت ساختگی ارائه نمی‌شود.

## هوش مصنوعی اختیاری

در [OpenRouter](https://openrouter.ai/settings/keys) کلید بسازید و در Settings → OpenRouter ذخیره و تست کنید. Refresh free models فهرست فعلی مدل‌های رایگان را می‌گیرد؛ مدل دلخواه را انتخاب و Save model را بزنید. قیمت صفر به معنی دسترسی نامحدود نیست.

Deep Research چشم دوم موتور داخلی است و در اجرای عادی پژوهش نیز به‌صورت خودکار فراخوانی می‌شود. نمونهٔ محدود YouTube شامل عنوان، توضیح، کانال، زمان انتشار، آمار عمومی و شاخص‌های رشد اندازه‌گیری‌شده همراه شواهد وب/ناشران به پژوهشگر و بازبین مستقل ارسال می‌شود. این اطلاعات، سیگنال پلتفرمی برای کشف موضوع و زاویهٔ محتوا هستند و جای نقل‌قول مستقل از ناشر را نمی‌گیرند. کلیدها، هدرهای احراز هویت و یادداشت‌های خصوصی هرگز ارسال نمی‌شوند. OpenRouter همچنان طبق سیاست جداگانه از Deep Research مستثناست. پاسخ مدل نظر پژوهشی است و باید با شواهد و عدم‌قطعیت سنجیده شود.

## فضای محلی

- Opportunities: ایجاد، ویرایش، ذخیره، حذف با تأیید، بایگانی، دسته‌بندی و تصمیم شخصی.
- My Library: ذخیره لینک، برچسب شخصی، موضوع، پوشه، تگ و یادداشت؛ جستجو و مرتب‌سازی و خروجی لینک‌ها. جست‌وجوی محلی در Library، Notes و Opportunities همه واژه‌های عبارت را مستقل از ترتیب بررسی می‌کند و حروف رایج فارسی/عربی، اعراب، نیم‌فاصله و اعداد فارسی/عربی را نرمال می‌کند؛ این قابلیت تصحیح املای تقریبی نیست. دانلود ویدیو، صدا یا زیرنویس وجود ندارد.
- Notes: صفحه، پوشه، تگ، عنوان، پاراگراف، بولت، چک‌لیست و ارجاع به لینک/ویدیو/ایده. ترتیب بلوک‌ها را با Move block up/down تغییر دهید. ابتدا صفحه را نام‌گذاری و Save page را بزنید؛ لینک به صفحه حذف‌شده صفحه تازه نمی‌سازد.

اطلاعات YouTube، گزارش‌ها، رشد اندازه‌گیری‌شده و تمام snapshotها در جدول محلی جداگانه نگه‌داری می‌شوند و انقضای خودکار یا سقف ۱۰هزار رکورد ندارند. فقط با حذف آگاهانهٔ داده‌های برنامه از دستگاه پاک می‌شوند. این نگه‌داری محلی با خروجی Backup شخصی فرق دارد؛ طرح فعلی Backup همچنان متادیتای خام API را صادر نمی‌کند.

## پشتیبان و انتقال به گوشی دیگر

۱. Settings → Backup & phone transfer → Export backup.
۲. فایل `mohsen-scout-backup.json` را در محل امن یا از طریق share sheet ذخیره/منتقل کنید. این فایل رمزگذاری‌شده نیست و شامل یادداشت‌های شخصی است؛ با افراد ناشناس به اشتراک نگذارید.
۳. برنامه را روی گوشی دوم نصب کنید. Choose backup to restore را بزنید، فایل را انتخاب و تعداد موارد را بررسی کنید، سپس Confirm restore.
۴. داده‌های شخصی جایگزین می‌شوند؛ روی دستگاه فعلی شمارنده سهمیه و متادیتای معتبر حفظ می‌شوند. زمان‌بندی به Manual برمی‌گردد. پاسخ AI قبلی فقط وقتی شناسه ایده و موضوع/مفهوم/تصمیم آن تغییر نکرده باشد باقی می‌ماند. کلیدها داخل فایل نیستند و در گوشی جدید باید دوباره وارد شوند.
۵. محدودیت فایل ۲۰MB است. فایل نامعتبر قبل از تغییر داده رد می‌شود. نسخه فعلی پشتیبان شماره ۱ است.

خروجی شامل صفحات، لینک‌ها، پوشه‌ها، تگ‌ها، ایده‌ها و ترجیحات است. تمام متادیتای API، نتایج پژوهش، پاسخ‌های AI، کلیدها، شمارنده سهمیه و وضعیت وابسته به دستگاه حذف شده‌اند. پشتیبان خودکار سیستم Android غیرفعال است؛ از خروجی شخصی استفاده کنید.

## زمان‌بندی

وقتی زمان‌بندی روی Manual یا Pause قرار ندارد، موتور در زمان فعال‌بودن برنامه به‌صورت پیوسته موضوعات نیچ انتخابی را کشف و پژوهش می‌کند؛ هر چرخه ابتدا نمونهٔ YouTube را جمع‌آوری می‌کند، سپس خوراک‌های ناشران و شواهد وب را بررسی می‌کند و اولویت صف با موضوعات YouTube است. برای شروع این چرخه نیازی به جست‌وجوی دستی قبلی نیست؛ حوزهٔ انتخابی، ورودی اولیه را می‌سازد. کلید شخصی YouTube Data API برای نمونه‌گیری YouTube لازم است. صف و کارهای نیمه‌تمام محلی ذخیره می‌شوند و پس از بازشدن دوباره، ابتدا کشف YouTube و سپس بازیابی کارهای قابل‌ادامه انجام می‌شود. در پس‌زمینه، Android از WorkManager و زمان‌بندی بهترین‌تلاش استفاده می‌کند؛ شبکه و وضعیت باتری باید مناسب باشد و محدودیت‌های سیستم/سازنده یا Force Stop می‌توانند اجرا را عقب بیندازند یا متوقف کنند. سقف سهمیه و محدودیت هر درخواست رعایت می‌شود.

## خروجی نصب

ساخت Android از طریق GitHub Actions در شاخه `ci/apk-build` انجام می‌شود. workflow برای Release APK با معماری ARM64 و همان کلید امضای ثابت پیکربندی شده است. پس از build موفق، فایل در Artifact با نام `mohsen-scout-release-apk` قرار می‌گیرد. وضعیت آخرین اجرا، نتیجه تست‌ها و محدودیت‌های تست دستگاه در `TEST_RESULTS.md` ثبت می‌شوند.

برای توسعه محلی:

```sh
npm ci
npx expo start
npm test
npm run lint
npm run lint:css
npx expo-doctor
```

برای ساخت Release فقط workflow رسمی GitHub Actions استفاده شود؛ `expo prebuild`، قوانین R8، کلید امضای ثابت و معماری ARM64 بخشی از مسیر ساخت هستند. اجرای buildهای متعدد برای آزمون‌های ساده انجام نشود. Share an existing APK فقط فایل APK موجود روی گوشی را انتخاب و به share sheet می‌دهد؛ خودش APK تولید نمی‌کند.
## Space intelligence workspace

The Discover tab is now Space Radar. The original general YouTube research workflow is preserved at **YouTube research** from the radar screen. Existing Ideas, My Library, Notes, Settings, SecureStore credentials, SQLite data, backup/restore, local quota and OS-controlled scheduler remain part of the same app.

- **Space Radar:** choose a space/astronomy niche, select official feed providers and a Wikipedia language project, and refresh source signals manually.
- **Cosmic News:** reads the selected NASA, NASA JPL and ESA RSS feeds; each item retains its publisher URL and publication timestamp where supplied.
- **Trend Intelligence:** uses the personal YouTube Data API key. Official YouTube ordering and raw metadata are passed into the internal engine and the Deep Research/independent-review models. Persisted snapshots enable measured per-video views/hour and views/day; all YouTube metadata and snapshots remain local without automatic expiry. The sample is bounded and is not a full market census.
- **Search Demand:** compares up to three Wikipedia article pageview histories from the selected language edition. Pageviews are a public-interest proxy, not Google search volume, unique people, country-level audience data or YouTube views. Google Trends programmatic access is currently a limited alpha; the app opens the Trends website for manual country/term comparison rather than pretending a public API is available.
- **Deep Research:** the second eye of the internal engine. It is invoked automatically for normal research and cross-checks completed local findings with the same YouTube sample, platform-growth history and independent web/publisher evidence. It can also be opened manually for a full brief. The first configured model proposes hypotheses and next searches; a different configured provider independently reviews the result. Exact-source quote verification remains required for publisher claims.
- The foreground autonomous loop samples YouTube first for the selected niche, then checks configured publisher feeds and independent web evidence. It can seed research from the selected niche on a fresh install without a prior manual search. It stores queue/checkpoints and resumes recent interrupted tasks after a YouTube-first evidence pass. The Android scheduler uses WorkManager and remains OS-controlled and best-effort; network/battery conditions and manufacturer policies can delay or stop a run.

The new Space settings are local preferences. Existing version-1 backups remain importable; missing Space settings are filled with conservative defaults during validation/migration.

## بررسی

Settings → App info → Run mock regression checks یا مسیر `/diagnostics` برای تست‌های مصنوعی است. ۳۵ تست در پیش‌نمایش مرورگر اجرا و همگی قبول شدند. این تست‌ها تماس زنده API نیستند. وضعیت دقیق و موارد آزمایش‌نشده در `TEST_RESULTS.md` آمده است.
