# Service Worker kill-switch

بیلد فرانت‌اند به‌طور پیش‌فرض `mockServiceWorker.js` (MSW) را در build می‌گذارد که
در مرورگر کلاینت‌ها همهٔ fetchها را رهگیری می‌کند و مسیر /admin را خراب می‌کند.

**بعد از هر `npm run build`:**
```bash
cp scripts/deploy/mockServiceWorker.killswitch.js build/mockServiceWorker.js
```

این فایل worker قبلیِ ثبت‌شده در مرورگر را unregister و کش‌ها را پاک می‌کند.
