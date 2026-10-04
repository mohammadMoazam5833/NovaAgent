# راهنمای کامل نصب و استفاده از NovaAgent

> این راهنما برای نصب از صفر است. مقادیر داخل `<>` را با مقادیر خودت عوض کن.
> سرور آزمایشی فعلی: `172.16.40.188` با کاربر `moazemi-gc` — می‌توانی همان را به‌عنوان مرجع ببینی.

---

## بخش ۱ — نصب سرور (Ubuntu 22/24)

### ۱.۱ پیش‌نیازها
```bash
sudo apt update && sudo apt install -y git curl build-essential python3.12 python3.12-venv
```

### ۱.۲ نصب Node 24
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc
nvm install 24
node -v   # باید v24.x باشد
```

### ۱.۳ نصب uv (مدیر پایتون)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

### ۱.۴ گرفتن کد
```bash
git clone https://<GITHUB-TOKEN>@github.com/mohammadMoazam5833/NovaAgent.git
cd NovaAgent
```

### ۱.۵ بیلد فرانت‌اند
```bash
npm ci
npm run build
cp scripts/deploy/mockServiceWorker.killswitch.js build/mockServiceWorker.js
```
> خط آخر حیاتی است: Service Worker پیش‌فرض پنل ادمین را خراب می‌کند.

### ۱.۶ نصب SDK (سرویس ایجنت)
```bash
uv tool install -e .
agent-server --help   # باید کار کند
```

### ۱.۷ فایل تنظیمات سرور
```bash
mkdir -p ~/nova-tenants
cat > ~/.nova-env <<'EOF'
OH_SECRET_KEY=<۶۴ کاراکتر هگز تصادفی>
SESSION_API_KEY=<کلید نشست پیش‌فرض — ۳۲ کاراکتر هگز>
NOVAAGENT_TENANT=default
NOVAAGENT_CUSTOMER_HOME=/home/<USER>
NOVAAGENT_LOCAL_TOOLS_URL=
NOVAAGENT_LOCAL_TOOLS_TOKEN=
EOF
chmod 600 ~/.nova-env
```
تولید مقادیر تصادفی: `openssl rand -hex 32`

### ۱.۸ کپی فایل‌های اجرایی
```bash
cp nova-ingress.mjs ~/
cp scripts/customer-workspace-gateway.mjs ~/ 2>/dev/null || true
```

### ۱.۹ نصب سرویس‌ها
یونیت‌های `scripts/deploy/*.service` به مسیر `/home/moazemi-gc` و کاربر `moazemi-gc` اشاره می‌کنند.
```bash
sudo cp scripts/deploy/*.service /etc/systemd/system/
sudo sed -i "s/moazemi-gc/<USER>/g" /etc/systemd/system/nova-*.service
sudo systemctl daemon-reload
sudo systemctl enable --now nova-agent-server nova-gateway nova-ingress nova-automation
```

### ۱.۱۰ پنل ادمین
```bash
cp scripts/admin/nova-admin.mjs ~/
cat > ~/.nova-admin-env <<'EOF'
ADMIN_PASSWORD=<رمز پنل>
ADMIN_SECRET=$(openssl rand -hex 32)
EOF
# مقدار ADMIN_SECRET را با خروجی دستور openssl جایگزین کن
chmod 600 ~/.nova-admin-env
sudo cp scripts/admin/nova-admin.service /etc/systemd/system/
sudo sed -i "s/moazemi-gc/<USER>/g" /etc/systemd/system/nova-admin.service
sudo systemctl daemon-reload && sudo systemctl enable --now nova-admin
```

### ۱.۱۱ فایروال
```bash
sudo ufw allow 22/tcp && sudo ufw allow 8000/tcp && sudo ufw allow 8002/tcp
```

### ۱.۱۲ سایت دانلود
```bash
mkdir -p ~/downloads
cp scripts/download-site/index.html ~/downloads/
# آرتیفکت‌های کلاینت (zip/deb/AppImage) را هم در ~/downloads بگذار
```

### ۱.۱۳ اتصال هوش مصنوعی (دو گزینه)
**الف) کلید شرکتی:** فایل `~/.local/share/opencode/auth.json`:
```json
{ "isigpu": { "type": "api_key", "key": "<کلید LLM شرکتی>" } }
```
**ب) vLLM محلی:**
```bash
uvx vllm serve <مدل> --served-model-name <نام> --host 0.0.0.0 --port 8003
```

### ۱.۱۴ تست سرور
```bash
curl http://127.0.0.1:8000/            # اپ → 200
curl http://127.0.0.1:8000/download    # سایت دانلود → 200
curl http://127.0.0.1:8000/admin       # پنل ادمین → صفحه ورود
systemctl status nova-agent-server nova-ingress
```

---

## بخش ۲ — نصب کلاینت (ویندوز)

1. در مرورگر برو به `http://<SERVER-IP>:8000/download`
2. دانلود **NovaAgent-Client-Windows-portable.zip**
3. باز کردن zip و اجرای `NovaAgent-Client.exe`
4. صفحهٔ بوت (لوگو NovaAgent) → پنجرهٔ چت باز می‌شود

**تنظیم آدرس سرور برای مشتری جدید:** داخل پوشهٔ برنامه، فایل
`resources\app\remote-client.json` را ویرایش کن:
```json
{ "baseUrl": "http://<SERVER-IP>:8000" }
```
(در بستهٔ فعلی همین آدرس سرور فعلی baked شده است.)

**نسخهٔ لینوکس:** فایل `.deb` را نصب کن (`sudo dpkg -i *.deb`) یا AppImage را اجرا کن.

---

## بخش ۳ — استفاده روزمره

- **چت با ایجنت:** خواسته‌ات را فارسی بنویس؛ ایجنت کد می‌نویسد، تست می‌زند و نتیجه را زنده نشان می‌دهد.
- **فضای کاری:** ایجنت به پوشه‌هایی که کاربر اجازه دهد دسترسی دارد (roots کاربر).
- **حالت تأیید (قفل):** عملیات حساس قبل از اجرا تأیید می‌خواهد — با آیکن قفل کنار ورودی چت.
- **فهرست وظایف:** برای کارهای چندمرحله‌ای، تسک‌لیست زنده نمایش داده می‌شود.
- **MCP و ابزارها:** از تنظیمات می‌توانی سرور MCP و ابزار اضافه کنی.

---

## بخش ۴ — پنل ادمین

- آدرس: `http://<SERVER-IP>:8000/admin` — رمز را موقع نصب ساختی (۱.۱۰)
- **داشبورد:** وضعیت سرویس‌ها، RAM/CPU/دیسک، کلاینت‌های متصل، وضعیت LLM
- **کاربران:** ساخت کاربر جدید (tenant) با یک کلیک — پورت و کلیدها خودکار ساخته می‌شود؛ لینک «باز کردن اپ» همان کاربر را در NovaAgent باز می‌کند
- **گفتگوها:** ۵۰ گفتگوی اخیر هر کاربر
- **لاگ‌ها:** مشاهده و دانلود لاگ هر سرویس
- **تغییر رمز:** دکمهٔ «تغییر رمز» در نوار بالا

ساخت کاربر پورتال (لاگین وب) با اسکریپت:
```bash
bash scripts/deploy/nova-adduser.sh <username> default
```

---

## بخش ۵ — عیب‌یابی سریع

| مشکل | بررسی |
|---|---|
| اپ باز نمی‌شود | `systemctl status nova-ingress` + `curl 127.0.0.1:8000/` روی سرور |
| کلاینت «متصل نیست» | پنل ادمین → داشبورد → کلاینت‌های متصل؛ فایروال 8000 |
| پنل ادمین رمز نمی‌پذیرد | `sudo systemctl restart nova-admin`؛ رمز در `~/.nova-admin-env` |
| ایجنت جواب نمی‌دهد | پنل → وضعیت هوش مصنوعی؛ `journalctl -u nova-agent-server -f` |
| گفتگوی کاربر جدید نمی‌سازد | `~/nova-tenants/<name>.env` و `~/.nova-customers.json` را چک کن |
| بعد از build مجدد پنل خراب شد | kill-switch را دوباره کپی کن (مرحلهٔ ۱.۵) |

---

## مهاجرت به سرور دیگر
`scripts/deploy/README-MIGRATE.md` + دو اسکریپت `migrate-export.sh` / `migrate-import.sh`
