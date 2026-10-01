#!/usr/bin/env node
/**
 * LAN/VPN-friendly front door on :8000.
 * Windows L2TP can reach :8000 but often not :18200 / :18080.
 *
 *   /auth/* and /v1/*  → company LLM shim (:18080)
 *   /customer-workspace → NovaAgent ingress (:18200) → reverse workspace gateway
 *   everything else    → NovaAgent ingress (:18200)
 *
 * HTML responses rewrite those internal ports to :8000 so the thin Client
 * (and in-page company login) stay on the one reachable port.
 *
 * Does not bind 8001/8003 (Docker LLM).
 */
import http from "node:http";

const LISTEN_HOST = process.env.VPN_UI_PROXY_HOST || "0.0.0.0";
const LISTEN_PORT = Number(process.env.VPN_UI_PROXY_PORT || 8000);
const UI_PORT = Number(process.env.VPN_UI_PROXY_INGRESS || 18200);
const LLM_PORT = Number(process.env.VPN_UI_PROXY_LLM || 18080);
const PUBLIC_HOST = process.env.VPN_UI_PROXY_PUBLIC_HOST || "172.16.40.188";
const CUSTOMER_WORKSPACE_PREFIX = "/customer-workspace";

function targetPort(urlPath) {
  if (urlPath.startsWith(CUSTOMER_WORKSPACE_PREFIX)) {
    return UI_PORT;
  }
  if (urlPath.startsWith("/auth/") || urlPath.startsWith("/v1")) {
    return LLM_PORT;
  }
  return UI_PORT;
}

function rewriteHtml(body) {
  return body
    .replaceAll(`${PUBLIC_HOST}:18080`, `${PUBLIC_HOST}:${LISTEN_PORT}`)
    .replaceAll(`${PUBLIC_HOST}:18200`, `${PUBLIC_HOST}:${LISTEN_PORT}`);
}

function proxy(req, res) {
  const urlPath = req.url || "/";
  const port = targetPort(urlPath);
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const p = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method: req.method,
      headers,
    },
    (pres) => {
      const outHeaders = { ...pres.headers };
      const isHtml = String(outHeaders["content-type"] || "").includes(
        "text/html",
      );
      if (!isHtml) {
        res.writeHead(pres.statusCode || 502, outHeaders);
        pres.pipe(res);
        return;
      }
      const chunks = [];
      pres.on("data", (c) => chunks.push(c));
      pres.on("end", () => {
        const body = rewriteHtml(Buffer.concat(chunks).toString("utf8"));
        outHeaders["content-length"] = Buffer.byteLength(body);
        res.writeHead(pres.statusCode || 200, outHeaders);
        res.end(body);
      });
    },
  );
  p.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end(`proxy error: ${err.message}`);
  });
  req.pipe(p);
}

function proxyUpgrade(req, socket, head) {
  const urlPath = req.url || "/";
  const port = targetPort(urlPath);
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const p = http.request({
    hostname: "127.0.0.1",
    port,
    path: urlPath,
    method: req.method,
    headers,
  });
  p.on("upgrade", (pres, upstream, upgradeHead) => {
    const lines = [`HTTP/1.1 ${pres.statusCode || 101} Switching Protocols`];
    for (const [key, value] of Object.entries(pres.headers)) {
      if (value == null) continue;
      const serialized = Array.isArray(value) ? value.join(", ") : String(value);
      lines.push(`${key}: ${serialized}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upgradeHead?.length) socket.write(upgradeHead);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  p.on("error", () => {
    socket.destroy();
  });
  p.on("response", (pres) => {
    socket.write(
      `HTTP/1.1 ${pres.statusCode || 502} ${pres.statusMessage || "Error"}\r\n\r\n`,
    );
    pres.pipe(socket);
  });
  p.end();
}

const server = http.createServer(proxy);
server.on("upgrade", proxyUpgrade);
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[vpn-ui-proxy] http://${LISTEN_HOST}:${LISTEN_PORT} → UI :${UI_PORT} / LLM :${LLM_PORT} (WS /customer-workspace → UI)`,
  );
});
