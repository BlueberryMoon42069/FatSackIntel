export type ApiErrorKind =
  | "timeout"
  | "aborted"
  | "network"
  | "http"
  | "parse"
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  url?: string;

  constructor(message: string, kind: ApiErrorKind, opts?: { status?: number; url?: string }) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = opts?.status;
    this.url = opts?.url;
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

function baseUrl() {
  const raw = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  const v = (raw ?? "").trim();
  if (!v) return "";
  return v.replace(/\/$/, "");
}

function joinUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  const b = baseUrl();
  return b ? `${b}${path}` : path;
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

async function parseJsonSafe<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("Failed to parse JSON", "parse", { status: res.status });
  }
}

export async function apiFetch<T>(path: string, opts?: ApiRequestOptions): Promise<T> {
  const url = joinUrl(path);
  const method = opts?.method ?? "GET";
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  const signals: AbortSignal[] = [controller.signal];
  if (opts?.signal) signals.push(opts.signal);

  const merged = anySignal(signals);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(opts?.body ? { "Content-Type": "application/json" } : {}),
        ...(opts?.headers ?? {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
      signal: merged,
    });

    if (!res.ok) {
      const text = (await res.text().catch(() => "")) || res.statusText;
      throw new ApiError(text, "http", { status: res.status, url });
    }

    return await parseJsonSafe<T>(res);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const reason = controller.signal.reason;
      if (reason === "timeout") throw new ApiError("Request timed out", "timeout", { url });
      throw new ApiError("Request canceled", "aborted", { url });
    }

    if (e instanceof ApiError) throw e;

    const msg = typeof e?.message === "string" ? e.message : "Network error";
    throw new ApiError(msg, "network", { url });
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(signals: AbortSignal[]) {
  const controller = new AbortController();

  const onAbort = () => {
    controller.abort();
    signals.forEach((s) => s.removeEventListener("abort", onAbort));
  };

  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }

  return controller.signal;
}

export type FallbackResult<T> = {
  data: T;
  source: "api" | "mock";
  error?: ApiError;
};

export async function apiWithFallback<T>(
  path: string,
  fallback: () => T,
  opts?: ApiRequestOptions,
): Promise<FallbackResult<T>> {
  try {
    const data = await apiFetch<T>(path, opts);
    return { data, source: "api" };
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("Unknown error", "unknown");
    return { data: fallback(), source: "mock", error: err };
  }
}
