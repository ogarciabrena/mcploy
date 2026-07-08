# mcploy

Un servidor [MCP](https://modelcontextprotocol.io) que expone la API de
[Loyverse](https://loyverse.com) (`https://api.loyverse.com/v1.0`) como herramientas para
asistentes de IA — consulta y administra tiendas, productos, inventario, clientes,
recibos, cortes de caja y más, directo desde un chat con Claude, Gemini CLI, o cualquier
otro cliente compatible con MCP.

Es un wrapper delgado y genérico: un pequeño registro de recursos de Loyverse genera
automáticamente las herramientas `list`/`get`/`create`/`update`/`delete`, en vez de
código escrito a mano por endpoint. Ver [Diseño](#diseño) para el porqué.

## Requisitos

- Node.js 18+
- Una cuenta de Loyverse y un token de acceso personal

## Instalación

```bash
git clone https://github.com/ogarciabrena/mcploy.git
cd mcploy
npm install
npm run build
```

## Obtener un token de acceso de Loyverse

En el Back Office de Loyverse: **Configuración > Fichas de Acceso** ("Access Tokens" en
inglés) > crear una ficha.

## Configuración

Copia `.env.example` a `.env` y pon tu token, o expórtalo directamente:

```bash
cp .env.example .env
# edita .env y define LOYVERSE_ACCESS_TOKEN
```

`.env` está en `.gitignore` — tu token nunca se sube al repo.

## Verificar que funciona

Sin conectar ningún cliente todavía, puedes confirmar que el servidor arranca y expone
las tools correctamente con el [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
LOYVERSE_ACCESS_TOKEN=tu-token npx @modelcontextprotocol/inspector node dist/index.js
```

Esto abre una UI donde puedes ver la lista completa de tools y probarlas manualmente
(por ejemplo `loyverse_list_store`, que es de solo lectura y segura para probar primero).

## Cómo usarlo

### Claude Code

```bash
claude mcp add loyverse -e LOYVERSE_ACCESS_TOKEN=tu-token -- node /ruta/absoluta/a/mcploy/dist/index.js
```

### Claude Desktop / cualquier cliente MCP con config JSON

```json
{
  "mcpServers": {
    "loyverse": {
      "command": "node",
      "args": ["/ruta/absoluta/a/mcploy/dist/index.js"],
      "env": {
        "LOYVERSE_ACCESS_TOKEN": "tu-token"
      }
    }
  }
}
```

### opencode

Copia `opencode.jsonc.example` a `opencode.jsonc` (raíz del proyecto o config de
usuario) y pon tu token — también está en `.gitignore`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "loyverse": {
      "type": "local",
      "command": ["node", "/ruta/absoluta/a/mcploy/dist/index.js"],
      "environment": {
        "LOYVERSE_ACCESS_TOKEN": "tu-token"
      }
    }
  }
}
```

Verifica la conexión con `opencode mcp list` (debe salir `✓ loyverse connected`) y
pregunta algo con `opencode run "lista las tiendas de loyverse"`. Probado en vivo con
`google/gemini-2.5-flash` — funciona igual que con Claude, sin cambiar nada del
servidor. Un detalle: opencode antepone el nombre del servidor al de la tool, así que
`loyverse_list_store` aparece como `loyverse_loyverse_list_store` en sus logs — no es un
bug, es solo cómo opencode namespacea las tools de cada MCP server.

### Otros clientes (Gemini CLI, etc.)

El servidor solo habla el protocolo MCP estándar por stdio — no tiene código específico
de Claude ni de Anthropic en ningún lado. Cualquier cliente compatible con MCP puede
ejecutar `node dist/index.js` con `LOYVERSE_ACCESS_TOKEN` definido y usarlo igual.

## Herramientas

Para cada recurso, las herramientas que existen son exactamente las operaciones que
soporta:

| Recurso | list | get | create | update | delete |
|---|---|---|---|---|---|
| `merchant` | | ✓ (único) | | | |
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
| `inventory` | ✓ | | | ✓ (niveles de stock) | |
| `shifts` | ✓ | ✓ | | | |
| `receipts` | ✓ | ✓ | ✓ | | |
| `payment_types` | ✓ | ✓ | | | |
| `webhooks` | ✓ | | ✓ | | ✓ |

Nombres de las tools: `loyverse_<operación>_<recurso en singular>`, por ejemplo
`loyverse_list_item`, `loyverse_get_store`, `loyverse_create_customer`,
`loyverse_update_category`, `loyverse_delete_discount`.

- **Tools de `list`** reciben `query` (filtros extra, se mandan tal cual), `limit`,
  `cursor`, y `fetch_all` (sigue la paginación automáticamente, con tope de 20 páginas).
- **Tools de `get`/`update`/`delete`** reciben `id`.
- **Tools de `create`/`update`** reciben `body`, un objeto JSON libre con los campos del
  recurso. Update **no** es un parche parcial — Loyverse espera el objeto completo (ver
  [Diseño](#diseño)).

## Estructura del proyecto

```
src/
  index.ts       # arranca el servidor MCP (transporte stdio) y registra las tools
  client.ts       # cliente HTTP: auth Bearer, paginación por cursor, reintentos en 429
  resources.ts     # registro de recursos de Loyverse (fuente única de verdad)
  tools.ts         # genera las tools MCP a partir de resources.ts
```

## Diseño

La documentación oficial (developer.loyverse.com/docs) es una aplicación JS de una sola
página que no se puede scrapear de la forma usual, así que en vez de escribir a mano un
schema Zod por cada campo de cada recurso (arriesgándome a inventar nombres de campo que
queden fijos en el código), el servidor toma otro enfoque:

- `src/resources.ts` es un registro pequeño: nombre del recurso, path de la API, y qué
  operaciones soporta.
- `src/tools.ts` genera las tools de MCP a partir de ese registro — una función por
  operación, reutilizada para todos los recursos.
- Los campos de `body`/`query` se mandan tal cual a la API de Loyverse como JSON. Si un
  campo está mal, el propio mensaje de error de Loyverse regresa textual, así quien
  llama (humano o LLM) se puede autocorregir en vez de chocar con un schema fijo que
  está mal silenciosamente.

Todos los endpoints de `list` del registro fueron verificados en vivo contra una cuenta
real de Loyverse. Dos rutas que supuse resultaron mal y se corrigieron en el proceso:
`points_of_sale` no existe (el endpoint real es `pos_devices`), y `customer_groups` no
es un recurso real de la API pública (se probaron varias variantes de path, todas 404,
se eliminó). `shifts` no aparece en la documentación oficial pero es un endpoint real que
funciona. Las operaciones `create`/`update`/`delete` están menos probadas — si alguna
falla, abre un issue o un PR contra `src/resources.ts`.

## Limitaciones conocidas

- `receipts` solo soporta list/get/create — la API de Loyverse no permite actualizar ni
  borrar recibos.
- Los endpoints de update usan `POST` al path de la colección con el `id` dentro del
  body (así lo maneja Loyverse), y esperan el objeto completo, no solo el campo que
  cambia.
- Las tools `loyverse_delete_*` son destructivas e irreversibles — Loyverse no tiene
  deshacer.
- La paginación es por cursor; `fetch_all` tiene un tope de 20 páginas como salvaguarda
  contra loops descontrolados.

## Contribuir

¿Encontraste un recurso con un path incorrecto, un campo que Loyverse rechaza, o un
endpoint que falta? `src/resources.ts` es la única fuente de verdad — agrega o corrige
una entrada ahí y las tools se regeneran solas. PRs e issues son bienvenidos.

## Licencia

[MIT](LICENSE)
