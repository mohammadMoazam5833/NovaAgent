# NovaAgent — راهنمای مهاجرت به سرور جدید

هدف: انتقال کامل سامانه (سرور + SDK + پنل ادمین + سایت دانلود) به یک هاست جدید.

## آنچه در git هست (کد و راهنما)

همه‌چیز **به‌جز** موارد بخش بعد، داخل ریپو `NovaAgent` است:
- `src/` — فرانت‌اند + SDK (OpenHands fork)
- `electron/` — کلاینت نازک ویندوز/لینوکس
- `scripts/deploy/` — ingress، یونیت‌های systemd، `nova-env.example`، kill-switch سرویس‌ورکر، همین راهنما
- `scripts/admin/` — پنل ادمین (`nova-admin.mjs` + یونیت + README)
- `scripts/download-site/` — سایت دانلود

## آنچه در git نیست (باید منتقل/بازسازی شود)

| مورد | روش انتقال | حجم |
|---|---|---|
| تنظیمات و رمزها (tenantها، رمز پنل، کلید LLM) | `migrate-export.sh` روی سرور قدیم | چند KB |
| دادهٔ کاربران (گفتگوها/ورک‌اسپیس) | rsync دستی — فهرست در پایین | بزرگ |
| بیلد فرانت‌اند (`build/`) | روی سرور جدید build می‌شود | — |
| آرتیفکت‌های دانلود (zip/deb/AppImage) | rsync `~/downloads` یا build مجدد | ~400MB |
| node_modules / محیط پایتون | `npm ci` + `uv sync` | — |

## مراحل (سرور جدید: Ubuntu 22/24)

### ۱) پیش‌نیازها
```bash
# node 24
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
nvm install 24
# python + uv
sudo apt install -y python3.12 python3.12-venv
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### ۲) کد
```bash
git clone https://<TOKEN>@github.com/mohammadMoazam5833/NovaAgent.git
cd NovaAgent
npm ci
npm run build
cp scripts/deploy/mockServiceWorker.killswitch.js build/mockServiceWorker.js
uv sync   # محیط پایتون SDK
```

### ۳) تنظیمات و رمزها
```bash
# روی سرور قدیم:
bash scripts/deploy/migrate-export.sh
scp ~/nova-migrate-*.tar.gz newserver:~

# روی سرور جدید (داخل ریپو):
bash scripts/deploy/migrate-import.sh ~/nova-migrate-*.tar.gz
```

### ۴) دادهٔ کاربران (rsync از سرور قدیم)
```bash
# tenant های غیر default (کل پوشه‌شان):
rsync -a old:/home/moazemi-gc/nova-tenants/  ~/nova-tenants/

# tenant default (فقط داده‌های agent، نه کل home):
rsync -a old:/home/moazemi-gc/workspace/     ~/workspace/
rsync -a old:/home/moazemi-gc/.openhands/    ~/.openhands/

# سایت دانلود:
rsync -a old:/home/moazemi-gc/downloads/     ~/downloads/
```

### ۵) نکتهٔ کلاینت‌ها ⚠
کلاینت‌های نازک، آدرس سرور را در `remote-client.json` **داخل خود** دارند.
- اگر IP سرور عوض شود → باید بیلد جدید کلاینت با IP جدید بسازید (`npm run build:desktop:thin` + electron-builder) و توزیع کنید.
- **بهترین راه:** IP قدیمی را روی سرور جدید نگه دارید (تغییر IP در هایپروایزر/شبکه) تا کلاینت‌ها دست‌نخورده بمانند.

### ۶) چک‌لیست نهایی
- [ ] `http://<ip>:8000/` — اپ باز می‌شود
- [ ] `http://<ip>:8000/admin` — ورود با رمز پنل (از export)
- [ ] `http://<ip>:8000/download` — سایت دانلود
- [ ] `systemctl status nova-agent-server nova-agent-server@node2` — همهٔ tenantها فعال
- [ ] اتصال کلاینت‌ها (داشبورد پنل → کلاینت‌های متصل)
