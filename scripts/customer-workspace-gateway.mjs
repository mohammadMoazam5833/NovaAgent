#!/usr/bin/env node
/**
 * Company reverse workspace gateway CLI.
 *
 * Listens on 127.0.0.1:18766 (sidecar protocol for agent-server) and accepts
 * outbound customer WebSockets at /customer-workspace.
 *
 * Env:
 *   NOVAAGENT_CUSTOMER_WORKSPACE_HOST   (default 127.0.0.1)
 *   NOVAAGENT_CUSTOMER_WORKSPACE_PORT   (default 18766)
 *   NOVAAGENT_LOCAL_TOOLS_TOKEN or NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT,
  ENV_CUSTOMER_WORKSPACE_HOST,
  ENV_CUSTOMER_WORKSPACE_PORT,
  ENV_CUSTOMER_WORKSPACE_TOKEN,
  ENV_LOCAL_TOOLS_TOKEN,
  LOCAL_TOOLS_PROTOCOL_VERSION,
} from "./local-tools-sidecar/constants.mjs";
import { generateToken } from "./local-tools-sidecar/ws.mjs";
import { createCustomerWorkspaceGateway } from "./customer-workspace/gateway.mjs";

export { createCustomerWorkspaceGateway };
export {
  buildCustomerWorkspaceWsUrl,
  buildCustomerWorkspaceGatewayHttpUrl,
} from "./customer-workspace/urls.mjs";

function resolveToken(env = process.env) {
  return (
    String(env[ENV_CUSTOMER_WORKSPACE_TOKEN] || "").trim() ||
    String(env[ENV_LOCAL_TOOLS_TOKEN] || "").trim()
  );
}

function main() {
  const host =
    process.env[ENV_CUSTOMER_WORKSPACE_HOST]?.trim() ||
    DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST;
  const portRaw = process.env[ENV_CUSTOMER_WORKSPACE_PORT]?.trim();
  const port = portRaw
    ? Number(portRaw)
    : DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      `[customer-workspace-gateway] Invalid ${ENV_CUSTOMER_WORKSPACE_PORT}: ${portRaw}`,
    );
    process.exit(1);
  }

  let token = resolveToken();
  let generated = false;
  if (!token) {
    token = generateToken();
    generated = true;
  }

  const customersFile =
    process.env.NOVAAGENT_CUSTOMERS_FILE?.trim() ||
    join(homedir(), ".nova-customers.json");
  let customers = [];
  try {
    const parsed = JSON.parse(readFileSync(customersFile, "utf8"));
    if (Array.isArray(parsed?.customers)) {
      customers = parsed.customers.filter(
        (c) => c && typeof c.token === "string" && c.token.trim(),
      );
    }
  } catch {
    // no customers file: single-token mode via env
  }

  const gateway = createCustomerWorkspaceGateway({
    host,
    port,
    token,
    customers,
  });
  gateway.listen(() => {
    console.log(
      `[customer-workspace-gateway] protocol v${LOCAL_TOOLS_PROTOCOL_VERSION} http://${host}:${port}`,
    );
    console.log(
      `[customer-workspace-gateway] agent-server sidecar URL: http://${host}:${port}`,
    );
    console.log(
      `[customer-workspace-gateway] customer WS path: /customer-workspace`,
    );
    if (generated) {
      console.log(
        `[customer-workspace-gateway] generated token (set ${ENV_LOCAL_TOOLS_TOKEN} or ${ENV_CUSTOMER_WORKSPACE_TOKEN} to pin):\n  ${token}`,
      );
    } else {
      console.log("[customer-workspace-gateway] token: (from env)");
    }
    if (customers.length > 0) {
      console.log(
        `[customer-workspace-gateway] customers: ${customers.length} (from ${customersFile})`,
      );
    }
  });

  const shutdown = () => {
    console.log("[customer-workspace-gateway] shutting down…");
    gateway
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("customer-workspace-gateway.mjs") ||
    process.argv[1].includes("customer-workspace-gateway.mjs"));

if (isDirect) {
  main();
}
