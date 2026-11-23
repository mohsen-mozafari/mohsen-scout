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

هیچ views/hour، درصد رشد، نسبت تعامل، نسبت مشترکین، نمره ترکیبی یا تضمین وایرال محاسبه نمی‌شود. دسته Emerging Topics صرفاً نمونه‌های اخیراً منتشرشده است؛ Popular Topics از ترتیب خود YouTube استفاده می‌کند. رتبه‌بندی خودکار محتاطانه فقط Worth Exploring یا Uncertain پیشنهاد می‌دهد. سایر برچسب‌ها تصمیم شخصی شما هستند. هیچ درصد پتانسیل ساختگی نمایش داده نمی‌شود.

## هوش مصنوعی اختیاری

در [OpenRouter](https://openrouter.ai/settings/keys) کلید بسازید و در Settings → OpenRouter ذخیره و تست کنید. Refresh free models فهرست فعلی مدل‌های رایگان را می‌گیرد؛ مدل دلخواه را انتخاب و Save model را بزنید. قیمت صفر به معنی دسترسی نامحدود نیست.

در صفحه ایده، Request AI Second Opinion و سپس تأیید ارسال لازم است. فقط موضوع تحریریه‌ای، مفهوم و تصمیم شخصی در پیش‌نمایش ارسال دیده می‌شود. داده‌های API شامل عنوان/توضیحات/آمار، یادداشت‌ها و لینک‌های ویدیو به OpenRouter ارسال نمی‌شوند. خودتان هم آمار یا داده API را داخل این فیلدها نچسبانید. پاسخ AI یک نظر ذهنی است و می‌تواند مخالف باشد. نبود مدل، محدودیت نرخ و کلید نامعتبر مدیریت می‌شوند. درخواست تولید POST خودکار تکرار نمی‌شود.

## فضای محلی

- Opportunities: ایجاد، ویرایش، ذخیره، حذف با تأیید، بایگانی، دسته‌بندی و تصمیم شخصی.
- My Library: ذخیره لینک، برچسب شخصی، موضوع، پوشه، تگ و یادداشت؛ جستجو و مرتب‌سازی و خروجی لینک‌ها. جست‌وجوی محلی در Library، Notes و Opportunities همه واژه‌های عبارت را مستقل از ترتیب بررسی می‌کند و حروف رایج فارسی/عربی، اعراب، نیم‌فاصله و اعداد فارسی/عربی را نرمال می‌کند؛ این قابلیت تصحیح املای تقریبی نیست. دانلود ویدیو، صدا یا زیرنویس وجود ندارد.
- Notes: صفحه، پوشه، تگ، عنوان، پاراگراف، بولت، چک‌لیست و ارجاع به لینک/ویدیو/ایده. ترتیب بلوک‌ها را با Move block up/down تغییر دهید. ابتدا صفحه را نام‌گذاری و Save page را بزنید؛ لینک به صفحه حذف‌شده صفحه تازه نمی‌سازد.

اطلاعات YouTube در جداول جدا هستند و پس از ۲۹ روز منقضی می‌شوند. پاک‌سازی هنگام راه‌اندازی، فعال‌شدن برنامه، ذخیره و بررسی ساعتی در حال اجرا انجام می‌شود؛ وقتی Android برنامه را متوقف کرده است، زمان حذف فیزیکی فایل تضمین نمی‌شود، ولی داده منقضی‌شده هنگام استفاده حذف و نمایش داده نمی‌شود. لینک‌ها و متن‌هایی که شخصاً نگه داشته‌اید باقی می‌مانند. از استثنای کلی نگهداری دائمی تمام شناسه‌های API استفاده نمی‌شود؛ ارجاع‌های خودکار بدون متادیتا یا بوک‌مارک شخصی پاک می‌شوند.

## پشتیبان و انتقال به گوشی دیگر

۱. Settings → Backup & phone transfer → Export backup.
۲. فایل `mohsen-scout-backup.json` را در محل امن یا از طریق share sheet ذخیره/منتقل کنید. این فایل رمزگذاری‌شده نیست و شامل یادداشت‌های شخصی است؛ با افراد ناشناس به اشتراک نگذارید.
۳. برنامه را روی گوشی دوم نصب کنید. Choose backup to restore را بزنید، فایل را انتخاب و تعداد موارد را بررسی کنید، سپس Confirm restore.
۴. داده‌های شخصی جایگزین می‌شوند؛ روی دستگاه فعلی شمارنده سهمیه و متادیتای معتبر حفظ می‌شوند. زمان‌بندی به Manual برمی‌گردد. پاسخ AI قبلی فقط وقتی شناسه ایده و موضوع/مفهوم/تصمیم آن تغییر نکرده باشد باقی می‌ماند. کلیدها داخل فایل نیستند و در گوشی جدید باید دوباره وارد شوند.
۵. محدودیت فایل ۲۰MB است. فایل نامعتبر قبل از تغییر داده رد می‌شود. نسخه فعلی پشتیبان شماره ۱ است.

خروجی شامل صفحات، لینک‌ها، پوشه‌ها، تگ‌ها، ایده‌ها و ترجیحات است. تمام متادیتای API، نتایج پژوهش، پاسخ‌های AI، کلیدها، شمارنده سهمیه و وضعیت وابسته به دستگاه حذف شده‌اند. پشتیبان خودکار سیستم Android غیرفعال است؛ از خروجی شخصی استفاده کنید.

## زمان‌بندی

حالت پیش‌فرض Manual است. پس از یک پژوهش دستی می‌توان Every 12 hours، Daily یا Weekly انتخاب کرد. Save schedule را بزنید. موضوع آخر و بودجه همان روز استفاده می‌شود. Pause/Resume و اجازه اعلان وجود دارد. Android زمان واقعی را تعیین می‌کند؛ force-stop، محدودیت باتری و نبود شبکه می‌توانند اجرا را عقب بیندازند. این قابلیت در مرورگر وجود ندارد و باید در build نصب‌شده Android آزمایش شود. پردازش همیشه‌روشن یا polling شبکه‌ای نداریم.

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
- **Trend Intelligence:** uses the personal YouTube Data API key. One sample uses `search.list` ordered by YouTube view count (100 quota units) and `videos.list` for raw view counts (1 unit), and `channels.list` for public channel size (1 unit). A popularity sample is not a full market census; no views/hour, fake velocity or composite competition score is shown.
- **Search Demand:** compares up to three Wikipedia article pageview histories from the selected language edition. Pageviews are a public-interest proxy, not Google search volume, unique people, country-level audience data or YouTube views. Google Trends programmatic access is currently a limited alpha; the app opens the Trends website for manual country/term comparison rather than pretending a public API is available.
- **Deep Research:** after the user chooses a topic, combines selected official news, optional Wikimedia context and optional YouTube sample into a source-linked outline, title ideas and verification checklist. The resulting brief can be saved into the existing Notes workspace. No source metadata or YouTube statistics are sent to OpenRouter.
- Network data is requested only on user action and cached in memory for ten minutes. There is no background polling or persistent large research database. Source providers are isolated behind small adapters so a replacement can map into the same result shape.

The new Space settings are local preferences. Existing version-1 backups remain importable; missing Space settings are filled with conservative defaults during validation/migration.

## بررسی

Settings → App info → Run mock regression checks یا مسیر `/diagnostics` برای تست‌های مصنوعی است. ۳۵ تست در پیش‌نمایش مرورگر اجرا و همگی قبول شدند. این تست‌ها تماس زنده API نیستند. وضعیت دقیق و موارد آزمایش‌نشده در `TEST_RESULTS.md` آمده است.


## MOHSEN SCOUT v1.16.0 — ارتقای موتور تحقیق

- موتور تحقیق وب اکنون یک برنامه سه‌زاویه‌ای محدود اجرا می‌کند: جست‌وجوی مستقیم موضوع، یافتن منبع اولیه/رسمی، و جست‌وجوی روش‌شناسی، محدودیت‌ها و شواهد مخالف.
- هر زاویه مستقل اجرا می‌شود؛ خطای یک جست‌وجو مانع استفاده از نتایج زاویه‌های دیگر، خوراک‌های ناشران یا ویکی‌مدیا نمی‌شود.
- نتایج وب با URL استاندارد ادغام می‌شوند و فهرست عبارت‌های جست‌وجوشده در گزارش تحقیق قابل مشاهده است.
- موتور چنددیدگاهی فقط شواهد ناشران مستقل و تاریخچه ویکی‌مدیا را تحلیل می‌کند. داده‌های YouTube در مسیر جداگانه و کوتاه‌عمر باقی می‌مانند و در استنتاج، امتیاز، حافظه یا پرامپت AI استفاده نمی‌شوند.
- این ارتقا به معنی اثبات صحت خودکار ادعاها یا پیش‌بینی تقاضا، بازدید، درآمد یا وایرال‌شدن نیست. خروجی‌ها فرضیه‌های تحقیق‌اند و باید به منبع اولیه رجوع شود.
