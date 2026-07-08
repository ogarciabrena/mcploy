# mcploy — MCP server for Loyverse

Exposes the [Loyverse](https://loyverse.com) POS API (`https://api.loyverse.com/v1.0`) as
MCP tools, so Claude can read and manage stores, items, inventory, customers, receipts,
and more.

## Setup

1. Get a Personal Access Token from the Loyverse Back Office: **Settings > Access Tokens**.
2. Install and build:
   ```bash
   npm install
   npm run build
   ```
3. Set the token as an environment variable (see `.env.example`):
   ```bash
   export LOYVERSE_ACCESS_TOKEN=your-token
   ```

## Use with Claude Code / Claude Desktop

Add to your MCP config:

```json
{
  "mcpServers": {
    "loyverse": {
      "command": "node",
      "args": ["/absolute/path/to/mcploy/dist/index.js"],
      "env": {
        "LOYVERSE_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools

For every Loyverse resource (`merchant`, `stores`, `categories`, `items`, `modifiers`,
`discounts`, `taxes`, `customers`, `employees`, `pos_devices`, `suppliers`, `inventory`,
`receipts`, `payment_types`, `webhooks`, `shifts`) the server generates the operations
that resource supports:

- `loyverse_list_<resource>` — list, with `query`/`limit`/`cursor`/`fetch_all` params.
- `loyverse_get_<resource>` — get by id (`merchant` has no id — it's a singleton).
- `loyverse_create_<resource>` — create, takes a `body` object.
- `loyverse_update_<resource>` — update by id, or for `inventory` a stock-level `body`.
- `loyverse_delete_<resource>` — delete by id.

`body`/`query` are passed straight through to the Loyverse API as JSON — the tool
descriptions don't hardcode every field per resource. This was a deliberate choice: the
official docs at developer.loyverse.com/docs are a JS app I couldn't fully scrape to
verify every field of every resource, so instead of risking hallucinated field names in
a rigid schema, the server forwards whatever fields you give it and returns Loyverse's
own error message if something's wrong — self-correcting rather than silently wrong.
Every `list` endpoint has been verified live against a real Loyverse test account. Two
guessed resources turned out wrong and were fixed: `points_of_sale` doesn't exist (the
real path is `pos_devices`), and `customer_groups` isn't a real resource in the public
API at all (removed). `create`/`update`/`delete` operations are unverified beyond
`categories`/`items` field shapes seen in `list` responses — Loyverse will return a
descriptive error if a body is wrong.

To add or fix a resource, edit the single registry in `src/resources.ts` — the tool
layer (`src/tools.ts`) generates itself from it.

## Notes

- Pagination is cursor-based. Pass `fetch_all: true` to a list tool to auto-page (capped
  at 20 pages).
- `receipts` only supports list/get/create — Loyverse doesn't allow updating or deleting
  receipts via the API.
- `loyverse_delete_*` tools are destructive and irreversible — Loyverse has no undo.
- `shifts` (cash register open/close, i.e. "corte de caja") isn't in the official docs
  registry but is a real endpoint — verified live with 200 on both list and get.
