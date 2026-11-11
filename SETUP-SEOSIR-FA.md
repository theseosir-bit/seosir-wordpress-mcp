# راهنمای فاز دوم: اتصال سایت seosir.ir روی هاست اشتراکی

**وضعیت:** این فایل یک دستورالعمل اجرایی و بسته استقرار است؛ هیچ تغییری روی سایت شما انجام نشده است. بررسی آنلاین سایت از محیط تهیه بسته ممکن نبود. قبل از راه‌اندازی، روی استیجینگ یا بعد از بکاپ کامل پیش بروید.

## ۱) هاست اشتراکی: فقط افزونه PHP

- وارد `https://seosir.ir/wp-admin/` شوید.
- از هاست/پیشخوان فایل `ai-wordpress-bridge-phase1.zip` را نصب کنید: افزونه‌ها > افزودن افزونه > بارگذاری افزونه > نصب > فعال‌سازی. این ZIP به‌صورت مستقل در پاسخ ارائه شده و سورس همین افزونه داخل `wordpress/ai-wordpress-bridge/` وجود دارد.
- اگر از File Manager استفاده می‌کنید، پوشه `ai-wordpress-bridge` را به `/public_html/wp-content/plugins/` منتقل کنید (اگر وردپرس داخل public_html نیست، مسیر واقعی وردپرس را استفاده کنید).
- قبل از نصب افزونه جدید بکاپ کامل فایل‌ها و پایگاه داده بگیرید. برای سایت اصلی، ابتدا تست‌های فقط خواندنی را اجرا کنید.

## ۲) تست عمومی REST API بدون نیاز به رمز

این دو آدرس را در مرورگر باز کنید:

- https://seosir.ir/wp-json/
- https://seosir.ir/wp-json/wp/v2/posts?per_page=1

باید JSON دریافت کنید. اگر 403 / 404 / صفحه HTML / صفحه Cloudflare یا ریدایرکت مشاهده کردید، دسترسی REST را با تنظیمات امنیتی، پیوندهای یکتا و هاست بررسی کنید. بدون احراز هویت، فقط به محتوای عمومی می‌توانید دسترسی داشته باشید.

اگر روی کامپیوتر Node.js 22 دارید از ریشه پروژه اجرا کنید:

```bash
node scripts/check-seosir-public.mjs
```

## ۳) ساخت کاربر مخصوص MCP و رمز برنامه

پیشخوان > کاربران > افزودن جدید > نام کاربری `mcp-editor` با نقش Editor. رمز این حساب برای ورود انسان است و **نباید** در MCP استفاده شود. وارد پروفایل همین کاربر شوید و در Application Passwords یک رمز مجزا با نام `Seosir MCP` بسازید.

هشدار: برای تغییر تنظیمات بعضی افزونه‌ها ممکن است نقش Editor کافی نباشد. مجوزهای اضافی را **فقط در صورت نیاز و روی staging** اعطا کنید. نقش Administrator برای نسخه اول لازم نیست.

اطلاعات زیر را فقط روی کامپیوتر خود یا پنل امن میزبان سرویس MCP وارد کنید، نه در چت:

- `WP_URL=https://seosir.ir`
- `WP_USERNAME=mcp-editor`
- `WP_APPLICATION_PASSWORD=...`

برای تأیید اینکه Basic Authorization توسط هاست/WAF عبور می‌کند از تست فقط خواندنی استفاده کنید (Mac/Linux):

```bash
read -r -p 'Username: ' WP_USERNAME
read -r -s -p 'Application password: ' WP_APPLICATION_PASSWORD; echo
export WP_USERNAME WP_APPLICATION_PASSWORD
node scripts/check-seosir-authorized.mjs
unset WP_APPLICATION_PASSWORD
```

نتیجه مطلوب: هر دو endpoint `users/me` و `ai-bridge/v1/capabilities` با HTTP 200 پاسخ بدهند. اگر 401 گرفتید Application Password، Forward شدن هدر Authorization و افزونه امنیتی را بررسی کنید. اگر 403 گرفتید مجوز کاربر و قوانین WAF را بررسی کنید. `404` روی capabilities ممکن است نشانه فعال نبودن افزونه اختصاصی باشد.

## ۴) اجرای MCP روی لپ‌تاپ برای تست محلی

Node.js 22 روی کامپیوتر خود نصب کنید. در پوشه `mcp`:

```bash
npm install
cp .env.seosir.local.example .env
```

در Windows PowerShell:

```powershell
Copy-Item .env.seosir.local.example .env
```

در `.env`، نام کاربر، Application Password و یک `DEV_BEARER_TOKEN` تصادفی حداقل ۳۲ کاراکتری وارد کنید. این فایل را در Git قرار ندهید.

```bash
npm run typecheck
npm test
npm run dev
```

از یک پنجره ترمینال جدید، از ریشه پروژه اجرا کنید:

```bash
node scripts/check-mcp.mjs
```

MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

آدرس `http://127.0.0.1:3000/mcp` و هدر `Authorization: Bearer <DEV_BEARER_TOKEN>` را تنظیم کنید. اول `site_info` و `posts_search` را آزمایش کنید؛ ابزار نوشتن را فقط روی staging تست کنید.

## ۵) استقرار روی Render — مرحله بعد از احراز هویت

در این بسته `render.yaml` قرار داده شده است. Node روی Render اجرا می‌شود؛ هیچ Node.js روی هاست اشتراکی وردپرس نیاز نیست.

1. پروژه را در یک **مخزن خصوصی Git** نگهداری کنید؛ هیچ `.env` یا Application Password داخل مخزن نباشد.
2. Render > New > Blueprint، repo را انتخاب کنید و فایل `render.yaml` را بارگذاری کنید یا از New > Web Service با Root Directory=`mcp` استفاده کنید.
3. مقدارهای `WP_USERNAME` و `WP_APPLICATION_PASSWORD` را در بخش Environment/Secrets وارد کنید.
4. برای production باید **OAuth Authorization Server** سازگار با ChatGPT پیکربندی شود. در Render این ورودی‌ها الزامی‌اند: `PUBLIC_MCP_URL`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL`, `OAUTH_AUDIENCE`, `OAUTH_ALLOWED_SUB`.
5. برای نمونه اگر Render به شما `https://seosir-wordpress-mcp.onrender.com` داد، آدرس MCP برابر `https://seosir-wordpress-mcp.onrender.com/mcp` می‌شود. این مثال است؛ دامنه را از پنل واقعی کپی کنید. باید `OAUTH_AUDIENCE` با `PUBLIC_MCP_URL` دقیقاً یکسان باشد.
6. `APP_ENV=production` و `HOST=0.0.0.0` ضروری‌اند. `DEV_BEARER_TOKEN` در Render **هرگز** وارد نشود. فایل موجود بدون OAuth عمداً راه‌اندازی عمومی را رد می‌کند؛ برای رفع خطا امنیت را خاموش نکنید.
7. بعد از اجرای OAuth، `/healthz` باید 200 باشد و `/mcp` بدون توکن باید 401 برگرداند.

**توجه:** `render.yaml` پلن Starter را پیشنهاد می‌کند (ممکن است هزینه داشته باشد). برای تست کوتاه‌مدت می‌توان پلن Free را به‌صورت دستی بررسی کرد، ولی به دلیل خاموش شدن خودکار و محدودیت‌های منابع برای اتصال پیوسته MCP توصیه نمی‌شود.

## ۶) اتصال دو کلاینت

**ChatGPT:** حساب/workspace باید اجازه اتصال Custom MCP و اقدامات Write را داشته باشد. طبق مستندات فعلی، Full MCP write در Business/Enterprise/Edu عرضه شده است؛ در پلن‌های دیگر ممکن است این سطح دسترسی وجود نداشته باشد. از Plugins > Add custom MCP server آدرس HTTPS `/mcp` را وارد کنید، OAuth را کامل کنید و ابزارها را بررسی کنید.

**OpenAI API:** `src/api-client.ts` با Responses API از همان MCP URL و access token صادرشده توسط OAuth استفاده می‌کند. این روش هزینه و محدودیت API مستقل دارد. برای ایمنی در کد نمونه approval همیشه روشن است.

## ۷) اطلاعات مناسب برای گزارش تست

**فقط نتایج غیرمحرمانه** را اعلام کنید:

- وضعیت `wp-json/`: HTTP 200 یا 403/404/500 و JSON یا HTML
- نتیجه تست API با Application Password: 200 / 401 / 403، بدون نمایش رمز
- نسخه PHP و WordPress؛ فعال بودن Yoast و Elementor
- فعال شدن افزونه AI WordPress Bridge: بله/خیر

رمزها، فایل `.env` و توکن‌ها را به هیچ چتی نفرستید.
