# NovaAgent — Backend Deployment

معماری استقرار NovaAgent روی سرور (VM) — همه‌چیز از بک‌اند تا فرانت.

## سرویس‌ها (systemd)

| سرویس | پورت | نقش |
|---|---|---|
| `nova-ingress.service` | 8000 | درگاه عمومی: سرو UI + پروکسی API + پروکسی LLM |
| `nova-gateway.service` | 18766 | هاب WebSocket برای کلاینت‌ها (اتصال/وضعیت/ریموت) |
| `nova-agent-server.service` | 18000 | agent-server مشتری پیش‌فرض (SDK + sidecar bridge) |
| `nova-agent-server@<tenant>.service` | 18010+ | agent-server هر مشتری (سرویس template) |
| `nova-automation.service` | 18001 | سرویس automation |

نصب واحدها:
```bash
sudo cp scripts/deploy/nova-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nova-gateway nova-agent-server nova-automation nova-ingress
```

## ingress

`scripts/deploy/nova-ingress.mjs` — کپی زندهٔ درگاه:
- سرو UI استاتیک از `build/` با تزریق session key / آدرس LLM gateway / تکمیل onboarding
- انتخاب tenant با کوئری `?t=<token>` یا fallback به کوکی `ns_t`
- پروکسی `/api/*` به agent-server مشتری و `/llmapi/*` به LLM gateway

اجرای مستقیم:
```bash
node scripts/deploy/nova-ingress.mjs
```

## ساخت مشتری جدید

```bash
sudo scripts/deploy/nova-adduser.sh <tenant>
sudo scripts/deploy/nova-customer.sh <tenant>
sudo systemctl enable --now nova-agent-server@<tenant>
```

- فایل محیط هر مشتری: `/home/<user>/nova-tenants/<tenant>.env`
- کلیدهای محیط سرور: `~/.nova-env` (نمونه: `nova-env.example`، دسترسی 600)

## هویت ایجنت (white-label)

`scripts/deploy/SOUL.md` — فایل هویت NovaAgent که در `~/.openhands/SOUL.md`
هر مشتری کپی می‌شود و در شروع هر conversation توسط SDK خوانده می‌شود
(بدون اشاره به منبع上游). متن هویت دقیق: نام لاتین «NovaAgent».

## کلاینت‌ها (thin client)

- UI به‌صورت زنده از `build/` همین ریپو سرو می‌شود؛ کلاینت‌ها (Windows
  portable / Linux deb و AppImage) فقط پوستهٔ Electron هستند و به
  `remote-client.json` (آدرس سرور) نیاز دارند.
- بیلد کلاینت‌ها: `npm run build:desktop:thin` (لینوکس) و
  `npm run build:desktop:thin:win` (ویندوز).
