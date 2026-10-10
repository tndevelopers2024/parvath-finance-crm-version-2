import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronDown, Package, RefreshCw } from "lucide-react";
import { useData, query } from "./api";
import {
  InfiniteScroll,
  Loading,
  ErrorState,
  SearchInput,
  useAuth,
} from "./components";
import CatalogueActions from "./CatalogueActions";

export default function CatalogueWorkspace({
  mode,
}: {
  mode: "products" | "providers";
}) {
  const plans = useData("/catalogue"),
    providers = useData("/providers"),
    summary = useData("/products/summary");
  const user = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(
    new URLSearchParams(location.search).get("category") || "",
  );
  const [providerId, setProviderId] = useState("");
  const [sort, setSort] = useState("name");
  const [expanded, setExpanded] = useState<string | null>(null);
  const queries = [plans, providers, summary];
  if (queries.some((q) => q.isPending)) return <Loading />;
  const failed = queries.find((q) => q.error);
  if (failed)
    return (
      <ErrorState
        error={failed.error!}
        retry={() => {
          void failed.refetch();
        }}
      />
    );
  const allPlans: any[] = plans.data?.data || [];
  const providerList: any[] = providers.data?.data || [];
  const productTotals: any[] = summary.data?.products || [];
  const totals = (id: string) =>
    productTotals.find((p: any) => p.definitionId === id) || {
      records: 0,
      active: 0,
      applications: 0,
      clients: 0,
    };
  const categories = [
    ...new Set<string>(allPlans.map((p: any) => p.category)),
  ].sort();
  const matching = allPlans.filter(
    (p: any) =>
      (!category || p.category === category) &&
      (!providerId || p.providerId === providerId) &&
      `${p.name} ${p.provider.name}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const rows = (
    mode === "products"
      ? matching
      : providerList.filter(
          (p: any) =>
            (!category ||
              allPlans.some(
                (plan: any) =>
                  plan.providerId === p.id && plan.category === category,
              )) &&
            (p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              matching.some((plan: any) => plan.providerId === p.id)),
        )
  )
    .slice()
    .sort((a: any, b: any) =>
      sort === "activity"
        ? (mode === "products"
            ? totals(b.id).active - totals(a.id).active
            : allPlans.filter((p: any) => p.providerId === b.id).length -
              allPlans.filter((p: any) => p.providerId === a.id).length) ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const admin = user.role === "Administrator";
  const count = (key: string) =>
    productTotals.reduce((n: number, p: any) => n + p[key], 0);
  const refresh = () => {
    queries.forEach((q) => {
      void q.refetch();
    });
  };
  const planTable = (items: any[]) => (
    <div className="catalogue-table-scroll">
      <table className="catalogue-table">
        <thead>
          <tr>
            <th>Product plan</th>
            <th>Category</th>
            <th>Clients</th>
            <th>Active</th>
            <th>Applications</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p: any) => (
            <tr key={p.id}>
              <td>
                <Link
                  className="catalogue-plan-name"
                  to={`/products/category/${encodeURIComponent(p.category)}?definitionId=${p.id}`}
                >
                  {p.name}
                </Link>
                <small>{p.provider.name}</small>
              </td>
              <td>
                <span className="catalogue-tag">{p.category}</span>
              </td>
              <td>{totals(p.id).clients}</td>
              <td>{totals(p.id).active}</td>
              <td>{totals(p.id).applications}</td>
              <td>
                <div className="catalogue-row-actions">
                  {user.role !== "Operations" && (
                    <Link
                      className="button"
                      to={
                        "/products/new?" +
                        query({ category: p.category, definitionId: p.id })
                      }
                    >
                      Add client
                    </Link>
                  )}
                  {admin && <CatalogueActions record={p} type="catalogue" />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="catalogue-workspace">
      <div className="catalogue-metrics">
        {[
          ["Product plans", allPlans.length, "Across all categories"],
          ["Providers", providerList.length, "Companies in your catalogue"],
          [
            "Active policies / accounts",
            count("active"),
            "Current client records",
          ],
          ["Applications", count("applications"), "Awaiting activation"],
        ].map(([label, value, note]) => (
          <div className="catalogue-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <section className="catalogue-register">
        <div className="catalogue-register-title">
          <div>
            <h2>
              {mode === "products" ? "Product catalogue" : "Provider directory"}
            </h2>
            <p>
              {mode === "products"
                ? "Manage plans and open their client records."
                : "Open a provider to manage its plans and client relationships."}
            </p>
          </div>
          <button
            className="button"
            disabled={queries.some((q) => q.isFetching)}
            onClick={refresh}
          >
            <RefreshCw size={14} />
            {queries.some((q) => q.isFetching) ? "Updating…" : "Refresh"}
          </button>
        </div>
        <div className="catalogue-filters">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
            }}
            placeholder="Search plans or providers…"
          />
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {mode === "products" && (
            <select
              aria-label="Filter by provider"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
              }}
            >
              <option value="">All providers</option>
              {providerList.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Sort records"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
            }}
          >
            <option value="name">Name A–Z</option>
            <option value="activity">
              {mode === "products" ? "Most active records" : "Most plans"}
            </option>
          </select>
        </div>
        <InfiniteScroll
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
          shown={rows.length}
          total={rows.length}
          noun={mode === "products" ? "plans" : "providers"}
        >
          {!rows.length ? (
            <div className="catalogue-empty">
              <Package size={28} />
              <h3>No {mode === "products" ? "plans" : "providers"} found</h3>
              <p>Try another search or clear your filters.</p>
              <button
                className="button"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setProviderId("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : mode === "products" ? (
            planTable(rows)
          ) : (
            <div>
              {rows.map((p: any) => {
                const children = allPlans.filter(
                  (plan: any) =>
                    plan.providerId === p.id &&
                    (!category || plan.category === category),
                );
                const active = children.reduce(
                  (n: number, plan: any) => n + totals(plan.id).active,
                  0,
                );
                return (
                  <article className="catalogue-provider" key={p.id}>
                    <div className="catalogue-provider-heading">
                      <button
                        className="catalogue-provider-toggle"
                        aria-expanded={expanded === p.id}
                        onClick={() =>
                          setExpanded(expanded === p.id ? null : p.id)
                        }
                      >
                        <span className="catalogue-provider-icon">
                          <Building2 size={20} />
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {children.length}{" "}
                            {children.length === 1 ? "plan" : "plans"} ·{" "}
                            {active} active records
                          </small>
                        </span>
                        <ChevronDown
                          size={18}
                          style={{
                            transform:
                              expanded === p.id ? "rotate(180deg)" : undefined,
                          }}
                        />
                      </button>
                      <div className="catalogue-row-actions">
                        {admin && (
                          <>
                            <Link
                              className="button"
                              to={
                                "/products?" +
                                query({
                                  addProduct: 1,
                                  providerId: p.id,
                                  setup: category || undefined,
                                })
                              }
                            >
                              Add plan
                            </Link>
                            <CatalogueActions record={p} type="providers" />
                          </>
                        )}
                      </div>
                    </div>
                    {expanded === p.id &&
                      (children.length ? (
                        planTable(children)
                      ) : (
                        <p className="catalogue-provider-empty">
                          No plans yet. Add a plan to start linking client
                          records.
                        </p>
                      ))}
                  </article>
                );
              })}
            </div>
          )}
        </InfiniteScroll>
      </section>
    </div>
  );
}
