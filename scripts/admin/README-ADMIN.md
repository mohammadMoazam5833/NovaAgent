# NovaAgent — پنل مدیریت و مانیتورینگ (Admin Panel)

پنل مدیریت سرور NovaAgent برای مدیریت و مانیتورینگ کاربران (tenants)، سرویس‌ها، گفتگوها و وضعیت هوش مصنوعی.

## دسترسی

```
http://172.16.40.188:8000/admin
```

- رمز ورود در فایل `~/.nova-admin-env` روی سرور (chmod 600) نگه‌داری می‌شود.
- نشست ورود ۱۲ ساعت اعتبار دارد (کوکی امضاشده HMAC) و بعد از آن دوباره باید وارد شوید.
- محدودیت تلاش ناموفق: ۱۰ بار در ۵ دقیقه.

## امکانات

### داشبورد
- وضعیت لحظه‌ای همهٔ سرویس‌ها (ingress، gateway، automation، admin، agent-server هر کاربر)
- آپ‌تایم سرور، مصرف RAM و دیسک، بار CPU
- کلاینت‌های متصل از طریق Gateway (چه کاربرهایی آنلاین‌اند)
- وضعیت هوش مصنوعی: vLLM محلی (qwen3-coder-30b) و Gateway شرکتی با زمان پاسخ
- به‌روزرسانی خودکار هر ۱۰ ثانیه

### کاربران (Tenants)
- فهرست همهٔ کاربران با وضعیت سرویس، اتصال کلاینت، سلامت agent، تعداد گفتگوها و حجم فضای سرور
- ری‌استارت / توقف / راه‌اندازی سرویس هر کاربر
- **ایجاد کاربر جدید:** پورت، SESSION_API_KEY، OH_SECRET_KEY و فضای کاری خودکار ساخته می‌شود؛ سرویس `nova-agent-server@<name>` فعال می‌شود و رجیستری `~/.nova-customers.json` به‌روز می‌شود (ingress بلافاصله مسیردهی می‌کند)
- **حذف کاربر:** سرویس متوقف و از رجیستری حذف می‌شود (فایل‌های فضای کاری حفظ می‌شوند)
- کاربر `default` قابل حذف نیست

### گفتگوها
- ۵۰ گفتگوی اخیر هر کاربر (عنوان، شناسه، زمان ساخت، آخرین فعالیت)

### لاگ‌ها
- مشاهدهٔ journalctl سرویس‌ها (۵۰ تا ۵۰۰ خط آخر)

## معماری

- فایل: `nova-admin.mjs` (Node.js خالص، بدون وابستگی)
- اجرا به‌صورت سرویس root: `systemctl status nova-admin` — روی `127.0.0.1:18002`
- دسترسی فقط از طریق ingress (`/admin`) — مستقیماً از شبکه قابل دسترس نیست
- منابع خوانده‌شده:
  - `~/.nova-customers.json` — رجیستری کاربران (name, token, roots, port)
  - `~/.nova-env` و `~/nova-tenants/<name>.env` — متغیرهای هر tenant
  - `18766/health` — وضعیت اتصال کلاینت‌ها
  - `~/.local/share/opencode/auth.json` — کلید LLM شرکتی

## استقرار

```bash
sudo cp nova-admin.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nova-admin
```

متغیرهای محیطی (در `~/.nova-admin-env`):
- `ADMIN_PASSWORD` — رمز ورود پنل
- `ADMIN_SECRET` — کلید امضای کوکی نشست (تصادفی، ۶۴ کاراکتر hex)

## تغییر رمز پنل

```bash
nano ~/.nova-admin-env   # ADMIN_PASSWORD را عوض کنید
sudo systemctl restart nova-admin
```
