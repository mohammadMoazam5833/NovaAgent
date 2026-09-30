#!/usr/bin/env node
/**
 * Customer reverse-WS client CLI.
 *
 * Connects a local tools sidecar to the company gateway over outbound WS.
 *
 * Env:
 *   NOVAAGENT_REMOTE_URL / OH_REMOTE_UI_URL  (company UI origin, e.g. http://172.16.40.188:8000)
 *   NOVAAGENT_CUSTOMER_WORKSPACE_WS_URL      (override full ws URL)
 *   NOVAAGENT_LOCAL_TOOLS_URL                (local sidecar, default http://127.0.0.1:18765)
 *   NOVAAGENT_LOCAL_TOOLS_TOKEN / NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN
 */

import {
  DEFAULT_LOCAL_TOOLS_HOST,
  DEFAULT_LOCAL_TOOLS_PORT,
  ENV_CUSTOMER_WORKSPACE_TOKEN,
  ENV_LOCAL_TOOLS_HOST,
  ENV_LOCAL_TOOLS_PORT,
  ENV_LOCAL_TOOLS_TOKEN,
  ENV_LOCAL_TOOLS_URL,
} from "./local-tools-sidecar/constants.mjs";
import {
  buildCustomerWorkspaceWsUrl,
} from "./customer-workspace/urls.mjs";
import { startCustomerWorkspaceClient } from "./customer-workspace/client.mjs";

export { startCustomerWorkspaceClient, buildCustomerWorkspaceWsUrl };

const ENV_CUSTOMER_WORKSPACE_WS_URL = "NOVAAGENT_CUSTOMER_WORKSPACE_WS_URL";
const ENV_REMOTE_URL = "NOVAAGENT_REMOTE_URL";
const ENV_REMOTE_URL_ALIAS = "OH_REMOTE_UI_URL";

function resolveToken(env = process.env) {
  return (
    String(env[ENV_CUSTOMER_WORKSPACE_TOKEN] || "").trim() ||
    String(env[ENV_LOCAL_TOOLS_TOKEN] || "").trim()
  );
}

function resolveSidecarBaseUrl(env = process.env) {
  const explicit = String(env[ENV_LOCAL_TOOLS_URL] || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host = env[ENV_LOCAL_TOOLS_HOST]?.trim() || DEFAULT_LOCAL_TOOLS_HOST;
  const port = env[ENV_LOCAL_TOOLS_PORT]?.trim() || String(DEFAULT_LOCAL_TOOLS_PORT);
  return `http://${host}:${port}`;
}

function resolveGatewayWsUrl(env = process.env) {
  const explicit = String(env[ENV_CUSTOMER_WORKSPACE_WS_URL] || "").trim();
  if (explicit) return explicit;
  const remote =
    String(env[ENV_REMOTE_URL] || "").trim() ||
    String(env[ENV_REMOTE_URL_ALIAS] || "").trim();
  if (!remote) return null;
  return buildCustomerWorkspaceWsUrl(remote);
}

function main() {
  const token = resolveToken();
  if (!token) {
    console.error(
      `[customer-workspace-client] missing ${ENV_LOCAL_TOOLS_TOKEN} or ${ENV_CUSTOMER_WORKSPACE_TOKEN}`,
    );
    process.exit(1);
  }
  const gatewayWsUrl = resolveGatewayWsUrl();
  if (!gatewayWsUrl) {
    console.error(
      `[customer-workspace-client] set ${ENV_REMOTE_URL} or ${ENV_CUSTOMER_WORKSPACE_WS_URL}`,
    );
    process.exit(1);
  }
  const sidecarBaseUrl = resolveSidecarBaseUrl();

  const client = startCustomerWorkspaceClient({
    gatewayWsUrl,
    sidecarBaseUrl,
    token,
    reconnect: true,
  });

  const shutdown = () => {
    console.log("[customer-workspace-client] shutting down…");
    client.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  client.ready.catch((err) => {
    console.error("[customer-workspace-client]", err);
  });
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("customer-workspace-client.mjs") ||
    process.argv[1].includes("customer-workspace-client.mjs"));

if (isDirect) {
  main();
}
