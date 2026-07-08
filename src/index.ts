#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLoyverseTools } from "./tools.js";

const server = new McpServer({
  name: "mcploy",
  version: "0.1.0",
});

registerLoyverseTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
