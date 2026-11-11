# شروع اجرای محلی WordPress MCP برای seosir.ir — ویندوز

## شرایط تأییدشده

- `https://seosir.ir/wp-json/ai-bridge/v1/capabilities` با Application Password خصوصی کاربر `mcp-editor`: **HTTP 200** (تأیید کاربر در گفتگو).
- Yoast و Elementor فعال‌اند.
- تست آنلاین مستقیم از محیط ساخت پروژه با رمز کاربر انجام نشده است.

## امنیت قبل از شروع

رمزی که قبلاً در گفتگو منتشر شد باید در وردپرس لغو شود. رمز معتبر **خصوصی و جدید** را فقط روی سیستم خودتان وارد کنید. افزونه عیب‌یابی موقت `Seosir MCP Auth Inspector` را در پیشخوان غیرفعال و حذف کنید؛ برای اجرای MCP دیگر نیاز نیست. `ENABLE_ELEMENTOR_WRITES` در این فاز غیرفعال می‌ماند.

## قدم ۱: نصب Node.js

نسخه LTS Node.js (ترجیحاً 22 یا جدیدتر سازگار) را از وب‌سایت رسمی نصب کنید: https://nodejs.org . سپس PowerShell تازه‌ای باز کنید:

```powershell
node --version
npm --version
```

## قدم ۲: نصب پروژه

فایل ZIP پروژه را در مسیر دلخواه Extract کنید. PowerShell را در پوشه ریشه باز کنید (جایی که پوشه `mcp` و `windows` وجود دارد):

```powershell
cd .\mcp
npm install
npm run typecheck
npm test
cd ..
```

اگر در مرحله npm خطا آمد، متن خطای **بدون توکن/رمز** را ارسال کنید. هیچ secret داخل Git یا فایل zip قرار ندارد.

## قدم ۳: اجرای امن MCP روی سیستم خودتان

ابتدا رمز خصوصی **جدید** را در Clipboard کپی کنید. رمز افشاشده قبلی باید لغو شده باشد.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\start-local.ps1
```

پس از اجرای موفق `npm run typecheck`، رمز خصوصی جدید Application Password را در صفحه وردپرس **کپی** کنید و بلافاصله اسکریپت را اجرا کنید. نسخه اصلاح‌شده رمز را از **Clipboard** می‌خواند (از `Read-Host -AsSecureString` استفاده نمی‌کند)، طول ۲۴ کاراکتری را بررسی می‌کند و سپس Clipboard را پاک می‌کند. اسکریپت رمز را در `.env` نمی‌نویسد. توکن آزمایشی MCP در همان پنجره فقط **برای استفاده خودتان** یک‌بار چاپ می‌شود. این توکن را در گفتگو ارسال نکنید. سرور فقط روی `127.0.0.1` اجرا می‌شود.

## قدم ۴: بررسی سلامت MCP

PowerShell دوم را در ریشه همان پروژه باز کنید:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\check-local.ps1
```

خروجی مورد انتظار:

```
Health HTTP: 200 (expected 200)
Unauthenticated MCP HTTP: 401 (expected 401)
OAuth resource metadata HTTP: 200 (expected 200)
OK: Local MCP is healthy and rejects unauthenticated access.
```

وضعیت 401 در تست دوم عمدی است؛ تأیید می‌کند MCP بدون توکن اطلاعات سایت را ارائه نمی‌دهد.

## قدم ۵: اتصال MCP Inspector (فقط روی سیستم خودتان)

در پنجره PowerShell سوم:

```powershell
npx @modelcontextprotocol/inspector
```

طبق لینکی که Inspector چاپ می‌کند، Inspector را باز کنید. Transport = `Streamable HTTP`؛ Server URL = `http://127.0.0.1:3000/mcp`؛ در قسمت هدرها، توکن آزمایشی چاپ‌شده در پنجره اول را با مقدار `Authorization: Bearer ...` وارد کنید. ابزارهای `site_info` و `posts_search` را ابتدا اجرا کنید. ابزارهای write را روی سایت اصلی آزمایش نکنید.

### گزارش مطلوب برای مرحله بعد

- `node --version` و `npm run typecheck` موفق/ناموفق
- `Health HTTP`، `Unauthenticated MCP HTTP`، `OAuth resource metadata HTTP`
- نتیجه ابزار `site_info` و `posts_search` در Inspector (فقط نام ابزار و موفق/ناموفق)
- از ارسال هرگونه رمز یا Bearer Token خودداری کنید.

## قدم ۶: استقرار بیرونی

پس از موفقیت لوکال به `render.yaml` می‌رسیم. فایل Render موجود عمداً بدون OAuth واقعی در production اجرا نمی‌شود. **برای رفع این خطا هرگز روی Render مقدار `APP_ENV=development` یا `DEV_BEARER_TOKEN` قرار ندهید.** برای ChatGPT باید OAuth (authorization-code با PKCE و CIMD/DCR) تنظیم شود؛ کلاینت OpenAI Responses API نیز توکن معتبر همان MCP را مصرف می‌کند. این مرحله جداست.
