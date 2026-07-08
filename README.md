# mcploy

An [MCP](https://modelcontextprotocol.io) server that exposes the [Loyverse](https://loyverse.com)
POS API (`https://api.loyverse.com/v1.0`) as tools for AI assistants — read and manage
stores, items, inventory, customers, receipts, cash shifts, and more, straight from a
chat with Claude, Gemini CLI, or any other MCP-compatible client.

It's a thin, generic wrapper: one small registry of Loyverse resources drives
auto-generated `list`/`get`/`create`/`update`/`delete` tools, instead of hand-written
code per endpoint. See [Design](#design) for why.

## Requirements

- Node.js 18+
- A Loyverse account and a Personal Access Token

## Install

```bash
git clone https://github.com/ogarciabrena/mcploy.git
cd mcploy
npm install
npm run build
```

## Get a Loyverse access token

In the Loyverse Back Office: **Settings > Access Tokens** > create a token. Loyverse
calls it a "ficha de acceso" in Spanish.

## Configure

Copy `.env.example` to `.env` and fill in your token, or export it directly:

```bash
cp .env.example .env
# edit .env and set LOYVERSE_ACCESS_TOKEN
```

`.env` is git-ignored — your token never gets committed.

## Use it

### Claude Code

```bash
claude mcp add loyverse -e LOYVERSE_ACCESS_TOKEN=your-token -- node /absolute/path/to/mcploy/dist/index.js
```

### Claude Desktop / any JSON-config MCP client

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

### Other clients (Gemini CLI, etc.)

The server just speaks standard MCP over stdio — it has no Claude- or Anthropic-specific
code anywhere. Any MCP-compatible client can spawn `node dist/index.js` with
`LOYVERSE_ACCESS_TOKEN` set and use it the same way.

## Tools

For each resource, the tools that exist are exactly the ops it supports:

| Resource | list | get | create | update | delete |
|---|---|---|---|---|---|
| `merchant` | | ✓ (singleton) | | | |
| `stores` | ✓ | ✓ | | | |
| `categories` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `items` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `modifiers` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `discounts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `taxes` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `customers` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `employees` | ✓ | ✓ | | | |
| `pos_devices` | ✓ | ✓ | | | |
| `suppliers` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory` | ✓ | | | ✓ (stock levels) | |
| `shifts` | ✓ | ✓ | | | |
| `receipts` | ✓ | ✓ | ✓ | | |
| `payment_types` | ✓ | ✓ | | | |
| `webhooks` | ✓ | | ✓ | | ✓ |

Tool naming: `loyverse_<op>_<resource singular>`, e.g. `loyverse_list_item`,
`loyverse_get_store`, `loyverse_create_customer`, `loyverse_update_category`,
`loyverse_delete_discount`.

- **List tools** take `query` (extra filters, passed through as-is), `limit`, `cursor`,
  and `fetch_all` (auto-follows pagination, capped at 20 pages).
- **Get/update/delete tools** take `id`.
- **Create/update tools** take `body`, a free-form JSON object of the resource's fields.
  Update is *not* a partial patch — Loyverse expects the full object (see
  [Design](#design)).

## Design

The official docs (developer.loyverse.com/docs) are a JS single-page app that isn't
scrapeable in the usual way, so instead of hand-typing a Zod schema per field per
resource (and risking hallucinated field names baked into rigid code), the server takes
a different approach:

- `src/resources.ts` is a small registry: resource name, API path, and which operations
  it supports.
- `src/tools.ts` generates the MCP tools from that registry — one function per op, used
  for every resource.
- `body`/`query` fields are passed straight through to the Loyverse API as JSON. If a
  field is wrong, Loyverse's own error message comes back verbatim, so the caller (human
  or LLM) can self-correct instead of hitting a wall of silently-wrong hardcoded schema.

Every `list` endpoint in the registry has been verified live against a real Loyverse
account. Two guessed paths turned out wrong during that process and were fixed:
`points_of_sale` doesn't exist (the real endpoint is `pos_devices`), and
`customer_groups` isn't a real resource in the public API at all (removed after trying
several path variants, all 404). `shifts` isn't mentioned in the official docs but is a
real, working endpoint. `create`/`update`/`delete` are less exhaustively tested — if one
misbehaves, please open an issue or a PR against `src/resources.ts`.

## Known limitations

- `receipts` only supports list/get/create — Loyverse's API doesn't allow updating or
  deleting receipts.
- Update endpoints use `POST` to the collection path with `id` in the body (that's how
  Loyverse does it), and expect the full resource object, not a partial diff.
- `loyverse_delete_*` tools are destructive and irreversible — Loyverse has no undo.
- Pagination is cursor-based; `fetch_all` is capped at 20 pages as a safety net against
  runaway loops.

## Contributing

Found a resource with a wrong path, a field Loyverse rejects, or a missing endpoint?
`src/resources.ts` is the single source of truth — add or fix an entry there and the
tools regenerate themselves. PRs and issues welcome.

## License

[MIT](LICENSE)
