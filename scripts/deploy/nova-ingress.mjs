import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { homedir } from "node:os";
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { join, normalize, extname } from "node:path";

const PORT = 8000;
const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 18000;
const AUTOMATION_PORT = 18001;
const ROOT = "/home/moazemi-gc/OpenHands/build";

const COMPANY_LLM_TARGET = "https://llm-api.isigpu.local";
const COMPANY_LLM_PUBLIC = "http://172.16.40.188:8000/llmapi";

const USERS_FILE = join(homedir(), ".nova-users.json");
const CUSTOMERS_FILE = join(homedir(), ".nova-customers.json");

let COMPANY_KEY = "";
try {
  const auth = JSON.parse(
    readFileSync("/home/moazemi-gc/.local/share/opencode/auth.json", "utf8"),
  );
  COMPANY_KEY = auth.isigpu.key;
} catch (e) {
  console.error("[nova-ingress] could not read company key:", e.message);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

const PROXY_PREFIXES = [
  "/api", "/server_info", "/docs", "/redoc", "/openapi.json",
  "/health", "/v1", "/mcp", "/socket", "/ws",
];

function isProxyPath(urlPath) {
  return PROXY_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(p));
}

function loadNovaCustomers() {
  try {
    return JSON.parse(readFileSync(CUSTOMERS_FILE, "utf8")).customers || [];
  } catch {
    return [];
  }
}
function novaCustomerByToken(t) {
  const tok = typeof t === "string" ? t.trim() : "";
  if (!tok) return null;
  for (const c of loadNovaCustomers()) if (c && c.token === tok) return c;
  return null;
}
function novaCustomerByName(n) {
  for (const c of loadNovaCustomers()) if (c && c.name === n) return c;
  return null;
}
// MULTI-TENANT: resolve the calling customer (header token > cookie > default).
function resolveTenant(req) {
  const c = novaCustomerByToken(req.headers["x-session-api-key"]);
  if (c) return c;
  const m = /(?:^|;\s*)ns_t=([^;]+)/.exec(String(req.headers.cookie || ""));
  if (m) {
    const cc = novaCustomerByName(decodeURIComponent(m[1]));
    if (cc) return cc;
  }
  return novaCustomerByName("default") || loadNovaCustomers()[0] || null;
}

function proxyReq(req, res, targetPort = BACKEND_PORT) {
  // QA-PAYLOAD-LOG (temporary diagnostics — remove before release)
  const qaTag = req.method === "POST" && (req.url || "").startsWith("/api/conversations") ? req.url : null;
  if (qaTag) {
    const qaChunks = [];
    req.on("data", (c) => qaChunks.push(c));
    req.on("end", () => {
      try { console.log(`[qa-payload] ${qaTag} body=${Buffer.concat(qaChunks).toString("utf8").slice(0, 1500)}`); } catch {}
    });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }
  const opts = {
    host: BACKEND_HOST,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${targetPort}` },
  };
  const upstream = http.request(opts, (pr) => {
    const headers = { ...pr.headers };
    headers["access-control-allow-origin"] = "*";
    if (qaTag && (pr.statusCode || 0) >= 400) {
      const rb = [];
      pr.on("data", (c) => rb.push(c));
      pr.on("end", () => {
        try { console.log(`[qa-payload] ${qaTag} status=${pr.statusCode} resp=${Buffer.concat(rb).toString("utf8").slice(0, 800)}`); } catch {}
      });
    }
    res.writeHead(pr.statusCode || 502, headers);
    pr.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("NovaAgent ingress: backend not reachable on " + targetPort);
  });
  req.pipe(upstream);
}

function proxyCompanyLlm(req, res) {
  const idx = req.url.indexOf("/llmapi");
  const rest = req.url.slice(idx + "/llmapi".length) || "/";
  const headers = { ...req.headers };
  delete headers.host;
  headers.host = "llm-api.isigpu.local";
  if (COMPANY_KEY) {
    headers.authorization = `Bearer ${COMPANY_KEY}`;
  }
  const opts = {
    hostname: "llm-api.isigpu.local",
    port: 443,
    path: rest,
    method: req.method,
    headers,
  };
  const upstream = https.request(opts, (pr) => {
    const headers = { ...pr.headers };
    headers["access-control-allow-origin"] = "*";
    res.writeHead(pr.statusCode || 502, headers);
    pr.pipe(res);
  });
  upstream.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("NovaAgent ingress: company LLM unreachable: " + e.message);
  });
  req.pipe(upstream);
}

let _companyLlmToken = null;
function getCompanyLlmToken() {
  if (_companyLlmToken) return _companyLlmToken;
  try {
    const a = JSON.parse(readFileSync("/home/moazemi-gc/.local/share/opencode/auth.json", "utf8"));
    const find = (o) => {
      if (o && typeof o === "object") {
        for (const v of Object.values(o)) { const r = find(v); if (r) return r; }
      } else if (typeof o === "string" && (o.startsWith("sk-") || (o.length > 30 && !o.includes(" ")))) {
        return o;
      }
      return null;
    };
    _companyLlmToken = find(a) || "";
  } catch {
    _companyLlmToken = "";
  }
  return _companyLlmToken;
}

function serveIndex(req, res) {
  try {
    // Company LLM URL is baked into the UI build
    // (VITE_NOVAAGENT_COMPANY_LLM_URL at build time) - no runtime inject needed.
    let html = readFileSync(join(ROOT, "index.html"), "utf8");
    // Seed the UI's session-key global so fresh profiles get a default
    // backend instead of the "No agent server backend is configured" screen,
    // and seed the company-LLM session so fresh profiles skip the LLM login.
    const tok = JSON.stringify(getCompanyLlmToken());
    // MULTI-TENANT: bind this UI load to a customer ( ?t=<customer token> ),
    // seed the UI session key with that customer's token and drop a cookie
    // so every API call resolves to the same tenant.
    let tenant = null;
    try {
      const u = new URL(req.url || "/", "http://local");
      tenant = novaCustomerByToken(u.searchParams.get("t"));
    } catch {}
    if (!tenant) {
      // COOKIE-FALLBACK: SPA navigations/reloads can drop the ?t= query.
      // Keep the customer bound to their existing ns_t cookie instead of
      // silently falling back to the default tenant (which made node2
      // sessions land on the default agent-server and list C:\Users\USER).
      try {
        const m = String(req.headers.cookie || "").match(/(?:^|;\s*)ns_t=([^;]+)/);
        if (m) tenant = novaCustomerByName(decodeURIComponent(m[1]));
      } catch {}
    }
    if (!tenant) tenant = novaCustomerByName("default") || loadNovaCustomers()[0] || null;
    const sessKey = tenant && tenant.token ? String(tenant.token) : "novaagent-local";
    const tenantName = tenant ? String(tenant.name || "default") : "default";
    // Company-managed mode: inject the LLM gateway URL at runtime (same
    // origin as this ingress) and mark onboarding complete so customers go
    // straight from login to the app — no "choose your agent" wizard.
    const boot = '<script>window.__AGENT_CANVAS_SESSION_API_KEY__=' + JSON.stringify(sessKey) + ';window.__AGENT_CANVAS_AUTH_REQUIRED__=false;' +
      'window.__NOVAAGENT_COMPANY_LLM_URL__=location.protocol+"//"+location.host+"/llmapi";' +
      'try{localStorage.setItem("openhands-onboarded","1");}catch(e){}' +
      'try{document.cookie="ns_t=' + encodeURIComponent(tenantName) + ';path=/;max-age=31536000;samesite=lax";}catch(e){}' +
      'try{if(!localStorage.getItem("novaagent-company-llm-session")){localStorage.setItem("novaagent-company-llm-session",JSON.stringify({access_token:' + tok + ',username:"company"}));}}catch(e){}</script>';
    if (html.includes("<head>")) {
      html = html.replace("<head>", "<head>" + boot);
    } else {
      html = boot + html;
    }
    html = Buffer.from(html, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": html.length, "Cache-Control": "no-cache" });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end("ingress error: " + e.message);
  }
}

function checkCredentials(username, password) {
  if (!username || !password) return null;
  let users = [];
  try {
    users = JSON.parse(readFileSync(USERS_FILE, "utf8")).users || [];
  } catch {
    return null;
  }
  const user = users.find((u) => u && u.username === username);
  if (!user || !user.salt || !user.hash) return null;
  const h = crypto
    .createHash("sha256")
    .update(`${user.salt}:${password}`)
    .digest("hex");
  const a = Buffer.from(h);
  const b = Buffer.from(String(user.hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let customers = [];
  try {
    customers = JSON.parse(readFileSync(CUSTOMERS_FILE, "utf8")).customers || [];
  } catch {
    return null;
  }
  const cust = customers.find(
    (c) => c && c.name === (user.customer || "default"),
  );
  if (!cust || typeof cust.token !== "string" || !cust.token) return null;
  return { customer: cust.name, token: cust.token };
}

function handleLogin(req, res) {
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 10_000) req.destroy();
  });
  req.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {}
    const username =
      typeof parsed.username === "string" ? parsed.username.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    const result = checkCredentials(username, password);
    if (!result) {
      console.log(`[auth] login failed for '${username || "?"}'`);
      setTimeout(() => {
        res.writeHead(401, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({ ok: false, error: "invalid username or password" }),
        );
      }, 600);
      return;
    }
    console.log(`[auth] login ok: '${username}' -> customer '${result.customer}'`);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        ok: true,
        customer: result.customer,
        token: result.token,
      }),
    );
  });
}

// ── Public download site + artifacts (/download) ────────────────────────
const DOWNLOAD_DIR = "/home/moazemi-gc/downloads";
const DOWNLOAD_MIME = {
  ".html": "text/html; charset=utf-8",
  ".zip": "application/zip",
  ".deb": "application/vnd.debian.binary-package",
  ".appimage": "application/x-executable",
};

function serveDownload(req, res, urlPath) {
  try {
    if (urlPath === "/nova" || urlPath === "/nova/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      createReadStream(join(DOWNLOAD_DIR, "index.html")).pipe(res);
      return;
    }
    const name = decodeURIComponent(urlPath.slice("/nova/".length));
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    const file = join(DOWNLOAD_DIR, name);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const size = statSync(file).size;
    res.writeHead(200, {
      "Content-Type":
        DOWNLOAD_MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": 'attachment; filename="' + name + '"',
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500);
    res.end("download error: " + e.message);
  }
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    console.log(`[req] ${req.method} ${urlPath}`);
    if (urlPath === "/llmapi" || urlPath.startsWith("/llmapi/")) {
      proxyCompanyLlm(req, res);
      return;
    }
    if (urlPath === "/nova" || urlPath.startsWith("/nova/")) {
      serveDownload(req, res, urlPath);
      return;
    }
    if (urlPath === "/download" || urlPath.startsWith("/download/")) {
      res.writeHead(302, { Location: "/nova" });
      return res.end();
    }
    if (urlPath === "/admin" || urlPath.startsWith("/admin/")) {
      const rest = req.url.slice(req.url.indexOf("/admin") + 6);
      req.url = rest.startsWith("/") ? rest : "/" + rest;
      proxyReq(req, res, 8002);
      return;
    }
    if (req.method === "POST" && urlPath === "/api/auth/login") {
      handleLogin(req, res);
      return;
    }
    if (req.method === "OPTIONS" && urlPath === "/api/auth/login") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }
    if (isProxyPath(urlPath)) {
      if (urlPath === "/api/automation" || urlPath.startsWith("/api/automation/")) {
        proxyReq(req, res, AUTOMATION_PORT);
        return;
      }
      // MULTI-TENANT: route to the caller's own agent-server instance.
      const tenant = resolveTenant(req);
      proxyReq(req, res, (tenant && Number(tenant.port)) || BACKEND_PORT);
      return;
    }
    const rel = normalize(urlPath).replace(/^([/\\])+/, "");
    const file = join(ROOT, rel);
    if (
      rel &&
      file.startsWith(ROOT) &&
      existsSync(file) &&
      statSync(file).isFile()
    ) {
      res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
      createReadStream(file).pipe(res);
      return;
    }
    if (!extname(urlPath) && existsSync(join(ROOT, "index.html"))) {
      serveIndex(req, res);
      return;
    }
    proxyReq(req, res);
  } catch (e) {
    res.writeHead(500);
    res.end("ingress error: " + e.message);
  }
});

server.on("upgrade", (req, socket, head) => {
  const urlPath = (req.url || "/").split("?")[0];
  const isCustomerWorkspace = urlPath.startsWith("/customer-workspace");
  // MULTI-TENANT: WS upgrades resolve the tenant exactly like HTTP
  // (header > ns_t cookie > default) so each customer's realtime socket
  // reaches their own agent-server instance.
  const wsTenant = isCustomerWorkspace ? null : resolveTenant(req);
  const targetPort = isCustomerWorkspace
    ? 18766
    : (wsTenant && Number(wsTenant.port)) || BACKEND_PORT;
  const opts = {
    host: BACKEND_HOST,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${targetPort}` },
  };
  console.log(`[ws-upgrade] ${urlPath} -> :${targetPort}`);
  const upstream = http.request(opts);
  upstream.on("upgrade", (pres, psocket, phead) => {
    let resp = "HTTP/1.1 101 Switching Protocols\r\n";
    for (const [k, v] of Object.entries(pres.headers)) resp += `${k}: ${v}\r\n`;
    resp += "\r\n";
    socket.write(resp);
    socket.write(phead);
    psocket.write(head);
    psocket.pipe(socket);
    socket.pipe(psocket);
    const kill = (why) => {
      console.log(`[ws-proxy] closing ${urlPath} (${why})`);
      try { socket.destroy(); } catch {}
      try { psocket.destroy(); } catch {}
    };
    psocket.on("error", () => kill("upstream error"));
    socket.on("error", () => kill("client error"));
    psocket.on("close", () => kill("upstream close"));
    socket.on("close", () => kill("client close"));
  });
  upstream.on("error", () => { try { socket.destroy(); } catch {} });
  upstream.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[nova-ingress] UI + API(:18000) + automation(:${AUTOMATION_PORT}) + llmapi -> ${COMPANY_LLM_TARGET} on :${PORT}`);
});
