import type { QueryClient } from "@tanstack/react-query";
import { stages } from "../../../packages/contracts/src/index.js";
import {
  broadcastClientsQueryOptions,
  dataQueryOptions,
  infiniteDataQueryOptions,
  query,
} from "./api.js";

type Job = { key: string; run: () => Promise<void> };

// Use the very same keys/options as the page hooks: navigation joins an
// in-flight request or reads its cache instead of starting a second fetch.
function routeJobs(client: QueryClient, href: string): Job[] {
  const url = new URL(href, "https://workspace.invalid");
  const jobs: Job[] = [];
  const data = (path: string) => {
    const options = dataQueryOptions(path);
    jobs.push({
      key: JSON.stringify(options.queryKey),
      run: () => client.prefetchQuery(options),
    });
  };
  const list = (path: string, limit = 50) => {
    const options = infiniteDataQueryOptions(path, limit);
    jobs.push({
      key: JSON.stringify(options.queryKey),
      run: () => client.prefetchInfiniteQuery(options),
    });
  };
  const catalogue = () => {
    data("/catalogue");
    data("/providers");
    data("/products/summary");
  };
  const params = new URLSearchParams(url.search);
  params.delete("page");
  params.delete("limit");
  switch (url.pathname) {
    case "/dashboard":
    case "/calendar":
    case "/reports":
      data("/dashboard");
      break;
    case "/clients":
      list("/clients?" + params.toString());
      data("/clients/summary");
      break;
    case "/renewals":
    case "/followups":
      data("/dashboard");
      data("/catalogue");
      list(url.pathname + "?" + params.toString());
      break;
    case "/leads":
      data("/dashboard");
      for (const stage of stages.filter((stage) => stage !== "Qualified")) {
        list(
          "/leads?" +
            query({
              q: params.get("q"),
              priority: params.get("priority"),
              stage,
            }),
          25,
        );
      }
      break;
    case "/products":
    case "/providers":
      catalogue();
      break;
    case "/notifications":
      data("/notifications");
      break;
    case "/engagement": {
      const options = broadcastClientsQueryOptions();
      jobs.push({
        key: JSON.stringify(options.queryKey),
        run: () => client.prefetchInfiniteQuery(options),
      });
      break;
    }
    default: {
      const detail = url.pathname.match(
        /^\/(clients|leads|renewals|followups|products)\/([^/]+)(?:\/(?:edit|success))?$/,
      );
      if (detail && !["new", "import", "records"].includes(detail[2]))
        data(`/${detail[1]}/${detail[2]}`);
    }
  }
  return jobs;
}

export async function prefetchWorkspaceRoute(
  client: QueryClient,
  href: string,
) {
  await Promise.all(routeJobs(client, href).map((job) => job.run()));
}

export async function preloadWorkspace(
  client: QueryClient,
  signal: AbortSignal,
) {
  const routes = [
    "/dashboard",
    "/clients",
    "/products",
    "/renewals",
    "/followups",
    "/leads",
    "/engagement",
    "/notifications",
  ];
  const unique = new Map(
    routes
      .flatMap((route) => routeJobs(client, route))
      .map((job) => [job.key, job]),
  );
  const jobs = [...unique.values()];
  // Two background requests at a time leave room for the current page. Never
  // drain an entire paginated collection or load every client's full profile.
  const worker = async () => {
    while (!signal.aborted) {
      const job = jobs.shift();
      if (!job) return;
      await job.run();
    }
  };
  await Promise.all([worker(), worker()]);
}
