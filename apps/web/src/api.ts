import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
let csrf = "";
let csrfRequest: Promise<string> | undefined;
let sessionEnded = () => {};
// The server has no error code for a CSRF rejection, so it is matched on 403 plus this exact message.
const csrfRejected = "Security token expired. Refresh the page.";
// A 401 from these is an answer about credentials, not a session that ended.
const authPaths = [
  "/auth/me",
  "/auth/login",
  "/auth/csrf",
  "/auth/forgot-password",
  "/auth/reset-password",
];
export const onSessionEnded = (handler: () => void) => {
  sessionEnded = handler;
};
export const forgetCsrf = () => {
  csrf = "";
};
// Shared so concurrent writes without a session cookie do not each start their own session.
const loadCsrf = () =>
  (csrfRequest ||= fetch("/api/auth/csrf", { credentials: "include" })
    .then(async (r) => (csrf = (await r.json()).data.csrf as string))
    .finally(() => {
      csrfRequest = undefined;
    }));
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any,
  ) {
    super(message);
  }
}
export async function api(path: string, options: RequestInit = {}) {
  const method = options.method || "GET";
  const send = async () => {
    if (method !== "GET" && !csrf) await loadCsrf();
    const r = await fetch("/api" + path, {
      ...options,
      credentials: "include",
      headers: {
        ...(!(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    });
    const raw = await r.text();
    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      result = undefined;
    }
    return { r, result };
  };
  let { r, result } = await send();
  // The cached token belongs to a session that ended or was replaced in another tab: fetch a fresh one and retry once.
  // String and FormData bodies can be sent again as they are.
  if (
    method !== "GET" &&
    r.status === 403 &&
    result?.error?.message === csrfRejected
  ) {
    csrf = "";
    ({ r, result } = await send());
  }
  if (!result)
    throw new ApiError(
      "The server is temporarily unavailable. Please try again.",
      r.status || 503,
    );
  if (r.status === 401 && !authPaths.some((p) => path.startsWith(p))) {
    csrf = "";
    sessionEnded();
  }
  if (!r.ok)
    throw new ApiError(
      result.error?.message || "Request failed",
      r.status,
      result.error?.details,
    );
  if (result.data?.csrf) csrf = result.data.csrf;
  return result;
}
export const query = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) p.set(k, String(v));
  });
  return p.toString();
};
export const useData = (path: string, enabled = true) => {
  const q = useQuery<any, ApiError>({
    queryKey: [path],
    queryFn: () => api(path),
    enabled,
    retry: (n, e) => e.status >= 500 && n < 1,
  });
  // A failed background refetch keeps the last good data; do not report it as an error
  // so loaded pages (and unsaved forms) are not replaced by the error state.
  return q.error && q.data !== undefined
    ? { ...q, error: null, isError: false }
    : q;
};
// Lists load in pages as the user scrolls. The result keeps the `data.data` and
// `data.meta.total` shape of useData, so the rows render the same way.
export const useInfiniteData = (path: string, limit = 50, enabled = true) => {
  const q = useInfiniteQuery<any, ApiError>({
    queryKey: [path, limit],
    queryFn: ({ pageParam }) =>
      api(
        path +
          (/[?&]$/.test(path) ? "" : path.includes("?") ? "&" : "?") +
          query({ limit, page: pageParam }),
      ),
    initialPageParam: 1,
    // Another page exists while fewer rows are loaded than the server's total.
    getNextPageParam: (last: any, all: any[]) => {
      const loaded = all.reduce((n, page) => n + (page?.data?.length || 0), 0);
      const total = last?.meta?.total ?? 0;
      return last?.data?.length && loaded < total ? all.length + 1 : undefined;
    },
    enabled,
    retry: (n, e) => e.status >= 500 && n < 1,
  });
  const rows = (q.data?.pages || []).flatMap((page: any) => page?.data || []);
  const total =
    q.data?.pages?.[q.data.pages.length - 1]?.meta?.total ?? rows.length;
  // Typed loosely on purpose, like useData: pages read rows and fields from it directly.
  const data: any = q.data ? { data: rows, meta: { total } } : undefined;
  return {
    data,
    isPending: q.isPending,
    error: q.error,
    refetch: q.refetch,
    hasMore: !!q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => {
      void q.fetchNextPage();
    },
  };
};
export function useWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: any;
      method?: string;
    }) =>
      api(path, {
        method,
        body: body instanceof FormData ? body : JSON.stringify(body || {}),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
export const rupees = (minor: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(minor || 0) / 100);
export const date = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(v))
    : "—";
// The business day is always Asia/Kolkata, whatever timezone the browser is in.
export const todayIST = () =>
  new Date(Date.now() + 19800000).toISOString().slice(0, 10);
export const yearIST = (v: string) =>
  Number(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(v)),
  );
export const time = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(v));
export const initials = (v: string) =>
  v
    .split(" ")
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();

export function toMinor(amount: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error(
      "Enter a positive rupee amount with at most two decimal places",
    );
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}
