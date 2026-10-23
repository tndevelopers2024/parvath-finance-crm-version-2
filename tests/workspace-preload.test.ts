import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  dataQueryOptions,
  infiniteDataQueryOptions,
} from "../apps/web/src/api.js";
import {
  preloadWorkspace,
  prefetchWorkspaceRoute,
} from "../apps/web/src/workspace-preload.js";

let client: QueryClient;
const fetchMock = vi.fn();
const response = (id = "demo") =>
  new Response(
    JSON.stringify({
      data: [{ id }],
      meta: { total: 1003, page: 1, limit: 50 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset().mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

it("warms the main sections once and navigation reuses the exact page caches", async () => {
  await preloadWorkspace(client, new AbortController().signal);
  const requests = fetchMock.mock.calls.map(([url]) => String(url));
  expect(new Set(requests).size).toBe(requests.length);
  expect(requests).toContain("/api/clients?limit=50&page=1");
  expect(requests).toContain("/api/renewals?limit=50&page=1");
  expect(requests).toContain("/api/followups?limit=50&page=1");
  expect(requests).toContain(
    "/api/clients?sort=name&direction=asc&limit=100&page=1",
  );
  expect(requests.filter((url) => url.startsWith("/api/leads?"))).toHaveLength(
    5,
  );
  expect(requests.every((url) => !url.includes("page=2"))).toBe(true);
  expect(requests).not.toContain("/api/members");

  const count = fetchMock.mock.calls.length;
  await client.fetchQuery(dataQueryOptions("/dashboard"));
  await client.fetchQuery(dataQueryOptions("/catalogue"));
  await client.fetchInfiniteQuery(infiniteDataQueryOptions("/clients?"));
  await prefetchWorkspaceRoute(client, "/providers");
  await prefetchWorkspaceRoute(client, "/reports");
  expect(fetchMock).toHaveBeenCalledTimes(count);
});

it("joins hover prefetch and navigation while the same detail request is in flight", async () => {
  let finish!: () => void;
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => (finish = () => resolve(response()))),
  );
  const hovered = prefetchWorkspaceRoute(client, "/clients/demo-client");
  const clicked = client.fetchQuery(dataQueryOptions("/clients/demo-client"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([hovered, clicked]);
  expect(client.getQueryData(["/clients/demo-client"])).toBeDefined();
});

it("stops queued work and cancels in-flight requests when the session cache is cleared", async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () =>
          reject(new DOMException("Cancelled", "AbortError")),
        );
      }),
  );
  const warming = preloadWorkspace(client, controller.signal);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const signals = fetchMock.mock.calls.map(([, options]) => options.signal);
  controller.abort();
  client.clear();
  await warming;
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(client.getQueryCache().getAll()).toHaveLength(0);

  fetchMock.mockImplementation(async () => response("new-session"));
  await prefetchWorkspaceRoute(client, "/clients");
  expect(client.getQueryData<any>(["/clients?", 50]).pages[0].data).toEqual([
    { id: "new-session" },
  ]);
});

it("refreshes prefetched data after a write invalidates the cache", async () => {
  await prefetchWorkspaceRoute(client, "/dashboard");
  fetchMock.mockImplementation(async () => response("updated"));
  await client.invalidateQueries();
  const fresh = await client.fetchQuery(dataQueryOptions("/dashboard"));
  expect(fresh.data).toEqual([{ id: "updated" }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
