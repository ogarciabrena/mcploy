export type Op = "list" | "get" | "create" | "update" | "delete";

export interface ResourceConfig {
  /** Singular name used in tool names, e.g. "item" -> loyverse_get_item */
  name: string;
  /** Plural name matching the Loyverse API path and the key items are nested under
   * in list responses, e.g. "items" -> GET /items -> { items: [...], cursor }. */
  plural: string;
  path: string;
  ops: Op[];
  notes?: string;
}

/**
 * Registry of Loyverse API v1.0 resources (base URL https://api.loyverse.com/v1.0).
 * Every `list` path here has been verified live against a real Loyverse test account;
 * two guessed paths were wrong and got corrected: `points_of_sale` doesn't exist (the
 * real endpoint is `pos_devices`), and `customer_groups` doesn't exist as a standalone
 * resource in the public API at all (tried several path variants, all 404). If another
 * operation 404s or rejects a field, check developer.loyverse.com/docs and adjust the
 * entry here — the tool layer is generated entirely from this file.
 */
export const RESOURCES: ResourceConfig[] = [
  {
    name: "merchant",
    plural: "merchant",
    path: "/merchant",
    ops: ["get"],
    notes: "Singleton resource: the merchant account itself. No id required.",
  },
  { name: "store", plural: "stores", path: "/stores", ops: ["list", "get"] },
  {
    name: "category",
    plural: "categories",
    path: "/categories",
    ops: ["list", "get", "create", "update", "delete"],
  },
  {
    name: "item",
    plural: "items",
    path: "/items",
    ops: ["list", "get", "create", "update", "delete"],
    notes: "Items contain nested variants. Variant stock is managed via the inventory resource.",
  },
  {
    name: "modifier",
    plural: "modifiers",
    path: "/modifiers",
    ops: ["list", "get", "create", "update", "delete"],
  },
  {
    name: "discount",
    plural: "discounts",
    path: "/discounts",
    ops: ["list", "get", "create", "update", "delete"],
  },
  {
    name: "tax",
    plural: "taxes",
    path: "/taxes",
    ops: ["list", "get", "create", "update", "delete"],
  },
  {
    name: "customer",
    plural: "customers",
    path: "/customers",
    ops: ["list", "get", "create", "update", "delete"],
  },
  { name: "employee", plural: "employees", path: "/employees", ops: ["list", "get"] },
  {
    name: "pos_device",
    plural: "pos_devices",
    path: "/pos_devices",
    ops: ["list", "get"],
    notes: "Physical/virtual POS terminals, one per store.",
  },
  {
    name: "supplier",
    plural: "suppliers",
    path: "/suppliers",
    ops: ["list", "get", "create", "update", "delete"],
  },
  {
    name: "inventory",
    plural: "inventory",
    path: "/inventory",
    ops: ["list", "update"],
    notes:
      "List returns stock levels per variant/store. Update expects a body like " +
      '{ inventory_levels: [{ variant_id, store_id, stock_after }] }.',
  },
  {
    name: "shift",
    plural: "shifts",
    path: "/shifts",
    ops: ["list", "get"],
    notes:
      "POS cash register shifts (corte de caja): opened_at/closed_at, starting_cash, " +
      "cash_payments, expected_cash vs actual_cash, gross/net sales, cash_movements. " +
      "Not in the official docs registry but verified live (200 on both list and get).",
  },
  {
    name: "receipt",
    plural: "receipts",
    path: "/receipts",
    ops: ["list", "get", "create"],
    notes: "Receipts cannot be updated or deleted through the API, only created and read.",
  },
  {
    name: "payment_type",
    plural: "payment_types",
    path: "/payment_types",
    ops: ["list", "get"],
  },
  {
    name: "webhook",
    plural: "webhooks",
    path: "/webhooks",
    ops: ["list", "create", "delete"],
  },
];
