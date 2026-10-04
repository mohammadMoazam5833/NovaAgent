#!/usr/bin/env node
/**
 * Local-only company LLM auth shim for Hybrid / company-managed mode testing.
 *
 * NovaAgent expects:
 *   POST {base}/auth/login  → { access_token }
 *   GET  {base}/v1/models   (Bearer)
 *   POST {base}/v1/chat/completions (Bearer / api_key)
 *
 * This shim mints the CodeBot API key as access_token (local test only —
 * a production gateway would mint real short-lived tokens) and proxies
 * OpenAI-compatible /v1/* to CodeBot, with optional raw vLLM fallback.
 *
 * Usage:
 *   CODE_BOT_API_KEY=sk-... node scripts/company-llm-shim.mjs
 *   # or: CODE_BOT_API_KEY_FILE=~/.config/llm_fastapi/code_bot_api_key
 *
 * Then (same machine):
 *   NOVAAGENT_COMPANY_LLM_URL=http://127.0.0.1:18080 npm run desktop
 *
 * LAN clients (other PCs on the network) need the shim on all interfaces
 * and a company URL that is NOT 127.0.0.1:
 *   COMPANY_LLM_SHIM_HOST=0.0.0.0 CODE_BOT_API_KEY=… node scripts/company-llm-shim.mjs
 *   NOVAAGENT_COMPANY_LLM_URL=http://<LAN_IP>:18080 npm run desktop
 *
 * Do NOT commit real API keys. Rotate any key pasted into chat/logs.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOST = process.env.COMPANY_LLM_SHIM_HOST || "127.0.0.1";
const PORT = Number(process.env.COMPANY_LLM_SHIM_PORT || 18080);
const CODEBOT_BASE = (
  process.env.CODE_BOT_BASE_URL || "http://127.0.0.1:8001/code_bot/v1"
).replace(/\/$/, "");
const VLLM_BASE = (
  process.env.VLLM_BASE_URL || "http://127.0.0.1:8003/v1"
).replace(/\/$/, "");

const DEFAULT_KEY_FILE = join(
  homedir(),
  ".config/llm_fastapi/code_bot_api_key",
);

function loadApiKey() {
  const fromEnv = process.env.CODE_BOT_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const keyFile =
    process.env.CODE_BOT_API_KEY_FILE?.trim() || DEFAULT_KEY_FILE;
  if (existsSync(keyFile)) {
    const key = readFileSync(keyFile, "utf8").trim();
    if (key) return key;
  }

  throw new Error(
    "Set CODE_BOT_API_KEY or CODE_BOT_API_KEY_FILE (or place key at " +
      `${DEFAULT_KEY_FILE})`,
  );
}

const API_KEY = loadApiKey();

function redact(value) {
  if (!value || value.length < 12) return "***";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function corsPreflight(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * @param {string} upstreamBase
 * @param {string} pathWithQuery  e.g. /models or /chat/completions
 * @param {import('node:http').IncomingMessage} req
 * @param {Buffer} body
 * @param {{ auth?: string | null }} opts
 */
async function proxyUpstream(upstreamBase, pathWithQuery, req, body, opts = {}) {
  const url = `${upstreamBase}${pathWithQuery}`;
  const headers = {
    Accept: req.headers.accept || "application/json",
    "Content-Type": req.headers["content-type"] || "application/json",
  };
  const auth = opts.auth;
  if (auth) {
    headers.Authorization = auth.startsWith("Bearer ")
      ? auth
      : `Bearer ${auth}`;
  }

  const init = {
    method: req.method || "GET",
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = body;
  }

  const response = await fetch(url, init);
  const buf = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: buf,
    url,
  };
}

function openAiPath(urlPath) {
  // Accept /v1/... from company client
  if (urlPath === "/v1" || urlPath.startsWith("/v1/")) {
    return urlPath.slice("/v1".length) || "/";
  }
  return null;
}

/**
 * LiteLLM stores models as `openai/<id>` for custom OpenAI-compatible
 * gateways, but upstream CodeBot/vLLM catalogs use the bare id. Strip a
 * leading `openai/` from chat completion bodies before proxying.
 */
function stripOpenAiProviderPrefixFromBody(body) {
  if (!body?.length) return body;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.model === "string" &&
      /^openai\//i.test(parsed.model)
    ) {
      parsed.model = parsed.model.replace(/^openai\//i, "");
      return Buffer.from(JSON.stringify(parsed), "utf8");
    }
  } catch {
    // leave body unchanged
  }
  return body;
}

const server = createServer(async (req, res) => {
  const method = (req.method || "GET").toUpperCase();
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    corsPreflight(res);
    return;
  }

  try {
    if (method === "POST" && path === "/auth/login") {
      // Accept any username/password for local test; return CodeBot key as token.
      let username = "";
      try {
        const raw = await readBody(req);
        if (raw.length) {
          const parsed = JSON.parse(raw.toString("utf8"));
          username =
            typeof parsed.username === "string" ? parsed.username : "";
        }
      } catch {
        // ignore bad body — still mint local test token
      }
      console.log(
        `[shim] login ok user=${username || "(any)"} token=${redact(API_KEY)}`,
      );
      sendJson(res, 200, {
        access_token: API_KEY,
        token_type: "bearer",
        // Local test only — production gateways mint real short-lived JWTs.
        note: "local-test-shim: access_token is the CodeBot API key",
      });
      return;
    }

    const openaiSuffix = openAiPath(path);
    if (openaiSuffix !== null) {
      const pathWithQuery = `${openaiSuffix}${url.search}`;
      let body = await readBody(req);
      if (
        method === "POST" &&
        (openaiSuffix === "/chat/completions" ||
          openaiSuffix.startsWith("/chat/completions"))
      ) {
        body = stripOpenAiProviderPrefixFromBody(body);
      }
      const inboundAuth =
        req.headers.authorization ||
        (typeof req.headers["x-api-key"] === "string"
          ? req.headers["x-api-key"]
          : null) ||
        API_KEY;

      let result;
      try {
        result = await proxyUpstream(
          CODEBOT_BASE,
          pathWithQuery,
          req,
          body,
          { auth: inboundAuth },
        );
        if (result.status >= 500 || result.status === 404) {
          throw new Error(`CodeBot HTTP ${result.status}`);
        }
      } catch (err) {
        console.warn(
          `[shim] CodeBot failed (${err instanceof Error ? err.message : err}); trying vLLM ${VLLM_BASE}`,
        );
        // Raw vLLM often has no auth — omit Bearer if fallback.
        result = await proxyUpstream(VLLM_BASE, pathWithQuery, req, body, {
          auth: null,
        });
      }

      console.log(
        `[shim] ${method} ${path} → ${result.url} (${result.status})`,
      );

      const outHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type":
          result.headers["content-type"] || "application/json",
      };
      if (result.headers["content-type"]) {
        outHeaders["Content-Type"] = result.headers["content-type"];
      }
      res.writeHead(result.status, outHeaders);
      res.end(result.body);
      return;
    }

    if (method === "GET" && path === "/health") {
      sendJson(res, 200, {
        ok: true,
        codebot: CODEBOT_BASE,
        vllm_fallback: VLLM_BASE,
        token: redact(API_KEY),
      });
      return;
    }

    sendJson(res, 404, { error: `No route for ${method} ${path}` });
  } catch (err) {
    console.error("[shim] error", err);
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  const clientHost =
    HOST === "0.0.0.0" || HOST === "::" || HOST === "*"
      ? "<LAN_IP>"
      : HOST;
  console.log(
    `[company-llm-shim] listening ${HOST}:${PORT}  codebot=${CODEBOT_BASE}  vllm=${VLLM_BASE}  key=${redact(API_KEY)}`,
  );
  console.log(
    `[company-llm-shim] NOVAAGENT_COMPANY_LLM_URL=http://${clientHost}:${PORT}`,
  );
});
