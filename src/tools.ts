import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loyverseClient, LoyverseApiError } from "./client.js";
import { RESOURCES, type ResourceConfig } from "./resources.js";

const DOCS_HINT =
  "Field names follow the Loyverse API v1.0 (developer.loyverse.com/docs). If a call " +
  "fails with a 400, the error message from Loyverse is returned verbatim — adjust the " +
  "fields and retry.";

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  const message = error instanceof LoyverseApiError ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

const jsonObject = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Arbitrary JSON object, passed through to the Loyverse API as-is.");

export function registerLoyverseTools(server: McpServer): void {
  for (const resource of RESOURCES) {
    if (resource.ops.includes("list")) registerList(server, resource);
    if (resource.ops.includes("get")) registerGet(server, resource);
    if (resource.ops.includes("create")) registerCreate(server, resource);
    if (resource.ops.includes("update")) registerUpdate(server, resource);
    if (resource.ops.includes("delete")) registerDelete(server, resource);
  }
}

function registerList(server: McpServer, resource: ResourceConfig): void {
  server.registerTool(
    `loyverse_list_${resource.name}`,
    {
      title: `List ${resource.plural}`,
      description:
        `List ${resource.plural} from Loyverse (GET ${resource.path}). Supports cursor ` +
        `pagination. ${resource.notes ?? ""} ${DOCS_HINT}`.trim(),
      inputSchema: {
        query: jsonObject.describe(
          "Extra query string filters supported by this endpoint (e.g. store_id, " +
            "updated_at_min, created_at_max).",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(250)
          .optional()
          .describe("Items per page, Loyverse default 25, max 250."),
        cursor: z.string().optional().describe("Pagination cursor from a previous response."),
        fetch_all: z
          .boolean()
          .optional()
          .describe(
            "If true, follows pagination automatically and returns every page combined " +
              "(capped at 20 pages for safety). If false/omitted, returns a single page.",
          ),
      },
    },
    async ({ query, limit, cursor, fetch_all }) => {
      try {
        const mergedQuery = { ...(query ?? {}), limit, cursor };
        if (fetch_all) {
          const { items, truncated } = await loyverseClient.listAll(
            resource.path,
            mergedQuery,
            resource.plural,
          );
          return ok({ [resource.plural]: items, truncated });
        }
        const page = await loyverseClient.get(resource.path, mergedQuery);
        return ok(page);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

function registerGet(server: McpServer, resource: ResourceConfig): void {
  const isSingleton = resource.ops.length === 1 && resource.ops[0] === "get";
  server.registerTool(
    `loyverse_get_${resource.name}`,
    {
      title: `Get ${resource.name}`,
      description: isSingleton
        ? `Get the Loyverse ${resource.name} (GET ${resource.path}). ${resource.notes ?? ""} ${DOCS_HINT}`.trim()
        : `Get a single ${resource.name} by id (GET ${resource.path}/{id}). ${DOCS_HINT}`,
      inputSchema: isSingleton
        ? {}
        : { id: z.string().describe(`The ${resource.name} id.`) },
    },
    async (args: Record<string, unknown>) => {
      try {
        const path = isSingleton
          ? resource.path
          : `${resource.path}/${(args as { id: string }).id}`;
        const data = await loyverseClient.get(path);
        return ok(data);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

function registerCreate(server: McpServer, resource: ResourceConfig): void {
  server.registerTool(
    `loyverse_create_${resource.name}`,
    {
      title: `Create ${resource.name}`,
      description:
        `Create a new ${resource.name} in Loyverse (POST ${resource.path}). ` +
        `${resource.notes ?? ""} ${DOCS_HINT}`.trim(),
      inputSchema: {
        body: z
          .record(z.string(), z.unknown())
          .describe(`The ${resource.name} fields, per the Loyverse API schema.`),
      },
    },
    async ({ body }) => {
      try {
        const data = await loyverseClient.post(resource.path, body);
        return ok(data);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

function registerUpdate(server: McpServer, resource: ResourceConfig): void {
  const isCollectionUpdate = resource.name === "inventory";

  server.registerTool(
    `loyverse_update_${resource.name}`,
    {
      title: `Update ${resource.name}`,
      description: isCollectionUpdate
        ? `Update inventory stock levels (POST ${resource.path}). ${resource.notes ?? ""} ${DOCS_HINT}`.trim()
        : `Update an existing ${resource.name} (POST ${resource.path} with "id" set — ` +
          `Loyverse uses the same create endpoint for updates when "id" is present in the ` +
          `body). This is not a partial patch: include all required fields for this ` +
          `resource, not just the ones changing, or Loyverse will reject the request. ` +
          DOCS_HINT,
      inputSchema: isCollectionUpdate
        ? {
            body: z
              .record(z.string(), z.unknown())
              .describe(
                'Body for the inventory update, e.g. { inventory_levels: [{ variant_id, ' +
                  "store_id, stock_after }] }.",
              ),
          }
        : {
            id: z.string().describe(`The ${resource.name} id.`),
            body: z
              .record(z.string(), z.unknown())
              .describe(
                `Full set of fields for the ${resource.name} (required fields included, ` +
                  "not just the ones changing).",
              ),
          },
    },
    async (args: Record<string, unknown>) => {
      try {
        if (isCollectionUpdate) {
          const { body } = args as { body: unknown };
          const data = await loyverseClient.post(resource.path, body);
          return ok(data);
        }
        const { id, body } = args as { id: string; body: Record<string, unknown> };
        const data = await loyverseClient.post(resource.path, { ...body, id });
        return ok(data);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

function registerDelete(server: McpServer, resource: ResourceConfig): void {
  server.registerTool(
    `loyverse_delete_${resource.name}`,
    {
      title: `Delete ${resource.name}`,
      description: `Delete a ${resource.name} by id (DELETE ${resource.path}/{id}). This is destructive and cannot be undone.`,
      inputSchema: { id: z.string().describe(`The ${resource.name} id.`) },
    },
    async ({ id }) => {
      try {
        await loyverseClient.delete(`${resource.path}/${id}`);
        return ok({ deleted: true, id });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
