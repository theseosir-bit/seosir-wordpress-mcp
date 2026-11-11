# اصلاح خطاهای فاز ۳ برای Windows — v0.3.1

## چه چیزهایی اصلاح شده؟
- `mcp/src/auth.ts`: بررسی غیرخالی بودن `sub` در JWT برای رفع خطای TypeScript.
- `mcp/src/server.ts`: یکسان‌سازی نوع `CallToolResult` و `structuredContent` برای ابزارهای MCP.
- `windows/start-local.ps1`: حذف روش `Read-Host -AsSecureString` که هنگام Paste روی سیستم کاربر طول ۰ برمی‌گرداند؛ جایگزین Clipboard که قبلاً با HTTP 200 تست شده بود.
- پیش از خواندن رمز، TypeScript typecheck می‌شود.

## روش استفاده از بسته Patch
ZIP کوچک «Patch» را **در ریشه پوشه پروژه قبلی** (همان پوشه دارای `mcp` و `windows`) Extract کن، و گزینه Replace existing files را بزن. `node_modules`، `.env` و فایل‌های شخصی را حذف نکن. فایل `FIX-README-FA.md` راهنماست.

در PowerShell از پوشه ریشه:

```powershell
cd .\mcp
npm run typecheck
npm test
cd ..
```

وقتی typecheck **بدون خطا** شد، در پیشخوان وردپرس Application Password **خصوصی** را Copy کن و بدون ارسال رمز در چت اجرا کن:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\start-local.ps1
```

در PowerShell دوم:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\check-local.ps1
```

انتظار: Health 200، Unauthorized MCP 401، resource metadata 200.

اگر `npm run typecheck` هنوز خطا داشت، **خودِ متن خطاها با کد TSxxxx و خطوط فایل‌ها** را بدون رمز/توکن بفرست. فقط عبارت «Found 10 errors» برای عیب‌یابی کافی نیست.

## محدودیت اعتبارسنجی
تست‌های npm داخل سورس فقط تست‌های ایستا هستند، نه TypeScript compiler و نه تست یکپارچه با WordPress. نصب وابستگی‌های npm در محیط ساخت بسته به‌دلیل timeout انجام نشد. اصلاحات براساس ساختار SDK v1 انجام شده‌اند و typecheck واقعی روی ویندوز کاربر لازم است.
