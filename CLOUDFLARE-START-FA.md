# اجرای آزمایشی WordPress MCP روی Cloudflare Workers + D1

دامنه WordPress: `https://seosir.ir` — مخزن موجود: `https://github.com/theseosir-bit/seosir-wordpress-mcp`

> **این نسخه فقط خواندنی است.** پنج ابزار `site_info`، `posts_search`، `posts_get`، `seo_get`، `elementor_outline` دارد. ساخت/ویرایش مقاله، Yoast یا Elementor روی Worker عمداً پیاده‌سازی نشده است. نسخه Express قبلی و افزونه PHP سایت را تغییر نده.
>
> **این نسخه OAuth ندارد.** Bearer Token فقط برای توسعه، MCP Inspector و تست OpenAI Responses API مناسب است. اتصال مستقیم رسمی در ChatGPT به پیاده‌سازی OAuth 2.1 / PKCE در مرحله بعد نیاز دارد و پشتیبانی از عملیات نوشتنی نیز تابع دسترسی پلن ChatGPT است.

## الف. اضافه‌کردن فایل‌ها به GitHub

1. ZIP را در ویندوز Extract کن.
2. **فقط پوشه `cloudflare-worker`** و در صورت تمایل فایل `CLOUDFLARE-START-FA.md` را داخل ریشه پروژه قبلی کپی کن. `mcp/`, `wordpress/` و `windows/` قبلی را دست نزن.
3. در PowerShell ریشه پروژه:

```powershell
git status --short
git add cloudflare-worker CLOUDFLARE-START-FA.md
git diff --cached --check
git status --short
git commit -m "Add Cloudflare Workers readonly MCP and D1"
git push origin main
```

نباید فایل‌های `.dev.vars`, `.env`, رمز Application Password، توکن MCP یا OpenAI API Key در `git status` دیده شوند. اگر دیده شدند Push را متوقف کن. اگر مخزن Public است نیز اشکالی ندارد، **به شرطی که هیچ Secret در آن نباشد**؛ برای کاهش ریسک بهتر است Private باشد.

## ب. نصب ابزارها و ورود به Cloudflare

Node.js 22.16+ (یا نسخه LTS جدیدتر) لازم است؛ تست‌های این بسته از قابلیت Type Stripping در Node استفاده می‌کنند. در ریشه پروژه:

```powershell
cd .\cloudflare-worker
npm install
npm run typecheck
npm test
npx wrangler login
npx wrangler whoami
```

`wrangler login` یک صفحه مرورگر برای اجازه دسترسی به حساب Cloudflare باز می‌کند. این پروژه یک Worker جدا می‌سازد و پروژه قبلی `autumn-block-7dfa` یا دیتابیس قبلی را تغییر نمی‌دهد.

اگر خطای `npm run typecheck` گرفتی متن کامل خطاهای TypeScript را بفرست، **بدون مقدار Secret**. کدها در محیط تولید بسته از نظر Syntax بررسی شده‌اند، اما نصب وابستگی npm در آن محیط در دسترس نبود.

## پ. ایجاد دیتابیس اختصاصی D1

```powershell
npx wrangler d1 create seosir-wordpress-mcp-db --location weur
```

دستور، `database_id` جدیدی شبیه UUID نشان می‌دهد. مقدار آن را (فقط UUID، نه اطلاعات ورود) در فایل `cloudflare-worker/wrangler.jsonc` به‌جای `REPLACE_WITH_D1_DATABASE_UUID` قرار بده. اگر قبلاً دیتابیسی با این نام ساختی، به‌جای ایجاد دوباره از همان database_id استفاده کن.

سپس جدول Audit را بساز:

```powershell
npm run db:remote
```

برای بررسی جدول (بدون دسترسی به رمزها):

```powershell
npx wrangler d1 execute seosir-wordpress-mcp-db --remote --command "SELECT COUNT(*) AS total FROM mcp_audit_events;"
```

D1 فقط متادیتای عملیات مثل نام ابزار، زمان و شناسه عددی پست را ذخیره می‌کند. **مقالات در دیتابیس خود وردپرس باقی می‌مانند.**

## ت. وارد کردن رمزهای محرمانه در Cloudflare

در مسیر `cloudflare-worker` بمان. از Application Password جدید و محرمانه‌ای استفاده کن که قبلاً در PowerShell با HTTP 200 کار کرد. رمزهایی را که در گفتگو فاش کرده بودی لغو شده نگه دار.

```powershell
npx wrangler secret put WP_APPLICATION_PASSWORD
```

رمز را هنگام سؤال به‌صورت مخفی Paste کن؛ با Enter ثبت می‌شود. در Git ذخیره نکن.

یک توکن **تازه و جداگانه** ۶۴ کاراکتری هگز برای Worker بساز:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
Set-Clipboard -Value $token
Write-Host "Token length:" $token.Length
$rng.Dispose()
Remove-Variable token,bytes,rng
```

خروجی باید `Token length: 64` باشد. مقدار Clipboard را در Password Manager خودت ذخیره کن، نه در چت. سپس:

```powershell
npx wrangler secret put STAGING_BEARER_TOKEN
```

توکن ۶۴ کاراکتری را Paste کن و Enter بزن. `wrangler secret put` ممکن است برای Worker تازه یک نسخه ابتدایی Worker ایجاد کند؛ **پیش از تکمیل هر دو Secret و deploy نهایی، سرویس قابل استفاده نخواهد بود**. اگر در ساخت Secret خطای «Worker not found» گرفتی، به بخش عیب‌یابی زیر رجوع کن.

**مهم:** اگر می‌خواهی ابتدا روی لوکال تست کنی، فایل `.dev.vars` را از روی `.dev.vars.example` بساز و رمزها را فقط آنجا وارد کن؛ این فایل در `.gitignore` است و نباید Push شود.

## ث. استقرار Worker

```powershell
npm run deploy
```

در پایان Wrangler آدرس Worker را نشان می‌دهد. آدرسی **شبیه** زیر خواهد بود (این آدرس تا زمان Deploy موفق، واقعی و تأییدشده نیست):

`https://seosir-wordpress-mcp.theseosir.workers.dev/mcp`

## ج. آزمایش آنلاین

۱. اول بدون توکن:

```powershell
curl.exe -i "https://YOUR_WORKER_SUBDOMAIN.workers.dev/mcp"
```

باید `401 Unauthorized` باشد.

۲. سلامت Worker:

```powershell
curl.exe -i "https://YOUR_WORKER_SUBDOMAIN.workers.dev/healthz"
```

باید `200` و `mode=staging-readonly` برگردد. اگر `503` بود، Secrets یا D1 ناقص هستند.

۳. MCP Inspector را اجرا کن:

```powershell
npx @modelcontextprotocol/inspector@latest
```

یک Server جدید اضافه کن، Transport را `Streamable HTTP` و URL را همان HTTPS Worker با `/mcp` بگذار. در Custom Header:

`Authorization: Bearer <STAGING_BEARER_TOKEN>`

روی Connect و سپس Execute Tool کلیک کن. فقط ابزارهای خواندنی را خواهی دید. `site_info` و `posts_search` را امتحان کن. در تصاویر ارسالی نوار آدرس Inspector و مقدار Authorization را مخفی کن.

۴. گزارش D1 را بررسی کن:

```powershell
npx wrangler d1 execute seosir-wordpress-mcp-db --remote --command "SELECT event_time, tool_name, target_id, success FROM mcp_audit_events ORDER BY id DESC LIMIT 5;"
```

### عیب‌یابی

- `401` برای MCP بدون توکن: طبیعی و مطلوب است.
- `401` برای MCP با توکن: Header اشتباه، توکن قبلی یا Secret ثبت نشده.
- `/healthz = 503`: مطمئن شو هر دو Secret ثبت شده‌اند، D1 Binding وجود دارد، `APP_MODE=staging-readonly`، و نام کاربر `mcp-editor` است.
- `WordPress HTTP 401 incorrect_password`: بررسی کن رمز درست در Cloudflare ثبت شده، نه رمز قدیمی/لغوشده. دوباره از PowerShell تست کن.
- `WordPress HTTP 403`: فایروال یا محدودیت IP/Cloudflare-to-origin را بررسی کن؛ سرور از IPهای Cloudflare به WordPress درخواست می‌زند و ممکن است WAF هاست مسیر را مسدود کند.
- خطای `1102`: محدودیت CPU Worker Free؛ باید پردازش سبک‌تر یا پلن دیگری انتخاب شود.
- `Module not found`/peer dependency: `npm install` را دوباره با Node LTS اجرا کن و متن کامل خطای npm را بفرست.
- خطای `D1 database_id` یا Migration: UUID را دقیقاً در wrangler.jsonc وارد و مجدداً `npm run db:remote` اجرا کن.
- تفاوت با WordPress Node MCP قبلی: هیچ نسخه‌ای از کد PHP نصب‌شده را تغییر نده؛ این Worker فقط واسط خواندنی دیگری روی همان REST API است.

### توجه درباره Secrets و ترتیب Deployment

برای اولین Deploy، ممکن است لازم باشد یک بار بدون دسترسی به ابزارها Worker را deploy کنی و بعد `secret put` اجرا کنی. در این صورت **تا زمانی که Secrets درست نشده‌اند، /mcp به‌دلیل configError هیچ ابزاری ارائه نمی‌کند و /healthz 503 می‌دهد**؛ پس Fail-Closed باقی می‌ماند. در هر صورت Secret نباید داخل `wrangler.jsonc` یا Git قرار گیرد.

### گام بعدی

پس از تست موفق Cloudflare، یک Authorization Server واقعی OAuth 2.1 با PKCE S256، metadata discovery، CIMD/DCR و مجوزهای `wordpress:read` و `wordpress:write` می‌سازیم. آنگاه می‌توانیم از D1 یا KV برای state/grants و از Worker برای ابزارهای نوشتنی با تأیید استفاده کنیم. توکن مشترک staging را برای اتصال مستقیم ChatGPT جایگزین OAuth معرفی نکن.
