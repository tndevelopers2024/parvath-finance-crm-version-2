import CatalogueActions from "./CatalogueActions";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  Laptop,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import {
  api,
  date,
  query,
  rupees,
  useData,
  useInfiniteData,
  useWrite,
} from "./api";
import DebouncedSearch from "./DebouncedSearch";
import {
  Avatar,
  Badge,
  ClientCombobox,
  Empty,
  ErrorState,
  ExportButton,
  FormError,
  Loading,
  Metrics,
  Modal,
  PageHeading,
  Panel,
  InfiniteScroll,
  Tabs,
  ProductIcon,
  SearchInput,
  Submit,
  useAuth,
  useToast,
} from "./components";
import { useTheme } from "./theme";
export function ProductClients({
  category: selectedCategory,
}: { category?: string } = {}) {
  const { category: routeCategory } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useAuth();
  const [productsOpen, setProductsOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const category =
    selectedCategory || routeCategory || params.get("category") || "";
  const requestParams = new URLSearchParams();
  if (category) requestParams.set("category", category);
  for (const key of ["q", "definitionId", "clientId"]) {
    const value = params.get(key);
    if (value) requestParams.set(key, value);
  }
  const status = params.get("status");
  if (status && status !== "All") requestParams.set("status", status);
  const q = useInfiniteData("/products?" + requestParams.toString());
  const catalogue = useData("/catalogue");
  const productSummary = useData("/products/summary", productsOpen);
  const availableProducts = (catalogue.data?.data || []).filter(
    (item: any) =>
      item.category === category &&
      `${item.name} ${item.provider.name}`
        .toLowerCase()
        .includes(productSearch.trim().toLowerCase()),
  );
  const categories = [
    ...new Set<string>(
      (catalogue.data?.data || []).map((p: any) => p.category),
    ),
  ].sort();
  const change = (key: string, value: string, replace = false) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace },
    );
  const filtered = [
    "q",
    "definitionId",
    "status",
    ...(!routeCategory && !selectedCategory ? ["category"] : []),
  ].some((key) => params.has(key));
  return (
    <div className="products-page">
      <Link className="text-link catalogue-back" to="/products">
        ← Back to products
      </Link>
      <PageHeading
        title={category || "Client policies & accounts"}
        subtitle={
          category
            ? `Clients and their ${category.toLowerCase()} policies or accounts.`
            : "View all client policies and accounts across your products."
        }
        actions={
          <>
            {user.role !== "Operations" &&
              (!category ||
                catalogue.isPending ||
                catalogue.data?.data.some(
                  (item: any) => item.category === category,
                ) ||
                user.role === "Administrator") && (
                <Link
                  className="button primary"
                  to={
                    category &&
                    !catalogue.isPending &&
                    !catalogue.data?.data.some(
                      (item: any) => item.category === category,
                    )
                      ? "/products?" + query({ setup: category })
                      : "/products/new?" +
                        query({
                          category: category || undefined,
                          definitionId: params.get("definitionId") || undefined,
                        })
                  }
                >
                  <Plus size={16} />
                  {category &&
                  !catalogue.isPending &&
                  !catalogue.data?.data.some(
                    (item: any) => item.category === category,
                  )
                    ? "Set up product option"
                    : "Add client"}
                </Link>
              )}
            {category && (
              <button className="button" onClick={() => setProductsOpen(true)}>
                Product plans
              </button>
            )}
            {category && (
              <Link className="button" to={"/providers?" + query({ category })}>
                Providers
              </Link>
            )}
          </>
        }
      />
      <div className={"product-records-workspace"}>
        {category && productsOpen && (
          <Modal
            title="Product plans"
            className="available-products-popup"
            headerActions={
              <>
                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Search products or providers..."
                />
                {user.role === "Administrator" && (
                  <Link
                    className="button primary"
                    to={"/products?" + query({ setup: category })}
                  >
                    <Plus size={14} /> Add new product
                  </Link>
                )}
              </>
            }
            onClose={() => setProductsOpen(false)}
          >
            <div className="available-product-plans">
              {catalogue.isPending ? (
                <Loading />
              ) : catalogue.error ? (
                <ErrorState error={catalogue.error} />
              ) : (
                <>
                  <div className="available-plans-list">
                    {availableProducts.map((item: any) => {
                      const totals = productSummary.data?.products?.find(
                        (value: any) => value.definitionId === item.id,
                      );
                      const selected = params.get("definitionId") === item.id;
                      return (
                        <article
                          className={
                            "detailed-product " + (selected ? "selected" : "")
                          }
                          key={item.id}
                        >
                          <div className="detailed-product-heading">
                            <strong>{item.name}</strong>
                            {selected && <Badge>Selected</Badge>}
                          </div>
                          <span className="compact-product-provider">
                            {item.provider.name}
                          </span>
                          {productSummary.isPending ? (
                            <Loading layout="inline" />
                          ) : productSummary.error ? (
                            <p className="muted">Client counts unavailable</p>
                          ) : (
                            <div className="detailed-product-counts">
                              <span>
                                <strong>{totals?.clients || 0}</strong>Clients
                              </span>
                              <span>
                                <strong>{totals?.active || 0}</strong>Active
                              </span>
                              <span>
                                <strong>{totals?.applications || 0}</strong>
                                Applications
                              </span>
                              <span>
                                <strong>{totals?.closed || 0}</strong>Closed
                              </span>
                            </div>
                          )}
                          <div className="detailed-product-actions">
                            {user.role === "Administrator" && (
                              <CatalogueActions
                                record={item}
                                type="catalogue"
                              />
                            )}
                            <button
                              onClick={() => {
                                change("definitionId", item.id);
                                setProductsOpen(false);
                              }}
                            >
                              View clients
                            </button>
                            {user.role !== "Operations" && (
                              <Link
                                className="button primary"
                                to={
                                  "/products/new?" +
                                  query({ category, definitionId: item.id })
                                }
                              >
                                <Plus size={14} /> Add client
                              </Link>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {productSearch.trim() && !availableProducts.length && (
                    <p className="muted">No products match your search.</p>
                  )}
                  {!catalogue.data?.data.some(
                    (item: any) => item.category === category,
                  ) && <p>No plans have been added in this category yet.</p>}
                </>
              )}
            </div>
          </Modal>
        )}
        <Panel className="product-register">
          <div className="register-heading">
            <div>
              <h2>
                {category
                  ? catalogue.data?.data.find(
                      (item: any) => item.id === params.get("definitionId"),
                    )?.name || "Client policies in this category"
                  : "All client records"}
              </h2>
              <p>
                Open a client profile or view their policy and account details.
              </p>
            </div>
            {q.data && (
              <span className="register-count">
                {q.data.meta.total} {filtered ? "matching " : ""}records
              </span>
            )}
          </div>
          <Tabs
            items={["All", "Active", "Application", "Closed"]}
            value={params.get("status") || "All"}
            onChange={(value) => change("status", value)}
          />
          <div className="product-toolbar">
            <DebouncedSearch
              value={params.get("q") || ""}
              onCommit={(value) => change("q", value, true)}
              placeholder="Search product, client or identifier..."
            />
            {!routeCategory && !selectedCategory && (
              <label className="product-category">
                Category
                <select
                  value={params.get("category") || ""}
                  onChange={(e) => change("category", e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
            {filtered && (
              <button
                type="button"
                className="product-reset"
                onClick={() =>
                  setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    ["q", "definitionId", "status", "page"].forEach((key) =>
                      next.delete(key),
                    );
                    return next;
                  })
                }
              >
                Clear filters
              </button>
            )}
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.data.data.length ? (
            <InfiniteScroll
              hasMore={q.hasMore}
              loadingMore={q.loadingMore}
              onLoadMore={q.loadMore}
              shown={q.data.data.length}
              total={q.data.meta.total}
              noun="policies and accounts"
            >
              <div className="table-scroll">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Policy / account</th>
                      <th>Value</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Open record</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.data.map((p: any) => (
                      <tr key={p.id}>
                        <td data-label="Client">
                          <Link
                            className="person-cell"
                            to={"/clients/" + p.clientId}
                          >
                            <Avatar name={p.client.name} />
                            <strong>{p.client.name}</strong>
                          </Link>
                        </td>
                        <td data-label="Product">
                          <Link
                            className="product-record"
                            to={"/products/" + p.id}
                          >
                            <ProductIcon category={p.definition.category} />
                            <span>
                              <strong>{p.definition.name}</strong>
                              <small>
                                {p.definition.provider.name} · {p.identifier}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td data-label="Value">
                          {p.premiumMinor != null ? (
                            <>
                              <strong>{rupees(p.premiumMinor)}</strong>
                              <small>Annual premium</small>
                            </>
                          ) : p.principalMinor != null ? (
                            <>
                              <strong>{rupees(p.principalMinor)}</strong>
                              <small>Principal</small>
                            </>
                          ) : (
                            <span className="muted">Not recorded</span>
                          )}
                        </td>
                        <td data-label="Status">
                          <Badge>{p.status}</Badge>
                        </td>
                        <td>
                          <Link
                            className="text-link"
                            aria-label={"View " + p.identifier}
                            to={"/products/" + p.id}
                          >
                            View details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </InfiniteScroll>
          ) : (
            <div className="product-empty">
              <Empty
                action={
                  filtered ? (
                    <button
                      className="button"
                      onClick={() =>
                        setParams((previous) => {
                          const next = new URLSearchParams(previous);
                          ["q", "status", "page"].forEach((key) =>
                            next.delete(key),
                          );
                          return next;
                        })
                      }
                    >
                      Show all linked records
                    </button>
                  ) : undefined
                }
                text={
                  filtered
                    ? "No products match these filters. Try another search or clear the filters."
                    : "No clients have been added here yet. Use Add client to choose an existing client or create a new one."
                }
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
export function Engagement({ compose = false }: { compose?: boolean }) {
  const [params] = useSearchParams(),
    write = useWrite(),
    toast = useToast();
  const [channel, setChannel] = useState(params.get("channel") || "WhatsApp"),
    [clientId, setClientId] = useState(params.get("clientId") || ""),
    [body, setBody] = useState(""),
    [event, setEvent] = useState("Message prepared");
  const clientQuery = useData(`/clients/${clientId}`, !!clientId);
  const client = clientQuery.data?.data;
  const open = async () => {
    if (!client) {
      toast("Please choose a client first");
      return;
    }
    try {
      await write.mutateAsync({
        path: "/communications",
        body: { clientId, channel, event: "Conversation opened", body },
      });
      const url =
        channel === "WhatsApp"
          ? `https://wa.me/${(client.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(body)}`
          : channel === "Call"
            ? `tel:${client.phone || ""}`
            : `mailto:${client.email || ""}?body=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      toast("Conversation opened; delivery is not assumed.");
    } catch {
      /* Render error */
    }
  };
  return (
    <>
      <PageHeading
        title={compose ? "Communication Composer" : "WhatsApp"}
        subtitle="Send WhatsApp messages to many clients at once and keep a record of every conversation."
        actions={
          !compose ? (
            <Link className="button primary" to="/engagement/new">
              <Plus size={16} />
              Single message
            </Link>
          ) : undefined
        }
      />
      {compose && (
        <Panel title="Prepare a conversation" className="record-form">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!clientId) {
                toast("Please select a client first");
                return;
              }
              try {
                await write.mutateAsync({
                  path: "/communications",
                  body: { clientId, channel, event, body },
                });
                toast(event + " recorded");
              } catch {
                /* Render error */
              }
            }}
          >
            <div className="form-grid">
              <label>
                Client *
                <ClientCombobox
                  value={clientId}
                  onChange={(id) => setClientId(id)}
                  required
                />
              </label>
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option>WhatsApp</option>
                  <option>Call</option>
                  <option>Email</option>
                  <option>Meeting</option>
                </select>
              </label>
              <label className="full">
                Message / Outcome
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Prepare a message or record what happened…"
                />
              </label>
              <label>
                Record event
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                >
                  <option>Message prepared</option>
                  <option>Manual outcome</option>
                </select>
              </label>
            </div>
            <div className="tip">
              <ShieldCheck />
              <p>
                Opening WhatsApp here is recorded as “Conversation opened”, but
                delivery is not assumed. Use the broadcast panel to send one
                approved message to many clients.
              </p>
            </div>
            <FormError error={write.error} />
            <div className="modal-actions">
              <button
                type="button"
                disabled={!clientId || channel === "Meeting"}
                onClick={() => void open()}
              >
                Open {channel}
              </button>
              <Submit busy={write.isPending}>Save record</Submit>
            </div>
          </form>
          {clientId && <ConsentForm clientId={clientId} />}
        </Panel>
      )}
      {!compose && <WhatsAppBroadcast />}
    </>
  );
}
const broadcastBatch = 100;
const broadcastLimit = 1000;
type Picked = { id: string; name: string; phone?: string; kind?: string };
// Sends one approved WhatsApp template to many clients. The picker pages through every
// client, and the send goes out in batches of 100, the server's per-request limit.
function WhatsAppBroadcast() {
  const write = useWrite(),
    toast = useToast();
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [picked, setPicked] = useState<Record<string, Picked>>({}),
    [template, setTemplate] = useState(""),
    [language, setLanguage] = useState("en_US"),
    [message, setMessage] = useState(""),
    [sending, setSending] = useState(false),
    [progress, setProgress] = useState(""),
    [sendError, setSendError] = useState(""),
    [result, setResult] = useState<any>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const clients = useInfiniteQuery<any, Error>({
    queryKey: ["broadcast-clients", term],
    queryFn: ({ pageParam }) =>
      api(
        "/clients?" +
          query({
            q: term,
            sort: "name",
            direction: "asc",
            limit: 100,
            page: pageParam,
          }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last: any) =>
      last?.meta && last.meta.page * last.meta.limit < last.meta.total
        ? last.meta.page + 1
        : undefined,
  });
  const rows: Picked[] = (clients.data?.pages || []).flatMap(
    (page: any) => page?.data || [],
  );
  const chosen = Object.values(picked);
  const toggle = (row: Picked) =>
    setPicked((current) => {
      const next = { ...current };
      if (next[row.id]) delete next[row.id];
      else if (Object.keys(next).length < broadcastLimit)
        next[row.id] = {
          id: row.id,
          name: row.name,
          phone: row.phone,
          kind: row.kind,
        };
      return next;
    });
  const selectLoaded = () =>
    setPicked((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (Object.keys(next).length >= broadcastLimit) break;
        next[row.id] = {
          id: row.id,
          name: row.name,
          phone: row.phone,
          kind: row.kind,
        };
      }
      return next;
    });
  const send = async () => {
    if (!chosen.length || !template.trim() || !message.trim()) return;
    if (
      !window.confirm(
        `Send this WhatsApp message to ${chosen.length} selected client${chosen.length === 1 ? "" : "s"}? Clients without a phone number or WhatsApp consent are skipped.`,
      )
    )
      return;
    setSending(true);
    setSendError("");
    setResult(null);
    const total = {
      sent: 0,
      failed: 0,
      skipped: [] as any[],
      failures: [] as any[],
    };
    const ids = chosen.map((c) => c.id);
    const batches = Math.ceil(ids.length / broadcastBatch);
    try {
      for (let i = 0; i < ids.length; i += broadcastBatch) {
        setProgress(`Sending batch ${i / broadcastBatch + 1} of ${batches}…`);
        const response: any = await write.mutateAsync({
          path: "/whatsapp/broadcasts",
          body: {
            clientIds: ids.slice(i, i + broadcastBatch),
            template: template.trim(),
            language: language.trim() || "en_US",
            message: message.trim(),
          },
        });
        total.sent += response.data.sent;
        total.failed += response.data.failed;
        total.skipped.push(...response.data.skipped);
        total.failures.push(...response.data.failures);
      }
      setResult(total);
      setPicked({});
      setMessage("");
      toast(`Broadcast sent to ${total.sent} clients`);
    } catch (error) {
      setSendError(
        (error as Error).message ||
          "The broadcast stopped. Check the history below before retrying.",
      );
    } finally {
      setSending(false);
      setProgress("");
    }
  };
  return (
    <Panel title="Broadcast to many clients" className="record-form">
      <p className="muted">
        Choose clients, then send one approved WhatsApp template. Each client
        gets the message as its {"{{1}}"} variable.
      </p>
      <div className="form-grid">
        <label className="full">
          Search clients
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone or email"
          />
        </label>
      </div>
      <div className="broadcast-list" role="group" aria-label="Clients">
        {clients.isPending ? (
          <Loading />
        ) : clients.error ? (
          <ErrorState error={clients.error} retry={clients.refetch} />
        ) : rows.length ? (
          <>
            {rows.map((row) => (
              <label className="broadcast-row" key={row.id}>
                <input
                  type="checkbox"
                  checked={!!picked[row.id]}
                  onChange={() => toggle(row)}
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.phone || "No phone number"}
                    {row.kind ? ` · ${row.kind}` : ""}
                  </small>
                </span>
              </label>
            ))}
            {clients.hasNextPage && (
              <button
                type="button"
                className="client-combobox-load-more"
                disabled={clients.isFetchingNextPage}
                onClick={() => clients.fetchNextPage()}
              >
                {clients.isFetchingNextPage ? "Loading…" : "Load more clients"}
              </button>
            )}
          </>
        ) : (
          <Empty text="No clients match this search" />
        )}
      </div>
      <div className="modal-actions">
        <span className="muted">
          {chosen.length} selected (max {broadcastLimit})
        </span>
        <button type="button" onClick={selectLoaded} disabled={!rows.length}>
          Select all shown
        </button>
        <button
          type="button"
          onClick={() => setPicked({})}
          disabled={!chosen.length}
        >
          Clear selection
        </button>
      </div>
      <div className="form-grid">
        <label>
          Approved template name *
          <input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="e.g. policy_renewal_reminder"
          />
        </label>
        <label>
          Template language
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en_US"
          />
        </label>
        <label className="full">
          Message (fills the template’s {"{{1}}"}) *
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            placeholder="Type the message that every selected client will receive…"
          />
        </label>
      </div>
      {sendError && (
        <div role="alert" className="form-error">
          {sendError}
        </div>
      )}
      {result && (
        <div className="broadcast-result">
          <strong>
            {result.sent} sent · {result.failed} failed ·{" "}
            {result.skipped.length} skipped
          </strong>
          {result.skipped.length > 0 && (
            <ul>
              {result.skipped.slice(0, 20).map((s: any) => (
                <li key={s.clientId}>
                  {s.name}: {s.reason}
                </li>
              ))}
              {result.skipped.length > 20 && (
                <li>and {result.skipped.length - 20} more skipped</li>
              )}
            </ul>
          )}
          {result.failures.length > 0 && (
            <ul>
              {result.failures.slice(0, 20).map((f: any) => (
                <li key={f.clientId}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="modal-actions">
        {progress && <span className="muted">{progress}</span>}
        <button
          type="button"
          className="primary"
          disabled={
            sending || !chosen.length || !template.trim() || !message.trim()
          }
          onClick={() => void send()}
        >
          {sending
            ? "Sending…"
            : `Send to ${chosen.length} client${chosen.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Panel>
  );
}
function ConsentForm({ clientId }: { clientId: string }) {
  const write = useWrite(),
    toast = useToast(),
    [show, setShow] = useState(false);
  return (
    <div className="consent-section">
      <button onClick={() => setShow(!show)}>
        Record communication consent
      </button>
      {show && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await write.mutateAsync({
                path: `/clients/${clientId}/consents`,
                body: {
                  channel: f.channel,
                  source: f.source,
                  granted: f.granted === "yes",
                },
              });
              setShow(false);
              toast("Consent evidence recorded");
            } catch {
              /* Render error */
            }
          }}
        >
          <label>
            Channel
            <select name="channel">
              <option>Email</option>
              <option>WhatsApp</option>
              <option>Call</option>
            </select>
          </label>
          <label>
            Decision
            <select name="granted">
              <option value="yes">Granted</option>
              <option value="no">Withdrawn</option>
            </select>
          </label>
          <label>
            Evidence / Source
            <input
              name="source"
              minLength={5}
              required
              placeholder="How and when consent was obtained"
            />
          </label>
          <FormError error={write.error} />
          <Submit busy={write.isPending} />
        </form>
      )}
    </div>
  );
}
export function Reports() {
  const q = useData("/dashboard");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data.data;
  return (
    <>
      <PageHeading
        title="Reports"
        subtitle="One set of financial definitions, across every view."
      />
      <Metrics
        items={[
          {
            label: "Client Relationships",
            value: d.totalClients,
            icon: "clients",
            to: "/clients",
          },
          {
            label: "Open Opportunities",
            value: d.activeLeads,
            icon: "leads",
            to: "/leads",
          },
          {
            label: "Premiums Due · 30 Days",
            value: rupees(d.premiumDueMinor),
            note: rupees(d.premiumOverdueMinor) + " overdue",
            icon: "renewals",
            to: "/renewals?range=Next+30+Days",
          },
          {
            label: "Expected Commission",
            value: rupees(d.expectedRevenueMinor),
            icon: "revenue",
            to: "/products",
          },
        ]}
      />
      {d.bins?.length > 0 && (
        <Panel
          title="Renewal outlook"
          action={
            <Link className="text-link" to="/renewals?range=Next+30+Days">
              View renewals →
            </Link>
          }
          className="renewal-outlook"
        >
          <p>Pending financial events over the next 30 days.</p>
          <div className="outlook-chart">
            {d.bins.map((bin: { name: string; count: number }) => (
              <div className="outlook-row" key={bin.name}>
                <span>{bin.name}</span>
                <div className="outlook-track" aria-hidden="true">
                  <div
                    style={{
                      width: `${(bin.count / Math.max(1, ...d.bins.map((b: { count: number }) => b.count))) * 100}%`,
                    }}
                  />
                </div>
                <strong>{bin.count}</strong>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Operational Exports">
        <p>
          Exports contain authorized workspace records. Currency amounts are
          exported in exact integer paise. Formula-like cells are escaped for
          spreadsheet safety.
        </p>
        <div className="export-grid">
          {[
            {
              id: "clients",
              title: "Clients",
              description: "Client profiles, contacts & KYC status",
              icon: Users,
              color: "mint",
            },
            {
              id: "renewals",
              title: "Renewals",
              description: "Schedules, policies & premium amounts",
              icon: CalendarDays,
              color: "amber",
            },
            {
              id: "followups",
              title: "Follow-ups",
              description: "Task schedules, channels & outcomes",
              icon: CheckSquare,
              color: "blue",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div className="export-card" key={item.id}>
                <div className="export-info">
                  <span className={`export-icon ${item.color}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </div>
                </div>
                <ExportButton module={item.id} />
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Metric Definitions">
        <dl className="definitions">
          <dt>Total Clients</dt>
          <dd>
            All client relationships and prospects in the current organization,
            including businesses.
          </dd>
          <dt>Renewals Due</dt>
          <dd>
            Pending scheduled financial events in [today, today + 30 days),
            using the workspace timezone. Event types and amount meanings stay
            separate.
          </dd>
          <dt>Premiums Due</dt>
          <dd>
            Outstanding insurance renewal and premium payment amounts only,
            after recorded payments. Overdue premiums are shown separately.
            Principal, instalments, interest and maturity proceeds are excluded.
          </dd>
          <dt>Upcoming Revenue</dt>
          <dd>
            Expected commission on distinct products with pending financial
            events in the same 30-day window. This is an estimate, not
            recognized revenue.
          </dd>
          <dt>Due Today / Overdue</dt>
          <dd>
            Today uses the calendar date in Asia/Kolkata. A pending task is
            overdue once its exact due timestamp passes; today's overdue tasks
            remain in the Today filter.
          </dd>
          <dt>Calendar & Date Ranges</dt>
          <dd>
            7-day and 30-day ranges include today and overlap intentionally.
            Closed events are excluded. Custom start/end dates are inclusive.
          </dd>
        </dl>
      </Panel>
    </>
  );
}
export function Notifications({ onClose }: { onClose?: () => void } = {}) {
  const q = useData("/notifications"),
    write = useWrite(),
    navigate = useNavigate();
  return (
    <>
      {!onClose && (
        <PageHeading
          title="Notifications"
          subtitle="Your reminders and workspace updates."
        />
      )}
      <Panel className="notifications-list">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data.data.length ? (
          q.data.data.map((n: any) => (
            <button
              className={
                "record-row notification-row " + (!n.readAt ? "unread" : "")
              }
              key={n.id}
              onClick={async () => {
                try {
                  await write.mutateAsync({
                    path: `/notifications/${n.id}/read`,
                  });
                } catch {
                  /* Marking read is best effort; still open the link. */
                }
                onClose?.();
                navigate(n.link);
              }}
            >
              <Bell size={22} />
              <span className="notification-copy">
                <strong title={n.title}>{n.title}</strong>
                <small>{date(n.createdAt)}</small>
              </span>
              {!n.readAt && <Badge>New</Badge>}
            </button>
          ))
        ) : (
          <Empty text="You’re all caught up" />
        )}
      </Panel>
      <FormError error={write.error} />
    </>
  );
}
export function Settings() {
  const user = useAuth(),
    write = useWrite(),
    toast = useToast();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState("Profile");
  const [localError, setLocalError] = useState("");
  const members = useData("/members", section === "Team");
  const sections = ["Profile", "Security", "Appearance", "Team"];
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    if (
      section === "Security" &&
      fields.newPassword !== fields.confirmPassword
    ) {
      setLocalError("New passwords do not match.");
      return;
    }
    try {
      await write.mutateAsync({
        path: "/auth/account",
        method: "PATCH",
        body: {
          name: section === "Profile" ? fields.name : user.name,
          currentPassword: fields.currentPassword,
          ...(section === "Security"
            ? { newPassword: fields.newPassword }
            : {}),
        },
      });
      form
        .querySelectorAll<HTMLInputElement>('input[type="password"]')
        .forEach((input) => {
          input.value = "";
        });
      toast(section === "Profile" ? "Profile updated" : "Password updated");
    } catch {
      /* FormError displays the response. */
    }
  };
  return (
    <div className="settings-page">
      <PageHeading
        title="Settings"
        subtitle="Manage your account, preferences and workspace team."
      />
      <div className="settings-workspace">
        <aside className="settings-navigation" aria-label="Settings sections">
          <span className="settings-nav-caption">YOUR WORKSPACE</span>
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={section === item ? "page" : undefined}
              onClick={() => {
                setSection(item);
                write.reset();
                setLocalError("");
              }}
            >
              {item}
              <span>
                {item === "Profile"
                  ? "Personal details"
                  : item === "Security"
                    ? "Password and access"
                    : item === "Appearance"
                      ? "Theme preferences"
                      : "Members and roles"}
              </span>
            </button>
          ))}
          <div className="settings-identity">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
          </div>
        </aside>
        <div className="settings-content">
          {section === "Profile" && (
            <Panel title="Profile details">
              <p className="settings-description">
                Your name appears on assigned clients, follow-ups and workspace
                activity.
              </p>
              <div className="settings-profile-summary">
                <Avatar name={user.name} />
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
                <Badge>{user.role}</Badge>
              </div>
              <form key="profile" className="settings-form" onSubmit={save}>
                <label>
                  Full name
                  <input
                    name="name"
                    defaultValue={user.name}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email address
                  <input value={user.email} disabled />
                  <small>
                    Contact your administrator to change your account email.
                  </small>
                </label>
                <label>
                  Current password
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                  <small>
                    Confirm your password to save changes to your profile.
                  </small>
                </label>
                <FormError error={write.error} />
                <div className="settings-form-footer">
                  <Submit busy={write.isPending}>Save profile</Submit>
                </div>
              </form>
            </Panel>
          )}
          {section === "Security" && (
            <Panel title="Change password">
              <p className="settings-description">
                Choose a password with at least 12 characters. Updating it signs
                out your other sessions.
              </p>
              <form key="security" className="settings-form" onSubmit={save}>
                <label>
                  Current password
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  New password
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                {localError && <p role="alert">{localError}</p>}
                <FormError error={write.error} />
                <div className="settings-form-footer">
                  <Submit busy={write.isPending}>Update password</Submit>
                </div>
              </form>
            </Panel>
          )}
          {section === "Appearance" && (
            <Panel title="Appearance">
              <p className="settings-description">
                Choose how your workspace looks. This preference is saved on
                this browser.
              </p>
              <div className="settings-theme-options">
                {(["light", "dark", "system"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={theme === value}
                    className={`settings-theme-option ${theme === value ? "selected" : ""}`}
                    onClick={() => setTheme(value)}
                  >
                    <span className={`settings-theme-preview ${value}`}>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="settings-theme-label">
                      {value === "light" ? (
                        <Sun size={16} />
                      ) : value === "dark" ? (
                        <Moon size={16} />
                      ) : (
                        <Laptop size={16} />
                      )}
                      {value === "system"
                        ? "System"
                        : value === "dark"
                          ? "Dark"
                          : "Light"}
                      {theme === value && <CheckSquare size={16} />}
                    </span>
                  </button>
                ))}
              </div>
              <p className="settings-description">
                System follows your device’s light or dark appearance.
              </p>
            </Panel>
          )}
          {section === "Team" && (
            <>
              {members.isPending ? (
                <Loading />
              ) : members.error ? (
                <ErrorState error={members.error} retry={members.refetch} />
              ) : (
                <>
                  <p className="settings-description">
                    Manage who has access to your workspace and their role.
                  </p>
                  <Panel
                    title="Team"
                    action={
                      user.role === "Administrator" ? (
                        <MemberManager />
                      ) : undefined
                    }
                  >
                    {members.data?.data.map((m: any) => (
                      <div className="record-row" key={m.user.id}>
                        <Avatar name={m.user.name} />
                        <span>
                          <strong>{m.user.name}</strong>
                          <small>
                            {m.role}
                            {m.user.active === false && " · Deactivated"}
                          </small>
                        </span>
                        {user.role === "Administrator" &&
                          m.user.id !== user.userId && (
                            <>
                              <select
                                aria-label={"Role for " + m.user.name}
                                className="role-select"
                                value={m.role}
                                onChange={async (e) => {
                                  try {
                                    await write.mutateAsync({
                                      path: "/members/" + m.id,
                                      method: "PATCH",
                                      body: { role: e.target.value },
                                    });
                                    toast("Role updated");
                                  } catch {
                                    /* Render error */
                                  }
                                }}
                              >
                                {memberRoles.map((r) => (
                                  <option key={r}>{r}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="small"
                                disabled={write.isPending}
                                onClick={async () => {
                                  const active = m.user.active === false;
                                  if (
                                    !active &&
                                    !window.confirm(
                                      `Deactivate ${m.user.name}? They will be signed out and unable to sign in.`,
                                    )
                                  )
                                    return;
                                  try {
                                    await write.mutateAsync({
                                      path: "/members/" + m.id,
                                      method: "PATCH",
                                      body: { active },
                                    });
                                    toast(
                                      active
                                        ? "Member reactivated"
                                        : "Member deactivated",
                                    );
                                  } catch {
                                    /* Render error */
                                  }
                                }}
                              >
                                {m.user.active === false
                                  ? "Reactivate"
                                  : "Deactivate"}
                              </button>
                            </>
                          )}
                      </div>
                    ))}
                  </Panel>
                  <FormError error={write.error} />
                </>
              )}
            </>
          )}
          <div className="settings-context">
            <span>Workspace timezone</span>
            <strong>{user.timezone}</strong>
            <small>Used for schedules, reminders and activity dates.</small>
          </div>
        </div>
      </div>
    </div>
  );
}

const memberRoles = ["Administrator", "Adviser", "Operations"];
function MemberManager() {
  const [show, setShow] = useState(false),
    write = useWrite(),
    toast = useToast();
  return (
    <>
      <button className="small" onClick={() => setShow(true)}>
        Add Member
      </button>
      {show && (
        <Modal title="Create Workspace Member" onClose={() => setShow(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: "/members",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                });
                setShow(false);
                toast("Member created. Share the initial password securely.");
              } catch {
                /* Render error */
              }
            }}
          >
            <label>
              Full Name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Email Address
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="Administrator">
                {/* For now, new members can only be added as Administrators. */}
                <option>Administrator</option>
              </select>
            </label>
            <label>
              Unique Initial Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <p className="muted">
              Use a unique password and share it through a secure channel. The
              member can change it in account settings.
            </p>
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Create Member</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
