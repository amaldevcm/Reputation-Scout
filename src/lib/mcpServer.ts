import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * A module-level reference to the running MCP server, set once at startup.
 * Lets deep library code (report generation) request LLM sampling from the
 * connected client without threading the server instance through every tool
 * function signature.
 */
let serverRef: Server | null = null;

export function setServer(server: Server): void {
  serverRef = server;
}

export function getServer(): Server | null {
  return serverRef;
}
