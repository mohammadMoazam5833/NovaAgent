import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HOME = "/home/moazemi-gc";
const PORT = 18002;
const CUSTOMERS_FILE = path.join(HOME, ".nova-customers.json");
const AUTH_FILE = path.join(HOME, ".local/share/opencode/auth.json");
const TENANTS_DIR = path.join(HOME, "nova-tenants");
const GATEWAY = "http://127.0.0.1:18766/health";
const VLLM = "http://127.0.0.1:8003/v1/models";
const LLM_HOST = "llm-api.isigpu.local";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
if (!ADMIN_PASSWORD || !ADMIN_SECRET) {
  console.error("[admin] ADMIN_PASSWORD / ADMIN_SECRET missing");
  process.exit(1);
}

const loginFails = new Map();
const duCache = new Map();

function sign(v) {
  return crypto.createHmac("sha256", ADMIN_SECRET).update(v).digest("hex").slice(0, 32);
}
function cookieOk(req) {
  const m = /(?:^|;\s*)na_admin=(\d+)\.([a-f0-9]{32})/.exec(req.headers.cookie || "");
  if (!m) return false;
  const exp = Number(m[1]);
  return exp > Date.now() && sign(String(exp)) === m[2];
}
function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(b);
}
async function readBody(req, cap = 65536) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > cap) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8") || "{}";
}
function sh(cmd, args, opts = {}) {
  return exec(cmd, args, { timeout: opts.timeout || 15000, ...opts }).then((r) => (r.stdout || "").trim());
}
function fetchHttp(url, opts = {}, ms = 4000) {
  return new Promise((resolve) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    fetch(url, { ...opts, signal: ctl.signal })
      .then(async (r) => {
        const text = await r.text();
        clearTimeout(t);
        resolve({ status: r.status, text });
      })
      .catch(() => {
        clearTimeout(t);
        resolve({ status: 0, text: "" });
      });
  });
}
function fetchHttpsInsecure(hostPath, headers, ms = 5000) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: LLM_HOST, path: hostPath, method: "GET", headers, rejectUnauthorized: false, timeout: ms },
      (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => resolve({ status: r.statusCode, text: b }));
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve({ status: 0, text: "" }));
    req.end();
  });
}
async function loadCustomers() {
  try {
    return JSON.parse(await readFile(CUSTOMERS_FILE, "utf8")).customers || [];
  } catch {
    return [];
  }
}
async function saveCustomers(list) {
  const bak = CUSTOMERS_FILE + ".bak-" + Date.now();
  await rename(CUSTOMERS_FILE, bak).catch(() => {});
  await writeFile(CUSTOMERS_FILE, JSON.stringify({ customers: list }, null, 2) + "\n");
}
function envPath(name) {
  return name === "default" ? path.join(HOME, ".nova-env") : path.join(TENANTS_DIR, name + ".env");
}
async function parseEnv(name) {
  try {
    const raw = await readFile(envPath(name), "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
function unitFor(name) {
  return name === "default" ? "nova-agent-server" : "nova-agent-server@" + name;
}
async function serviceState(unit) {
  const active = await sh("systemctl", ["is-active", unit]).catch(() => "unknown");
  return active;
}
async function gatewayHealth() {
  const r = await fetchHttp(GATEWAY, {}, 2000);
  try {
    return JSON.parse(r.text);
  } catch {
    return { customers: [] };
  }
}
function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + " " + u[i];
}
function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (d ? d + " روز و " : "") + h + " ساعت و " + m + " دقیقه";
}

async function apiOverview(res) {
  const customers = await loadCustomers();
  const gw = await gatewayHealth();
  const units = ["nova-ingress", "nova-gateway", "nova-automation", "nova-admin"];
  for (const c of customers) units.push(unitFor(c.name));
  const services = [];
  for (const u of units) services.push({ unit: u, active: await serviceState(u) });
  const disk = await sh("df", ["-B1", "/"]).catch(() => "");
  let diskTotal = 0;
  let diskUsed = 0;
  const dl = disk.split("\n")[1];
  if (dl) {
    const p = dl.split(/\s+/);
    diskTotal = Number(p[1]) || 0;
    diskUsed = Number(p[2]) || 0;
  }
  json(res, 200, {
    services,
    uptime: os.uptime(),
    uptimeText: fmtUptime(os.uptime()),
    mem: { total: os.totalmem(), free: os.freemem() },
    load: os.loadavg(),
    cpuCount: os.cpus().length,
    disk: { total: diskTotal, used: diskUsed },
    gateway: {
      customers: (gw.customers || []).map((c) => ({ name: c.name, connected: !!c.connected })),
    },
    hostname: os.hostname(),
    now: Date.now(),
  });
}

async function apiTenants(res) {
  const customers = await loadCustomers();
  const gw = await gatewayHealth();
  const gwMap = {};
  for (const c of gw.customers || []) gwMap[c.name] = !!c.connected;
  const out = [];
  for (const c of customers) {
    const env = await parseEnv(c.name);
    const unit = unitFor(c.name);
    const active = await serviceState(unit);
    let convCount = null;
    let agentOk = false;
    const port = Number(c.port || env.PORT || 0);
    if (port && active === "active") {
      const key = env.SESSION_API_KEY || c.token || "";
      const list = await fetchConvList(port, key, 100);
      if (list !== null) {
        agentOk = true;
        convCount = list.length;
      } else {
        const r = await fetchHttp(
          "http://127.0.0.1:" + port + "/api/health",
          { headers: { "X-Session-API-Key": key } },
          2500
        );
        agentOk = r.status === 200;
      }
    }
    let size = null;
    const serverHome = env.HOME || (c.name === "default" ? HOME : "");
    const stateDir =
      serverHome && existsSync(serverHome + "/.openhands") ? serverHome + "/.openhands" : serverHome;
    if (stateDir && existsSync(stateDir)) {
      const cached = duCache.get(c.name);
      if (cached && Date.now() - cached.ts < 600000) size = cached.size;
      else {
        try {
          const rdu = await exec("du", ["-s", "-B1", stateDir], { timeout: 60000 });
          const m = /(\d+)/.exec((rdu.stdout || "").trim());
          if (m) {
            size = Number(m[1]);
            duCache.set(c.name, { ts: Date.now(), size });
          }
        } catch (e) {
          console.error("[admin] du failed:", stateDir, e && e.message);
        }
      }
    }
    out.push({
      name: c.name,
      port,
      home: serverHome,
      roots: c.roots || [],
      unit,
      active,
      agentOk,
      clientConnected: !!gwMap[c.name],
      convCount,
      size,
      sizeText: size == null ? "-" : humanSize(size),
    });
  }
  json(res, 200, { tenants: out });
}

async function apiTenantAction(req, res, name, body) {
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return json(res, 400, { error: "bad name" });
  const action = String(body.action || "");
  if (!["start", "stop", "restart"].includes(action)) return json(res, 400, { error: "bad action" });
  const unit = unitFor(name);
  try {
    await sh("systemctl", [action, unit], { timeout: 40000 });
    json(res, 200, { ok: true, unit, action, state: await serviceState(unit) });
  } catch (e) {
    json(res, 500, { error: String(e.message).slice(0, 300) });
  }
}

async function apiTenantCreate(res, body) {
  const name = String(body.name || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) return json(res, 400, { error: "نام فقط حروف کوچک، عدد و خط تیره" });
  if (name === "default") return json(res, 400, { error: "نام default مجاز نیست" });
  const customers = await loadCustomers();
  if (customers.some((c) => c.name === name)) return json(res, 400, { error: "این نام وجود دارد" });
  const maxPort = customers.reduce((m, c) => Math.max(m, Number(c.port) || 0), 18000);
  const port = maxPort + 10;
  const home = path.join(TENANTS_DIR, name);
  const token = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  await mkdir(home, { recursive: true });
  const envContent = [
    "HOME=" + home,
    "PORT=" + port,
    "NOVAAGENT_CUSTOMER_HOME=" + home,
    "NOVAAGENT_LOCAL_TOOLS_URL=",
    "NOVAAGENT_LOCAL_TOOLS_TOKEN=",
    "SESSION_API_KEY=" + token,
    "NOVAAGENT_TENANT=" + name,
    "OH_SECRET_KEY=" + secret,
    "",
  ].join("\n");
  await writeFile(envPath(name), envContent, { mode: 0o600 });
  customers.push({ name, token, roots: [home], port });
  await saveCustomers(customers);
  try {
    await sh("systemctl", ["daemon-reload"], { timeout: 20000 });
    await sh("systemctl", ["enable", "--now", unitFor(name)], { timeout: 40000 });
  } catch (e) {
    json(res, 500, { error: "ساخت tenant انجام شد ولی سرویس بالا نیامد: " + String(e.message).slice(0, 200) });
    return;
  }
  json(res, 200, { ok: true, name, port, token, home });
}

async function apiTenantDelete(res, name) {
  if (!/^[a-z0-9_-]{1,32}$/.test(name) || name === "default")
    return json(res, 400, { error: "حذف default مجاز نیست" });
  const customers = await loadCustomers();
  const idx = customers.findIndex((c) => c.name === name);
  if (idx < 0) return json(res, 404, { error: "پیدا نشد" });
  await sh("systemctl", ["disable", "--now", unitFor(name)], { timeout: 40000 }).catch(() => {});
  customers.splice(idx, 1);
  await saveCustomers(customers);
  const ep = envPath(name);
  if (existsSync(ep)) await rename(ep, ep + ".removed-" + Date.now()).catch(() => {});
  json(res, 200, { ok: true, note: "فایل‌های فضای کاری حفظ شدند" });
}

function convRow(cv) {
  return {
    id: cv.id || cv.conversation_id || "",
    title: cv.title || "(بدون عنوان)",
    created_at: cv.created_at || null,
    updated_at: cv.last_updated_at || cv.updated_at || cv.modified_at || null,
    status: cv.execution_status || cv.status || null,
    repo: cv.selected_repository || null,
  };
}

async function fetchConvList(port, key, limit) {
  const r = await fetchHttp(
    "http://127.0.0.1:" + port + "/api/conversations/search?limit=" + limit,
    { headers: { "X-Session-API-Key": key } },
    6000
  );
  if (r.status !== 200) return null;
  try {
    const d = JSON.parse(r.text);
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d)) return d;
    return [];
  } catch {
    return null;
  }
}

async function apiConversations(res, tenant) {
  const customers = await loadCustomers();
  const c = customers.find((x) => x.name === tenant);
  if (!c) return json(res, 404, { error: "tenant پیدا نشد" });
  const env = await parseEnv(tenant);
  const port = Number(c.port || env.PORT || 0);
  const key = env.SESSION_API_KEY || c.token || "";
  const list = await fetchConvList(port, key, 50);
  let rows = [];
  if (list !== null) rows = list.map(convRow);
  else {
    const r2 = await fetchHttp(
      "http://127.0.0.1:" + port + "/api/conversations",
      { headers: { "X-Session-API-Key": key } },
      6000
    );
    if (r2.status !== 200) return json(res, 502, { error: "agent-server در دسترس نیست (" + r2.status + ")" });
    try {
      const d = JSON.parse(r2.text);
      const l2 = d.conversations || d || [];
      rows = (Array.isArray(l2) ? l2 : []).map(convRow);
    } catch {}
  }
  json(res, 200, { tenant, count: rows.length, conversations: rows });
}

async function apiLogs(res, unit, lines) {
  if (!/^[A-Za-z0-9@._-]{1,64}$/.test(unit)) return json(res, 400, { error: "bad unit" });
  const n = Math.min(Math.max(parseInt(lines, 10) || 100, 10), 500);
  try {
    const out = await sh("journalctl", ["-u", unit, "-n", String(n), "--no-pager", "-o", "short-iso"], { timeout: 15000 });
    json(res, 200, { unit, lines: out.split("\n").reverse().join("\n") });
  } catch (e) {
    json(res, 500, { error: String(e.message).slice(0, 300) });
  }
}

async function apiLlm(res) {
  const t0 = Date.now();
  const local = await fetchHttp(VLLM, {}, 4000);
  const localMs = Date.now() - t0;
  let localModels = [];
  try {
    localModels = (JSON.parse(local.text).data || []).map((m) => m.id);
  } catch {}
  let key = "";
  try {
    key = (JSON.parse(await readFile(AUTH_FILE, "utf8")).isigpu || {}).key || "";
  } catch {}
  const t1 = Date.now();
  const remote = key ? await fetchHttpsInsecure("/v1/models", { Authorization: "Bearer " + key }) : { status: 0, text: "" };
  const remoteMs = Date.now() - t1;
  let remoteModels = [];
  try {
    remoteModels = (JSON.parse(remote.text).data || []).map((m) => m.id);
  } catch {}
  json(res, 200, {
    local: { ok: local.status === 200, ms: localMs, models: localModels },
    remote: { ok: remote.status === 200, status: remote.status, ms: remoteMs, models: remoteModels },
  });
}

const PAGE = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NovaAgent | پنل مدیریت</title>
<style>
:root{--bg:#0d0d0f;--card:#161619;--card2:#1d1d21;--line:#2a2a30;--tx:#ececf1;--tx2:#9a9aa5;--acc:#d97757;--ok:#3fb950;--bad:#f85149;--warn:#d29922}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:Vazirmatn,"Segoe UI",Tahoma,sans-serif;min-height:100vh}
a{color:var(--acc)}
.login{display:flex;align-items:center;justify-content:center;min-height:100vh}
.lcard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:40px;width:360px;text-align:center}
.lcard h1{font-size:20px;margin-bottom:6px}
.lcard p{color:var(--tx2);font-size:13px;margin-bottom:22px}
input,select{background:var(--card2);border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:10px 14px;font-size:14px;width:100%;outline:none;font-family:inherit}
input:focus,select:focus{border-color:var(--acc)}
button{background:var(--acc);border:none;color:#fff;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600}
button:hover{filter:brightness(1.1)}
button.ghost{background:var(--card2);border:1px solid var(--line);color:var(--tx);font-weight:400}
button.danger{background:#3d1d1f;color:#ff8585;border:1px solid #5c2a2e;font-weight:400}
.top{display:flex;align-items:center;gap:14px;padding:16px 28px;border-bottom:1px solid var(--line);background:rgba(13,13,15,.85);position:sticky;top:0;backdrop-filter:blur(8px);z-index:5}
.brand{font-weight:800;font-size:17px}
.brand span{color:var(--acc)}
.tabs{display:flex;gap:6px;margin-inline-start:18px;flex:1}
.tab{padding:8px 16px;border-radius:10px;color:var(--tx2);cursor:pointer;font-size:14px;user-select:none}
.tab.on{background:var(--card2);color:var(--tx);font-weight:600}
.wrap{max-width:1180px;margin:0 auto;padding:24px 28px 60px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin-bottom:22px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.card h3{font-size:12px;color:var(--tx2);font-weight:400;margin-bottom:10px}
.card .big{font-size:22px;font-weight:800}
.chip{display:inline-flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:6px 13px;font-size:13px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--bad)}
.dot.ok{background:var(--ok);box-shadow:0 0 8px rgba(63,185,80,.6)}
.dot.warn{background:var(--warn)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{color:var(--tx2);font-weight:400;text-align:right;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:hover td{background:rgba(255,255,255,.02)}
.mut{color:var(--tx2);font-size:12px}
.bar{height:6px;background:var(--card2);border-radius:4px;overflow:hidden;margin-top:8px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),#e8956f)}
.rowflex{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.rowflex select{width:auto}
.actions{display:flex;gap:6px}
.actions button{padding:5px 12px;font-size:12px;border-radius:8px}
pre{background:#0a0a0c;border:1px solid var(--line);border-radius:12px;padding:16px;font-size:12px;direction:ltr;text-align:left;overflow:auto;max-height:60vh;line-height:1.7;color:#c9d1d9}
.toast{position:fixed;bottom:24px;inset-inline-start:50%;transform:translateX(50%);background:var(--card2);border:1px solid var(--line);padding:12px 22px;border-radius:12px;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:.25s;pointer-events:none;z-index:9}
.toast.on{opacity:1}
.frm{display:none;gap:10px;background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:16px;margin-bottom:16px}
.frm.on{display:flex}
.frm input{width:220px}
.badge{font-size:11px;padding:3px 9px;border-radius:6px;background:var(--card2);border:1px solid var(--line);color:var(--tx2)}
h2.sec{font-size:16px;margin:26px 0 14px}
.empty{color:var(--tx2);text-align:center;padding:34px;font-size:14px}
</style>
</head>
<body>
<div id="app"></div>
<div class="toast" id="toast"></div>
<script>
var S={tab:"dash",tenant:"",unit:"nova-ingress",lines:100,timer:null};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.classList.add("on");setTimeout(function(){t.classList.remove("on")},2600)}
function api(p,o){var opts={headers:{"Content-Type":"application/json"}};if(o){opts.method="POST";opts.body=JSON.stringify(o)}return fetch(p,opts).then(function(r){if(r.status===401){renderLogin();throw new Error("auth")}return r.json()})}
function post(p,o){return fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o||{})}).then(function(r){return r.json().then(function(j){return{j:j,s:r.status}})})}
function fmtB(b){if(!b&&b!==0)return"?";var u=["B","KB","MB","GB","TB"],i=0,n=Number(b);while(n>=1024&&i<4){n/=1024;i++}return n.toFixed(n>=100||i===0?0:1)+" "+u[i]}
function fmtT(ts){if(!ts)return"-";try{return new Date(ts).toLocaleString("fa-IR")}catch(e){return ts}}
function dot(ok,warn){return '<span class="dot'+(ok?" ok":(warn?" warn":""))+'"></span>'}

function renderLogin(msg){
  document.getElementById("app").innerHTML='<div class="login"><div class="lcard">'+
  '<h1>Nova<span style="color:var(--acc)">Agent</span></h1><p>پنل مدیریت و مانیتورینگ</p>'+
  (msg?'<p style="color:var(--bad)">'+msg+"</p>":"")+
  '<input id="pw" type="password" placeholder="رمز مدیریت" autofocus onkeydown="if(event.key===\\'Enter\\')doLogin()">'+
  '<div style="height:14px"></div><button style="width:100%" onclick="doLogin()">ورود</button></div></div>';
}
function doLogin(){
  var pw=document.getElementById("pw").value;
  post("/api/login",{password:pw}).then(function(r){
    if(r.j.ok){boot()}else{renderLogin("رمز اشتباه است")}
  }).catch(function(){renderLogin("خطا در اتصال")});
}
function logout(){fetch("/api/logout").then(function(){renderLogin()})}

function shell(){
  document.getElementById("app").innerHTML=
  '<div class="top"><div class="brand">Nova<span>Agent</span> · پنل مدیریت</div>'+
  '<div class="tabs">'+
  '<div class="tab" data-t="dash" onclick="setTab(\\'dash\\')">داشبورد</div>'+
  '<div class="tab" data-t="tenants" onclick="setTab(\\'tenants\\')">کاربران</div>'+
  '<div class="tab" data-t="convs" onclick="setTab(\\'convs\\')">گفتگوها</div>'+
  '<div class="tab" data-t="logs" onclick="setTab(\\'logs\\')">لاگ‌ها</div>'+
  "</div>"+
  '<button class="ghost" onclick="logout()">خروج</button></div><div class="wrap" id="view"></div>';
  document.querySelectorAll(".tab").forEach(function(el){el.classList.toggle("on",el.dataset.t===S.tab)});
}
function setTab(t){S.tab=t;document.querySelectorAll(".tab").forEach(function(el){el.classList.toggle("on",el.dataset.t===t)});refresh()}

function boot(){
  shell();refresh();
  if(S.timer)clearInterval(S.timer);
  S.timer=setInterval(function(){
    if(S.tab==="dash")refresh();
  },10000);
}
function refresh(){
  if(S.tab==="dash")loadDash();
  else if(S.tab==="tenants")loadTenants();
  else if(S.tab==="convs")loadConvs();
  else if(S.tab==="logs")loadLogs();
}

function loadDash(){
  api("/api/overview").then(function(d){
    var chips=d.services.map(function(s){
      return '<span class="chip">'+dot(s.active==="active")+esc(s.unit)+"</span>";
    }).join(" ");
    var memPct=Math.round((d.mem.total-d.mem.free)/d.mem.total*100);
    var diskPct=d.disk.total?Math.round(d.disk.used/d.disk.total*100):0;
    var gw=d.gateway.customers.map(function(c){
      return '<span class="chip">'+dot(c.connected)+esc(c.name)+"</span>";
    }).join(" ");
    document.getElementById("view").innerHTML=
    '<div class="grid">'+
    '<div class="card"><h3>آپ‌تایم سرور</h3><div class="big">'+esc(d.uptimeText)+"</div></div>"+
    '<div class="card"><h3>حافظه RAM</h3><div class="big">'+memPct+"%</div><div class=\\"mut\\">"+fmtB(d.mem.total-d.mem.free)+" از "+fmtB(d.mem.total)+'</div><div class="bar"><i style="width:'+memPct+'%"></i></div></div>'+
    '<div class="card"><h3>دیسک</h3><div class="big">'+diskPct+"%</div><div class=\\"mut\\">"+fmtB(d.disk.used)+" از "+fmtB(d.disk.total)+'</div><div class="bar"><i style="width:'+diskPct+'%"></i></div></div>'+
    '<div class="card"><h3>بار CPU</h3><div class="big">'+d.load[0].toFixed(2)+"</div><div class=\\"mut\\">"+d.cpuCount+" هسته · ۵ دقیقه: "+d.load[1].toFixed(2)+"</div></div>"+
    "</div>"+
    '<h2 class="sec">سرویس‌ها</h2><div style="margin-bottom:8px">'+chips+"</div>"+
    '<h2 class="sec">کلاینت‌های متصل (Gateway)</h2><div style="margin-bottom:8px">'+(gw||'<span class="mut">اطلاعاتی نیست</span>')+"</div>"+
    '<div id="llmbox"><span class="mut">در حال دریافت وضعیت هوش مصنوعی…</span></div>';
    loadLlm();
  }).catch(function(e){if(e.message!=="auth")toast("خطا در دریافت وضعیت")});
}
function loadLlm(){
  api("/api/llm").then(function(d){
    var h='<h2 class="sec">هوش مصنوعی</h2><div class="grid">'+
    '<div class="card"><h3>vLLM محلی</h3>'+(d.local.ok?'<span class="chip">'+dot(true)+"فعال · "+d.local.ms+'ms</span>':'<span class="chip">'+dot(false)+'قطع</span>')+'<div class="mut" style="margin-top:8px">'+(d.local.models.map(esc).join(" · ")||"-")+"</div></div>"+
    '<div class="card"><h3>Gateway شرکتی</h3>'+(d.remote.ok?'<span class="chip">'+dot(true)+"فعال · "+d.remote.ms+'ms</span>':'<span class="chip">'+dot(false)+"قطع"+(d.remote.status?" ("+d.remote.status+")":"")+'</span>')+'<div class="mut" style="margin-top:8px">'+(d.remote.models.slice(0,6).map(esc).join(" · ")||"-")+"</div></div></div>";
    var el=document.getElementById("llmbox");if(el)el.innerHTML=h;
  }).catch(function(){});
}

function loadTenants(){
  api("/api/tenants").then(function(d){
    var rows=d.tenants.map(function(t){
      var act=t.active==="active";
      var btns='<div class="actions">'+
      (act?'<button class="ghost" onclick="tAction(\\''+esc(t.name)+'\\',\\'restart\\')">ری‌استارت</button><button class="ghost" onclick="tAction(\\''+esc(t.name)+'\\',\\'stop\\')">توقف</button>'
          :'<button class="ghost" onclick="tAction(\\''+esc(t.name)+'\\',\\'start\\')">راه‌اندازی</button>');
      if(t.name!=="default")btns+='<button class="danger" onclick="tDel(\\''+esc(t.name)+'\\')">حذف</button>';
      btns+="</div>";
      return "<tr><td><b>"+esc(t.name)+"</b>"+(t.name==="default"?' <span class="badge">اصلی</span>':"")+"</td>"+
      "<td>"+dot(act)+ (act?"فعال":"متوقف")+"</td>"+
      "<td>"+dot(t.clientConnected)+(t.clientConnected?"متصل":"قطع")+"</td>"+
      "<td>"+(t.agentOk?dot(true)+"سالم":dot(false)+"بدون پاسخ")+"</td>"+
      "<td>"+t.port+"</td>"+
      "<td>"+(t.convCount==null?'<span class="mut">-</span>':t.convCount)+"</td>"+
      "<td>"+esc(t.sizeText)+"</td>"+
      "<td><span class='mut' style='direction:ltr'>"+esc((t.roots||[]).join(" · "))+"</span></td>"+
      "<td>"+btns+"</td></tr>";
    }).join("");
    document.getElementById("view").innerHTML=
    '<div class="rowflex"><h2 class="sec" style="margin:0">کاربران (Tenants)</h2><button onclick="document.getElementById(\\'ntfrm\\').classList.toggle(\\'on\\')">+ کاربر جدید</button></div>'+
    '<div class="frm" id="ntfrm"><input id="ntname" placeholder="مثلاً node3" onkeydown="if(event.key===\\'Enter\\')tCreate()"><button onclick="tCreate()">ایجاد</button><span class="mut">پورت و کلیدها خودکار ساخته می‌شوند</span></div>'+
    '<div class="card" style="padding:0"><table><thead><tr><th>نام</th><th>سرویس</th><th>کلاینت</th><th>Agent</th><th>پورت</th><th>گفتگوها</th><th>حجم سرور</th><th>فضای کلاینت</th><th></th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="9" class="empty">کاربری ثبت نشده</td></tr>')+"</tbody></table></div>";
  });
}
function tAction(n,a){
  if(a==="restart"&&!confirm("ری‌استارت سرویس "+n+"؟"))return;
  post("/api/tenants/"+n+"/action",{action:a}).then(function(r){
    toast(r.j.ok?"انجام شد ✓":("خطا: "+(r.j.error||r.s)));loadTenants();
  });
}
function tCreate(){
  var n=document.getElementById("ntname").value.trim();
  if(!n)return;
  post("/api/tenants",{name:n}).then(function(r){
    if(r.j.ok){toast("کاربر "+r.j.name+" ساخته شد ✓ (پورت "+r.j.port+")");document.getElementById("ntfrm").classList.remove("on")}
    else toast("خطا: "+(r.j.error||""));
    loadTenants();
  });
}
function tDel(n){
  if(!confirm("کاربر "+n+" حذف شود؟ سرویس متوقف و از رجیستری حذف می‌شود؛ فایل‌ها حفظ می‌شوند."))return;
  fetch("/api/tenants/"+n,{method:"DELETE"}).then(function(r){return r.json()}).then(function(j){
    toast(j.ok?"حذف شد ✓":("خطا: "+(j.error||"")));loadTenants();
  });
}

function loadConvs(){
  api("/api/tenants").then(function(td){
    var opts=td.tenants.map(function(t){return '<option value="'+esc(t.name)+'"'+(S.tenant===t.name?" selected":"")+">"+esc(t.name)+"</option>"}).join("");
    var sel=S.tenant||((td.tenants[0]||{}).name||"");
    if(sel&&!S.tenant)S.tenant=sel;
    document.getElementById("view").innerHTML=
    '<div class="rowflex"><h2 class="sec" style="margin:0">گفتگوها</h2><select onchange="S.tenant=this.value;loadConvs()">'+opts+"</select>"+
    '<span class="mut">۵۰ گفتگوی اخیر هر کاربر</span></div><div id="cvbox"><span class="mut">در حال دریافت…</span></div>';
    if(!S.tenant)return;
    api("/api/conversations?tenant="+encodeURIComponent(S.tenant)).then(function(d){
      var rows=d.conversations.map(function(c){
        return "<tr><td><b>"+esc(c.title)+"</b></td><td><span class='mut' style='direction:ltr'>"+esc(c.id)+"</span></td><td>"+fmtT(c.created_at)+"</td><td>"+fmtT(c.updated_at)+"</td><td>"+esc(c.repo||"-")+"</td></tr>";
      }).join("");
      document.getElementById("cvbox").innerHTML='<div class="card" style="padding:0"><table><thead><tr><th>عنوان</th><th>شناسه</th><th>ساخت</th><th>آخرین فعالیت</th><th>ریپو</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="5" class="empty">گفتگویی نیست</td></tr>')+"</tbody></table></div>";
    }).catch(function(){document.getElementById("cvbox").innerHTML='<div class="empty">agent-server در دسترس نیست</div>'});
  });
}

function loadLogs(){
  api("/api/overview").then(function(d){
    var units=d.services.map(function(s){return s.unit});
    var opts=units.map(function(u){return '<option value="'+u+'"'+(S.unit===u?" selected":"")+">"+u+"</option>"}).join("");
    document.getElementById("view").innerHTML=
    '<div class="rowflex"><h2 class="sec" style="margin:0">لاگ سرویس‌ها</h2><select onchange="S.unit=this.value;loadLogs()">'+opts+"</select>"+
    '<select onchange="S.lines=Number(this.value);loadLogs()"><option'+(S.lines===50?" selected":"")+'>50</option><option'+(S.lines===100?" selected":"")+'>100</option><option'+(S.lines===300?" selected":"")+'>300</option><option'+(S.lines===500?" selected":"")+'>500</option></select>'+
    '<button class="ghost" onclick="loadLogs()">به‌روزرسانی</button></div>'+
    '<pre id="logbox">در حال دریافت…</pre>';
    api("/api/logs?unit="+encodeURIComponent(S.unit)+"&lines="+S.lines).then(function(d){
      var el=document.getElementById("logbox");if(el)el.textContent=d.lines||"(خالی)";
    }).catch(function(){});
  });
}

renderLogin();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;

    if (p === "/" || p === "/admin") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(PAGE);
      return;
    }
    if (p === "/api/login" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "";
      const now = Date.now();
      const rec = loginFails.get(ip) || { n: 0, t: 0 };
      if (rec.n >= 10 && now - rec.t < 300000) {
        json(res, 429, { error: "تلاش زیاد؛ ۵ دقیقه صبر کنید" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      if (String(body.password || "") === ADMIN_PASSWORD) {
        loginFails.delete(ip);
        const exp = now + 43200000;
        res.setHeader(
          "Set-Cookie",
          "na_admin=" + exp + "." + sign(String(exp)) + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200"
        );
        json(res, 200, { ok: true });
      } else {
        rec.n++;
        rec.t = now;
        loginFails.set(ip, rec);
        json(res, 401, { error: "bad password" });
      }
      return;
    }
    if (p === "/api/logout") {
      res.setHeader("Set-Cookie", "na_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
      json(res, 200, { ok: true });
      return;
    }
    if (!cookieOk(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }

    if (p === "/api/overview") return void apiOverview(res);
    if (p === "/api/tenants" && req.method === "GET") return void apiTenants(res);
    if (p === "/api/tenants" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      return void apiTenantCreate(res, body);
    }
    let m;
    if ((m = /^\/api\/tenants\/([^/]+)\/action$/.exec(p)) && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      return void apiTenantAction(req, res, m[1], body);
    }
    if ((m = /^\/api\/tenants\/([^/]+)$/.exec(p)) && req.method === "DELETE") {
      return void apiTenantDelete(res, m[1]);
    }
    if (p === "/api/conversations") return void apiConversations(res, u.searchParams.get("tenant") || "default");
    if (p === "/api/logs") return void apiLogs(res, u.searchParams.get("unit") || "", u.searchParams.get("lines") || "100");
    if (p === "/api/llm") return void apiLlm(res);

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e.message).slice(0, 300) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log("[admin] listening on 127.0.0.1:" + PORT));
