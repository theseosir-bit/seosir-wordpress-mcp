> **ویژه seosir.ir / هاست اشتراکی:** ابتدا فایل [`SETUP-SEOSIR-FA.md`](SETUP-SEOSIR-FA.md) را بخوانید.

# WordPress Dual-Client MCP — فاز ۱ (نسخه آزمایشی 0.3)

پروژه اختصاصی، بدون محدودیت روزانه افزونه واسط. یک سرور MCP مشترک برای اتصال به ChatGPT و OpenAI Responses API. **این نسخه نیازمند نصب، تنظیم و تست روی یک سایت آزمایشی است؛ محصول آماده استقرار عمومی نیست.**

## 0) نقشه معماری

```text
ChatGPT Plugins -- OAuth 2.1 (PKCE, CIMD/DCR) --┐
                                                ├-- HTTPS MCP server (Node.js)
Your own OpenAI Responses API -- OAuth token ----┘            │
                                                              │ Basic App Password over HTTPS
                                                              ▼
                                              WordPress REST API + AI WordPress Bridge
                                                  ├─ Posts & drafts
                                                  ├─ Yoast SEO metadata
                                                  └─ Elementor outline (read only default)
```

MCP در این پروژه یک **OAuth resource server** است، نه authorization server. برای اتصال ChatGPT در محیط واقعی باید یک IdP سازگار با OAuth 2.1 و PKCE و روش ثبت کلاینت ChatGPT (ترجیحاً CIMD یا DCR) راه بیندازید. JWTهای صادرشده توسط آن IdP باید حاوی audience = URL سرور MCP، `scope` و `sub` شناخته‌شده باشند. **توکن محلی توسعه را به اینترنت منتشر نکنید؛ از آن برای ChatGPT استفاده نمی‌شود.**

## 1) فایل‌های پروژه

```text
wordpress-mcp-phase1/
  wordpress/ai-wordpress-bridge/ai-wordpress-bridge.php
  mcp/src/server.ts
  mcp/src/wp.ts
  mcp/src/auth.ts
  mcp/src/api-client.ts
  mcp/.env.example
  mcp/package.json
  mcp/test/source-sanity.test.mjs
  scripts/check-wordpress.mjs
  scripts/check-mcp.mjs
  deploy/nginx.conf
  deploy/wordpress-mcp.service
```

## 2) نصب افزونه در وردپرس آزمایشی

1. ابتدا از فایل و پایگاه‌داده وردپرس بکاپ بگیرید. روی سایت اصلی شروع نکنید.
2. فایل `ai-wordpress-bridge.zip` که جداگانه در کنار پروژه تحویل داده شده را از **پیشخوان > افزونه‌ها > افزودن > بارگذاری افزونه** نصب و فعال کنید؛ یا پوشه PHP را در `wp-content/plugins` قرار بدهید.
3. برای کارهای محتوایی، یک کاربر مستقل با نقش Editor بسازید؛ در صورت نیاز برای برگه‌ها و افزونه‌ها فقط قابلیت‌های مجاز لازم را اضافه کنید، نه مدیرکل.
4. در **کاربران > شناسنامه کاربر > Application Passwords** یک Application Password مستقل ایجاد کنید. رمز را در Git و چت نفرستید.
5. در مرورگر مسیر `https://YOUR-WORDPRESS.com/wp-json/` را باز کنید تا از فعال بودن REST API مطمئن شوید.
6. دو مسیر پیش‌فرض زیر را با curl آزمایش کنید (استفاده از `-u` ممکن است رمز را در تاریخچه shell ثبت کند؛ برای تست امن‌تر از prompt استفاده کنید):

```bash
# macOS / Linux: do not put the actual password in your chat or commits
read -r -p 'WP username: ' WP_USERNAME
read -r -s -p 'WP application password: ' WP_APPLICATION_PASSWORD; echo
export WP_URL='https://YOUR-WORDPRESS.com'
export WP_USERNAME WP_APPLICATION_PASSWORD
node scripts/check-wordpress.mjs
```

`check-wordpress.mjs` فقط **خواندن** انجام می‌دهد؛ چیزی روی سایت منتشر نمی‌کند. خروجی مورد انتظار: دو پیام `OK` و اطلاعات کاربر + capabilities. اگر PHP افزونه نصب نباشد، مسیر دوم 404 می‌دهد. اگر Application Password یا هدر Authorization توسط WAF/proxy مشکل داشته باشد، خطای 401/403 خواهید دید.

## 3) اجرای MCP روی لپ‌تاپ/سرور آزمایشی

نیازمندی: Node.js 20.19+ و npm، PHP/WordPress روی سایت مقصد.

```bash
cd mcp
npm install
cp .env.example .env
```

در فایل `mcp/.env` جایگزین کنید:

```dotenv
WP_URL=https://YOUR-WORDPRESS.com
WP_USERNAME=mcp-editor
WP_APPLICATION_PASSWORD=your-wordpress-application-password
APP_ENV=development
HOST=127.0.0.1
PORT=3000
PUBLIC_MCP_URL=https://mcp.example.com/mcp
DEV_BEARER_TOKEN=PUT_AT_LEAST_32_RANDOM_CHARACTERS_HERE
```

توکن تصادفی بسازید:

```bash
openssl rand -hex 32
```

در محیط توسعه PUBLIC_MCP_URL فقط یک شناسه HTTPS در متادیتا است؛ دامنه واقعی لازم نیست مگر بخواهید از راه دور وصل شوید. برای اتصال ChatGPT این راه‌اندازی توسعه کافی نیست.

```bash
npm run typecheck
npm test
npm run dev
```

در ترمینال دوم (از پوشه ریشه پروژه):

```bash
node scripts/check-mcp.mjs
```

خروجی مورد انتظار: `/healthz` کد 200، درخواست بدون Bearer به `/mcp` کد 401، و protected-resource metadata کد 200. سپس MCP Inspector را باز کنید:

```bash
npx @modelcontextprotocol/inspector
```

Inspector: **Streamable HTTP**، URL = `http://127.0.0.1:3000/mcp`، هدر `Authorization: Bearer <DEV_BEARER_TOKEN>`.

برای تست امن ابتدا `site_info` و `posts_search` را اجرا کنید. سپس `posts_create_draft` را با عنوان آزمایشی اجرا کنید. پیش‌نویس را در وردپرس ببینید و حذف/اصلاح آن را از پیشخوان انجام دهید.

## 4) ابزارهای فاز ۱

| Tool | نوع | شرط |
| --- | --- | --- |
| `site_info` | read | `wordpress:read` |
| `posts_search` | read | `wordpress:read` |
| `posts_get` | read | `wordpress:read` |
| `seo_get` | read | `wordpress:read` |
| `elementor_outline` | read | `wordpress:read` |
| `posts_create_draft` | write | `wordpress:write` — فقط draft |
| `posts_update_draft` | write | `wordpress:write` — فقط draft و بررسی `expected_modified_gmt` |
| `seo_update` | write | `wordpress:write` — لازم است `revision` قبلی را از `seo_get` بگیرد؛ روی پست publish نیاز به `confirm_live_change=true` دارد |
| `elementor_update_text_experimental` | write | **غیرفعال پیش‌فرض**؛ نیازمند دو تنظیم جدا و `expected_hash` |

**یادآوری:** ابزار تغییر سئو، مقادیر ذخیره‌شده Yoast در postmeta را تغییر می‌دهد. Yoast ممکن است برای خروجی سئو از indexables و بازسازی داده استفاده کند. بعد از تغییر، خروجی HTML رندرشده و head نهایی را بررسی کنید. `focus_keyword` الزاماً نشانه تغییر رتبه گوگل نیست.

**المنتور:** فاز ۱ فقط ساختار را می‌خواند. تغییر مستقیم meta با `AWB_ENABLE_ELEMENTOR_WRITES` و `ENABLE_ELEMENTOR_WRITES` فقط جهت آزمایش در staging وجود دارد، نه برای استفاده در production؛ ذخیره رسمی Elementor و بازسازی CSS باید نسخه‌به‌نسخه آزمایش شود.

## 5) اتصال عملیاتی به ChatGPT

1. سرور Node.js را پشت Nginx و HTTPS اجرا کنید. پورت 3000 نباید از بیرون قابل دسترس باشد.
2. یک Authorization Server / Identity Provider (IdP) مستقل با پشتیبانی OAuth authorization-code + PKCE S256، ساختار CIMD یا DCR و پشتیبانی از `resource` parameter آماده کنید. IdP می‌تواند self-hosted باشد، اما این بسته کد IdP را شامل نمی‌شود.
3. در IdP یک کاربر واقعی با `sub` مشخص بسازید، دسترسی‌ها را به او محدود کنید و access token دارای `scope="wordpress:read wordpress:write"` و `aud` منطبق بر `PUBLIC_MCP_URL` صادر کنید.
4. `OAUTH_ISSUER`، `OAUTH_JWKS_URL`، `OAUTH_AUDIENCE`، `OAUTH_ALLOWED_SUB` را در `.env` تنظیم کنید. `APP_ENV=production` و `DEV_BEARER_TOKEN` را **حذف کنید**.
5. با `npm run build && npm start` و Nginx پروژه را اجرا کنید. روی `/mcp` بدون توکن باید 401 و WWW-Authenticate مناسب برگردد. با توکن معتبر امتحان کنید.
6. در ChatGPT web، از مسیر **Plugins > Add custom MCP server**، URL شما را اضافه کنید و OAuth را تکمیل کنید. دسترسی حساب و ابزارهای write به سیاست workspace و پلن وابسته است.
7. **قبل از واگذاری سایت اصلی** روی وردپرس آزمایشی ابزارهای read، draft و SEO را بررسی کنید.

مستندات رسمی:
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/api/docs/guides/tools-connectors-mcp

## 6) اتصال به OpenAI Responses API

این قسمت به **OpenAI API Key جداگانه** نیاز دارد و هزینه توکن‌های API مستقل از اشتراک ChatGPT است.

در `.env`:

```dotenv
OPENAI_API_KEY=your-secret-api-key
OPENAI_MODEL=gpt-6
MCP_OAUTH_ACCESS_TOKEN=valid-access-token-issued-by-your-IdP
PUBLIC_MCP_URL=https://mcp.YOURDOMAIN.com/mcp
```

سپس:

```bash
npm run chat
```

اسکریپت `src/api-client.ts` از ابزار `mcp` در Responses API با `require_approval:'always'` استفاده می‌کند و برای هر درخواست ابزار، در ترمینال سؤال تأیید می‌پرسد. توکن واقعی را در prompt وارد نکنید. این مثال توکن را از محیط می‌خواند و مدیریت refresh/expiry خودکار ندارد؛ برای production باید جریان OAuth توکن و refresh را تکمیل کنید.

## 7) استقرار Ubuntu (نمونه)

- Node.js 22 LTS و PHP/WordPress به‌روز.
- یک Linux user محدود مثل `wordpress-mcp` ایجاد و پروژه را در `/opt/wordpress-mcp` قرار دهید.
- `npm ci && npm run build` را پس از دسترسی به registry رسمی اجرا کنید. `npm ci` نیاز به `package-lock.json` تولیدشده با `npm install` دارد؛ این ZIP به‌دلیل نبود دسترسی شبکه، lockfile ندارد.
- بعد از ایجاد فایل `.env` (مالکیت و سطح دسترسی فقط برای سرویس)، service نمونه `deploy/wordpress-mcp.service` را مطابق مسیر واقعی Node و کاربر اصلاح کنید.
- تنظیم Nginx در `deploy/nginx.conf` نمونه است؛ دامنه، TLS و تنظیمات امنیتی را مطابق سرور خود تغییر دهید.
- لاگ‌ها نباید شامل توکن یا Application Password باشند.

## 8) چک‌لیست امنیتی قبل از راه‌اندازی روی سایت اصلی

- [ ] کاربران وردپرس دارای least privilege؛ عدم استفاده از Administrator برای ویرایش مقاله
- [ ] WordPress و MCP و OAuth همگی زیر HTTPS
- [ ] OAuth access token با issuer, audience, sub, scope و exp اعتبارسنجی می‌شود
- [ ] DEV_BEARER_TOKEN از production حذف شده است
- [ ] فقط یک WP_URL ثابت؛ هیچ آدرس خارجی از مدل برای ارسال درخواست سرور پذیرفته نمی‌شود
- [ ] دریافت snapshot و بکاپ دیتابیس قبل از ویرایش محتوای اصلی
- [ ] تائید انسانی قبل از انتشار / تغییرات زنده
- [ ] قابلیت پاکسازی/بازگردانی افزونه روی سایت آزمایشی بررسی شده است
- [ ] ارزیابی prompt injection در محتوای بازیابی‌شده از سایت
- [ ] لاگ تغییرات و مانیتورینگ و محدودیت منابع/محافظت DDoS (بدون سهمیه روزانه مصنوعی)

## 9) وضعیت تست این بسته

در محیط آماده‌سازی:
- `php -l` برای فایل افزونه: **موفق**.
- `node --test` برای بررسی‌های منبع: **۳ تست موفق**.
- همه فایل‌های `.ts` با TypeScript transpile شدند و خطای **syntax** نداشتند.
- **تست کامل با npm، runtime MCP، سایت وردپرس، واقعی، ChatGPT یا IdP انجام نشده است.** دسترسی به npm registry در محیط تولید فایل ممکن نبود؛ بسته شامل `node_modules` و lockfile نیست.

## 10) چیزهایی که از مالک سایت برای شروع عملی لازم داریم

- نشانی دامنه **staging** یا سایت آزمایشی وردپرس (بدون ارسال رمز)
- آیا هاست اجازه اجرای مداوم Node.js دارد یا یک VPS مجزا در اختیار دارید؟
- نسخه تقریبی WordPress / Yoast / Elementor و افزونه‌های امنیتی یا WAF

رمز وردپرس، Application Password، API Key، توکن OAuth و فایل `.env` خصوصی را به هیچ‌کس در چت ارسال نکنید.
