const BASE_URL = "https://api.loyverse.com/v1.0";
const MAX_RETRIES = 4;
const MAX_AUTO_PAGES = 20;

export class LoyverseApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    path: string,
  ) {
    super(`Loyverse API error ${status} on ${path}: ${body}`);
    this.name = "LoyverseApiError";
  }
}

function getToken(): string {
  const token = process.env.LOYVERSE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "LOYVERSE_ACCESS_TOKEN is not set. Create a Personal Access Token in the Loyverse " +
        "Back Office (Settings > Access Tokens) and set it as an environment variable.",
    );
  }
  return token;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
}

async function request<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const token = getToken();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : 2 ** attempt * 500;
      await sleep(retryAfterMs);
      continue;
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();

    if (!res.ok) {
      throw new LoyverseApiError(res.status, text, path);
    }

    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  throw new Error(`Exhausted retries for ${method} ${path}`);
}

export const loyverseClient = {
  get: <T = unknown>(path: string, query?: Record<string, unknown>) =>
    request<T>("GET", path, { query }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),

  /**
   * Follows the `cursor` field across pages until it's absent, or until
   * MAX_AUTO_PAGES is reached (safety cap against runaway pagination).
   */
  async listAll(
    path: string,
    query: Record<string, unknown>,
    itemsKey: string,
  ): Promise<{ items: unknown[]; truncated: boolean }> {
    const items: unknown[] = [];
    let cursor: string | undefined = query.cursor as string | undefined;
    let pages = 0;
    let truncated = false;

    do {
      const page = await request<Record<string, unknown>>("GET", path, {
        query: { ...query, cursor },
      });
      const pageItems = page[itemsKey];
      if (Array.isArray(pageItems)) {
        items.push(...pageItems);
      }
      cursor = typeof page.cursor === "string" ? page.cursor : undefined;
      pages++;
      if (pages >= MAX_AUTO_PAGES && cursor) {
        truncated = true;
        break;
      }
    } while (cursor);

    return { items, truncated };
  },
};
