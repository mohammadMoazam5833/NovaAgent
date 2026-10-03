# NovaAgent â€” Backend Deployment

Ù…Ø¹Ù…Ø§Ø±ÛŒ Ø§Ø³ØªÙ‚Ø±Ø§Ø± NovaAgent Ø±ÙˆÛŒ Ø³Ø±ÙˆØ± (VM) â€” Ù‡Ù…Ù‡â€ŒÚ†ÛŒØ² Ø§Ø² Ø¨Ú©â€ŒØ§Ù†Ø¯ ØªØ§ ÙØ±Ø§Ù†Øª.

## Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ (systemd)

| Ø³Ø±ÙˆÛŒØ³ | Ù¾ÙˆØ±Øª | Ù†Ù‚Ø´ |
|---|---|---|
| `nova-ingress.service` | 8000 | Ø¯Ø±Ú¯Ø§Ù‡ Ø¹Ù…ÙˆÙ…ÛŒ: Ø³Ø±Ùˆ UI + Ù¾Ø±ÙˆÚ©Ø³ÛŒ API + Ù¾Ø±ÙˆÚ©Ø³ÛŒ LLM |
| `nova-gateway.service` | 18766 | Ù‡Ø§Ø¨ WebSocket Ø¨Ø±Ø§ÛŒ Ú©Ù„Ø§ÛŒÙ†Øªâ€ŒÙ‡Ø§ (Ø§ØªØµØ§Ù„/ÙˆØ¶Ø¹ÛŒØª/Ø±ÛŒÙ…ÙˆØª) |
| `nova-agent-server.service` | 18000 | agent-server Ù…Ø´ØªØ±ÛŒ Ù¾ÛŒØ´â€ŒÙØ±Ø¶ (SDK + sidecar bridge) |
| `nova-agent-server@<tenant>.service` | 18010+ | agent-server Ù‡Ø± Ù…Ø´ØªØ±ÛŒ (Ø³Ø±ÙˆÛŒØ³ template) |
| `nova-automation.service` | 18001 | Ø³Ø±ÙˆÛŒØ³ automation |

Ù†ØµØ¨ ÙˆØ§Ø­Ø¯Ù‡Ø§:
```bash
sudo cp scripts/deploy/nova-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nova-gateway nova-agent-server nova-automation nova-ingress
```

## ingress

`scripts/deploy/nova-ingress.mjs` â€” Ú©Ù¾ÛŒ Ø²Ù†Ø¯Ù‡Ù” Ø¯Ø±Ú¯Ø§Ù‡:
- Ø³Ø±Ùˆ UI Ø§Ø³ØªØ§ØªÛŒÚ© Ø§Ø² `build/` Ø¨Ø§ ØªØ²Ø±ÛŒÙ‚ session key / Ø¢Ø¯Ø±Ø³ LLM gateway / ØªÚ©Ù…ÛŒÙ„ onboarding
- Ø§Ù†ØªØ®Ø§Ø¨ tenant Ø¨Ø§ Ú©ÙˆØ¦Ø±ÛŒ `?t=<token>` ÛŒØ§ fallback Ø¨Ù‡ Ú©ÙˆÚ©ÛŒ `ns_t`
- Ù¾Ø±ÙˆÚ©Ø³ÛŒ `/api/*` Ø¨Ù‡ agent-server Ù…Ø´ØªØ±ÛŒ Ùˆ `/llmapi/*` Ø¨Ù‡ LLM gateway

Ø§Ø¬Ø±Ø§ÛŒ Ù…Ø³ØªÙ‚ÛŒÙ…:
```bash
node scripts/deploy/nova-ingress.mjs
```

## Ø³Ø§Ø®Øª Ù…Ø´ØªØ±ÛŒ Ø¬Ø¯ÛŒØ¯

```bash
sudo scripts/deploy/nova-adduser.sh <tenant>
sudo scripts/deploy/nova-customer.sh <tenant>
sudo systemctl enable --now nova-agent-server@<tenant>
```

- ÙØ§ÛŒÙ„ Ù…Ø­ÛŒØ· Ù‡Ø± Ù…Ø´ØªØ±ÛŒ: `/home/<user>/nova-tenants/<tenant>.env`
- Ú©Ù„ÛŒØ¯Ù‡Ø§ÛŒ Ù…Ø­ÛŒØ· Ø³Ø±ÙˆØ±: `~/.nova-env` (Ù†Ù…ÙˆÙ†Ù‡: `nova-env.example`ØŒ Ø¯Ø³ØªØ±Ø³ÛŒ 600)

## Ù‡ÙˆÛŒØª Ø§ÛŒØ¬Ù†Øª (white-label)

`scripts/deploy/SOUL.md` â€” ÙØ§ÛŒÙ„ Ù‡ÙˆÛŒØª NovaAgent Ú©Ù‡ Ø¯Ø± `~/.openhands/SOUL.md`
Ù‡Ø± Ù…Ø´ØªØ±ÛŒ Ú©Ù¾ÛŒ Ù…ÛŒâ€ŒØ´ÙˆØ¯ Ùˆ Ø¯Ø± Ø´Ø±ÙˆØ¹ Ù‡Ø± conversation ØªÙˆØ³Ø· SDK Ø®ÙˆØ§Ù†Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯
(Ø¨Ø¯ÙˆÙ† Ø§Ø´Ø§Ø±Ù‡ Ø¨Ù‡ Ù…Ù†Ø¨Ø¹ä¸Šæ¸¸). Ù…ØªÙ† Ù‡ÙˆÛŒØª Ø¯Ù‚ÛŒÙ‚: Ù†Ø§Ù… Ù„Ø§ØªÛŒÙ† Â«NovaAgentÂ».

## Ú©Ù„Ø§ÛŒÙ†Øªâ€ŒÙ‡Ø§ (thin client)

- UI Ø¨Ù‡â€ŒØµÙˆØ±Øª Ø²Ù†Ø¯Ù‡ Ø§Ø² `build/` Ù‡Ù…ÛŒÙ† Ø±ÛŒÙ¾Ùˆ Ø³Ø±Ùˆ Ù…ÛŒâ€ŒØ´ÙˆØ¯Ø› Ú©Ù„Ø§ÛŒÙ†Øªâ€ŒÙ‡Ø§ (Windows
  portable / Linux deb Ùˆ AppImage) ÙÙ‚Ø· Ù¾ÙˆØ³ØªÙ‡Ù” Electron Ù‡Ø³ØªÙ†Ø¯ Ùˆ Ø¨Ù‡
  `remote-client.json` (Ø¢Ø¯Ø±Ø³ Ø³Ø±ÙˆØ±) Ù†ÛŒØ§Ø² Ø¯Ø§Ø±Ù†Ø¯.
- Ø¨ÛŒÙ„Ø¯ Ú©Ù„Ø§ÛŒÙ†Øªâ€ŒÙ‡Ø§: `npm run build:desktop:thin` (Ù„ÛŒÙ†ÙˆÚ©Ø³) Ùˆ
  `npm run build:desktop:thin:win` (ÙˆÛŒÙ†Ø¯ÙˆØ²).

