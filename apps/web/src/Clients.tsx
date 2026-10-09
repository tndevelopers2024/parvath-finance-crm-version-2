import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Filter, Upload, ArrowUpDown, Trash2 } from "lucide-react";
import { date, useData, useWrite } from "./api";
import {
  Avatar,
  Badge,
  ContactActions,
  Empty,
  ErrorState,
  Loading,
  Metrics,
  Modal,
  PageHeading,
  Pagination,
  Panel,
  ProductIcon,
  SearchInput,
  Tabs,
  FormError,
  useAuth,
  useToast,
} from "./components";
export default function Clients() {
  const [params, setParams] = useSearchParams(),
    location = useLocation(),
    user = useAuth(),
    toast = useToast();
  const [selected, setSelected] = useState<string[]>([]),
    [bulk, setBulk] = useState(false),
    [more, setMore] = useState(false),
    [clientToDelete, setClientToDelete] = useState<any>(null);
  const canDelete = user.role === "Administrator" || user.role === "Adviser";
  const write = useWrite();
  useEffect(() => {
    if (location.pathname !== "/clients") return;
    sessionStorage.setItem(
      "parvath-directory-" + user.organizationId,
      location.pathname + location.search,
    );
  }, [location.pathname, location.search, user.organizationId]);
  const p = Number(params.get("page") || 1),
    q = params.get("q") || "",
    kind = params.get("kind") || "",
    status = params.get("status") || "";
  const change = (key: string, value: string) => {
    setParams((prev) => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      if (key !== "page") prev.delete("page");
      return prev;
    });
    setSelected([]);
  };
  const results = useData("/clients?" + params.toString()),
    summary = useData("/clients/summary");
  const d = summary.data?.data || {};
  return (
    <>
      <PageHeading
        title="Clients"
        subtitle="Manage all your clients and their financial relationships"
        actions={
          user.role !== "Operations" && (
            <Link className="button" to="/clients/import">
              <Upload size={17} />
              Import Clients
            </Link>
          )
        }
      />
      <Metrics
        items={[
          {
            label: "Total Clients",
            value: d.total,
            icon: "clients",
            note: "All relationships",
            to: "/clients",
          },
          {
            label: "Individual Clients",
            value: d.individual,
            icon: "individual",
            to: "/clients?kind=Individual",
            tone: "blue",
          },
          {
            label: "Business Clients",
            value: d.business,
            icon: "business",
            to: "/clients?kind=Business",
            tone: "sky",
          },
          {
            label: "Active Policies",
            value: d.products,
            icon: "insurance",
            to: "/products",
            tone: "blue",
          },
          {
            label: "Need Attention",
            value: d.attention,
            icon: "attention",
            to: "/followups?range=Overdue",
            tone: "rose",
          },
        ]}
      />
      <Panel className="directory-panel">
        <div className="tabs-action">
          <Tabs
            items={[
              `All Clients (${d.total ?? 0})`,
              `Individuals (${d.individual ?? 0})`,
              `Businesses (${d.business ?? 0})`,
            ]}
            value={
              kind === "Individual"
                ? `Individuals (${d.individual ?? 0})`
                : kind === "Business"
                  ? `Businesses (${d.business ?? 0})`
                  : `All Clients (${d.total ?? 0})`
            }
            onChange={(s) =>
              change(
                "kind",
                s.startsWith("Individuals")
                  ? "Individual"
                  : s.startsWith("Businesses")
                    ? "Business"
                    : "",
              )
            }
          />
          <button onClick={() => setMore(!more)} aria-expanded={more}>
            <Filter size={16} />
            More Filters
          </button>
        </div>
        <div className="filters">
          <SearchInput
            value={q}
            onChange={(v) => change("q", v)}
            placeholder="Search by name, phone, email..."
          />
          <select
            aria-label="Client type"
            value={kind}
            onChange={(e) => change("kind", e.target.value)}
          >
            <option value="">All Types</option>
            <option>Individual</option>
            <option>Business</option>
          </select>
          <select
            aria-label="Product category"
            value={params.get("product") || ""}
            onChange={(e) => change("product", e.target.value)}
          >
            <option value="">All Products</option>
            {[
              "Life Insurance",
              "Health Insurance",
              "Vehicle Insurance",
              "Home Loan",
              "Investment",
              "Term Insurance",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Client status"
            value={status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">All Status</option>
            <option>Active</option>
            <option>Lead</option>
            <option>Needs Attention</option>
          </select>
          <select
            aria-label="Location"
            value={params.get("city") || ""}
            onChange={(e) => change("city", e.target.value)}
          >
            <option value="">All Locations</option>
            {[
              "Chennai",
              "Coimbatore",
              "Madurai",
              "Tiruchirappalli",
              "Salem",
              "Tirunelveli",
              "Erode",
              "Tiruppur",
              "Kanchipuram",
              "Vellore",
              "Thanjavur",
              "Karur",
              "Dindigul",
              "Nagercoil",
              "Karaikudi",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="text-link" onClick={() => setParams({})}>
            Reset
          </button>
        </div>
        {more && (
          <div className="filter-details">
            <label>
              Sort by{" "}
              <select
                value={params.get("sort") || "name"}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="name">Name</option>
                <option value="createdAt">Date added</option>
              </select>
            </label>
            <label>
              Direction{" "}
              <select
                value={params.get("direction") || "asc"}
                onChange={(e) => change("direction", e.target.value)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
        )}
        {selected.length > 0 && (
          <div className="selection-bar">
            {selected.length} selected{" "}
            <button onClick={() => setBulk(true)}>
              Update selected status
            </button>
            <button onClick={() => setSelected([])}>Clear selection</button>
          </div>
        )}
        {results.isPending ? (
          <Loading />
        ) : results.error ? (
          <ErrorState error={results.error} retry={results.refetch} />
        ) : (
          <>
            <div className="table-scroll">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all clients on this page"
                        checked={
                          !!results.data.data.length &&
                          results.data.data.every((c: any) =>
                            selected.includes(c.id),
                          )
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? results.data.data.map((c: any) => c.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>
                      <button
                        className="table-sort"
                        onClick={() =>
                          change(
                            "direction",
                            params.get("direction") === "desc" ? "asc" : "desc",
                          )
                        }
                      >
                        Name <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Products</th>
                    <th>Next Renewal</th>
                    <th>Last Contact</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.data.map((c: any) => {
                    const next = c.products
                      .flatMap((p: any) => p.events)
                      .sort((a: any, b: any) =>
                        a.dueDate.localeCompare(b.dueDate),
                      )[0];
                    return (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.name}`}
                            checked={selected.includes(c.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, c.id]
                                  : selected.filter((i) => i !== c.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <Link
                            className="person-cell"
                            to={"/clients/" + c.id}
                            state={{
                              returnTo: location.pathname + location.search,
                            }}
                          >
                            <Avatar name={c.name} photoId={c.photoId} />
                            <span>
                              <strong>{c.name}</strong>
                              <small>
                                {[c.city, c.state].filter(Boolean).join(", ")}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td className="nowrap">{c.phone}</td>
                        <td className="email-cell">{c.email || "—"}</td>
                        <td>
                          <span className="product-icons">
                            {c.products.slice(0, 3).map((p: any) => (
                              <Link
                                key={p.id}
                                to={"/products/" + p.id}
                                title={`${p.definition.name} · ${p.definition.provider?.name || p.definition.category}`}
                                aria-label={`View ${p.definition.name}`}
                              >
                                <ProductIcon category={p.definition.category} />
                              </Link>
                            ))}
                            {c.products.length > 3 && (
                              <Link
                                className="product-more-count"
                                to={"/clients/" + c.id + "?tab=products"}
                                title="View all client products"
                                aria-label={`View all ${c.products.length} products for ${c.name}`}
                              >
                                +{c.products.length - 3}
                              </Link>
                            )}
                          </span>
                        </td>
                        <td>{date(next?.dueDate)}</td>
                        <td>{date(c.lastContactAt)}</td>
                        <td>
                          <Badge>{c.status}</Badge>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <ContactActions
                              client={c}
                              compact
                              detail={"/clients/" + c.id}
                            />
                            {canDelete && (
                              <button
                                type="button"
                                className="icon-button"
                                title={`Delete ${c.name}`}
                                aria-label={`Delete ${c.name}`}
                                onClick={() => setClientToDelete(c)}
                                style={{ color: "#dc2626" }}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!results.data.data.length && <Empty />}
            <Pagination
              total={results.data.meta.total}
              page={p}
              limit={10}
              onChange={(n) => change("page", String(n))}
            />
          </>
        )}
      </Panel>
      {bulk && (
        <Modal title="Update selected clients" onClose={() => setBulk(false)}>
          <p>
            Change the status of {selected.length} selected clients. Existing
            policies and history remain linked.
          </p>
          <FormError error={write.error} />
          <div className="modal-actions">
            <button onClick={() => setBulk(false)}>Cancel</button>
            {["Active", "Needs Attention"].map((s) => (
              <button
                key={s}
                className="primary"
                disabled={write.isPending}
                onClick={async () => {
                  await write.mutateAsync({
                    path: "/clients/bulk",
                    body: { ids: selected, status: s },
                  });
                  setBulk(false);
                  setSelected([]);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {clientToDelete && (
        <Modal title="Delete Client" onClose={() => setClientToDelete(null)}>
          <p style={{ margin: "0 0 14px" }}>
            Are you sure you want to permanently delete{" "}
            <strong>{clientToDelete.name}</strong>?
          </p>
          <p
            className="muted"
            style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.5 }}
          >
            This will permanently remove this client profile, contact details,
            notes, documents, and associated activity. This action cannot be
            undone.
          </p>
          <FormError error={write.error} />
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setClientToDelete(null)}
              disabled={write.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={write.isPending}
              onClick={async () => {
                try {
                  await write.mutateAsync({
                    path: `/clients/${clientToDelete.id}`,
                    method: "DELETE",
                  });
                  toast("Client deleted successfully");
                  setClientToDelete(null);
                } catch {
                  /* FormError displays error */
                }
              }}
            >
              {write.isPending ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
