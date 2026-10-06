/**
 * Minimal text-frame WebSocket upgrade (no external `ws` dependency).
 * Enough for JSON request/response envelopes.
 */

import { createHash, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { AUTH_BEARER_PREFIX, AUTH_HEADER_NAME } from "./constants.mjs";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_TEXT = 0x1;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

/**
 * @param {string} key
 */
export function computeAcceptKey(key) {
  return createHash("sha1").update(key + GUID).digest("base64");
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:stream').Duplex} socket
 * @param {Buffer} head
 * @param {(data: string) => void | Promise<void>} onMessage
 * @param {{ onClose?: () => void }} [opts]
 */
export function acceptWebSocket(req, socket, head, onMessage, opts = {}) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || !key) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const accept = computeAcceptKey(key);
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
  );

  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let closed = false;

  const sendText = (text) => {
    if (closed || socket.destroyed) return;
    socket.write(encodeFrame(OP_TEXT, Buffer.from(String(text), "utf8")));
  };

  const sendClose = (code = 1000, reason = "") => {
    if (closed || socket.destroyed) return;
    closed = true;
    const text = reason ? Buffer.from(String(reason).slice(0, 123), "utf8") : Buffer.alloc(0);
    const payload = Buffer.concat([Buffer.alloc(2), text]);
    payload.writeUInt16BE(code, 0);
    try {
      socket.write(encodeFrame(OP_CLOSE, payload));
    } catch {
      // ignore
    }
    socket.end();
    opts.onClose?.();
  };

  const sendPing = () => {
    if (closed || socket.destroyed) return false;
    try {
      socket.write(encodeFrame(OP_PING, Buffer.from("ka")));
      return true;
    } catch {
      return false;
    }
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const parsed = decodeFrame(buffer);
      if (!parsed) break;
      buffer = parsed.rest;

      if (parsed.opcode === OP_CLOSE) {
        sendClose(1000);
        return;
      }
      if (parsed.opcode === OP_PING) {
        socket.write(encodeFrame(OP_PONG, parsed.payload));
        continue;
      }
      if (parsed.opcode === OP_TEXT) {
        const text = parsed.payload.toString("utf8");
        Promise.resolve(onMessage(text, sendText)).catch((err) => {
          sendText(
            JSON.stringify({
              v: 1,
              id: "0",
              type: "error",
              ok: false,
              error: {
                code: "exec_failed",
                message: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        });
      }
    }
  });

  socket.on("close", () => {
    closed = true;
    opts.onClose?.();
  });
  socket.on("error", () => {
    closed = true;
    opts.onClose?.();
  });

  return { sendText, sendClose, sendPing };
}

/**
 * @param {number} opcode
 * @param {Buffer} payload
 * @param {{ mask?: boolean }} [opts]
 */
export function encodeFrame(opcode, payload, opts = {}) {
  const mask = Boolean(opts.mask);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  if (mask) {
    header[1] |= 0x80;
    const maskKey = randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] ^= maskKey[i % 4];
    }
    return Buffer.concat([header, maskKey, masked]);
  }
  return Buffer.concat([header, payload]);
}

/**
 * Outbound WebSocket client (RFC 6455 text frames). Clients MUST mask.
 *
 * @param {string} wsUrl  ws:// or wss:// (http/https also accepted)
 * @param {{
 *   token?: string,
 *   headers?: Record<string, string>,
 *   onMessage?: (text: string, sendText: (s: string) => void) => void | Promise<void>,
 *   onClose?: (info?: { code?: number, reason?: string }) => void,
 * }} [options]
 * @returns {Promise<{ sendText: (text: string) => void, close: () => void }>}
 */
export function connectWebSocket(wsUrl, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(wsUrl);
    } catch {
      reject(new Error(`invalid websocket URL: ${wsUrl}`));
      return;
    }

    const token = options.token;
    if (token && !parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", token);
    }

    const isTls =
      parsed.protocol === "wss:" || parsed.protocol === "https:";
    const request = isTls ? httpsRequest : httpRequest;
    const key = randomBytes(16).toString("base64");
    /** @type {Record<string, string>} */
    const headers = {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": key,
      ...(options.headers ?? {}),
    };
    if (token) {
      headers.Authorization = `${AUTH_BEARER_PREFIX}${token}`;
      headers[AUTH_HEADER_NAME] = token;
    }

    const req = request({
      protocol: isTls ? "https:" : "http:",
      hostname: parsed.hostname,
      port: parsed.port || (isTls ? "443" : "80"),
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers,
    });

    req.on("upgrade", (res, socket, head) => {
      if (res.statusCode !== 101) {
        socket.destroy();
        reject(new Error(`websocket upgrade failed: HTTP ${res.statusCode}`));
        return;
      }
      resolve(attachMaskedClient(socket, head, options));
    });
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      res.resume();
      reject(new Error(`websocket handshake HTTP ${status}`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * @param {import('node:stream').Duplex} socket
 * @param {Buffer} head
 * @param {{
 *   onMessage?: (text: string, sendText: (s: string) => void) => void | Promise<void>,
 *   onClose?: () => void,
 * }} options
 */
function attachMaskedClient(socket, head, options) {
  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let closed = false;

  const sendText = (text) => {
    if (closed || socket.destroyed) return;
    socket.write(
      encodeFrame(OP_TEXT, Buffer.from(String(text), "utf8"), { mask: true }),
    );
  };

  const sendClose = (info = {}) => {
    if (closed || socket.destroyed) return;
    closed = true;
    try {
      socket.write(encodeFrame(OP_CLOSE, Buffer.alloc(0), { mask: true }));
    } catch {
      // ignore
    }
    socket.end();
    options.onClose?.(info);
  };

  const sendPing = () => {
    if (closed || socket.destroyed) return false;
    try {
      socket.write(encodeFrame(OP_PING, Buffer.from("ka"), { mask: true }));
      return true;
    } catch {
      return false;
    }
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const parsed = decodeFrame(buffer);
      if (!parsed) break;
      buffer = parsed.rest;

      if (parsed.opcode === OP_CLOSE) {
        // RFC 6455 puts the numeric close code and UTF-8 reason in the first
        // close frame. The gateway uses 4001 for "session replaced", so this
        // detail has to reach the caller instead of looking like a disconnect.
        const payload = parsed.payload;
        const closeInfo = payload.length >= 2
          ? {
              code: payload.readUInt16BE(0),
              reason: payload.subarray(2).toString("utf8"),
            }
          : {};
        sendClose(closeInfo);
        return;
      }
      if (parsed.opcode === OP_PING) {
        socket.write(encodeFrame(OP_PONG, parsed.payload, { mask: true }));
        continue;
      }
      if (parsed.opcode === OP_TEXT && options.onMessage) {
        const text = parsed.payload.toString("utf8");
        Promise.resolve(options.onMessage(text, sendText)).catch((err) => {
          sendText(
            JSON.stringify({
              v: 1,
              id: "0",
              type: "error",
              ok: false,
              error: {
                code: "exec_failed",
                message: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        });
      }
    }
  });

  socket.on("close", () => {
    closed = true;
    options.onClose?.();
  });
  socket.on("error", () => {
    closed = true;
    options.onClose?.();
  });

  return { sendText, close: sendClose, sendPing };
}

/**
 * @param {Buffer} buf
 * @returns {{ opcode: number, payload: Buffer, rest: Buffer } | null}
 */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const second = buf[1];
  const masked = (second & 0x80) !== 0;
  let payloadLen = second & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    payloadLen = Number(big);
    offset = 10;
  }

  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + payloadLen) return null;

  let payload = buf.subarray(offset + maskLen, offset + maskLen + payloadLen);
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  const opcode = buf[0] & 0x0f;
  const rest = buf.subarray(offset + maskLen + payloadLen);
  return { opcode, payload, rest };
}

/** Generate a URL-safe session token. */
export function generateToken() {
  return randomBytes(24).toString("base64url");
}
