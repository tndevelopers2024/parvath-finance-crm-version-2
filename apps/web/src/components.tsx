import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Users,
  UserRound,
  Building2,
  Target,
  CheckSquare,
  ChartNoAxesColumnIncreasing,
  Clock,
  Flame,
  X,
  Car,
  House,
  HeartPulse,
  FileText,
  Lightbulb,
  Upload,
  Send,
  UserPlus,
  CalendarPlus,
  type LucideIcon,
} from "lucide-react";
import { date, initials, query, useData, useWrite } from "./api";
import Skeleton, { type SkeletonLayout } from "./Skeleton";

export const icons: Record<string, LucideIcon> = {
  clients: Users,
  individual: UserRound,
  business: Building2,
  renewals: CalendarDays,
  leads: Target,
  followups: CheckSquare,
  revenue: ChartNoAxesColumnIncreasing,
  attention: Clock,
  hot: Flame,
  won: Check,
  lost: X,
  insurance: ShieldCheck,
};
export const AuthContext = createContext<any>(null);
export const useAuth = () => useContext(AuthContext);
export const ToastContext = createContext<(s: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function Icon({
  name,
  size = 20,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const C = icons[name] || FileText;
  return <C size={size} {...props} />;
}

export function Avatar({
  name,
  size = "normal",
  photoId,
  photoUrl,
}: {
  name?: string;
  size?: string;
  photoId?: string;
  photoUrl?: string;
  animate?: "hover" | "always";
  followCursor?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const cleanName = (name || "").trim() || "User";
  const nameHash = cleanName
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const imageSrc =
    photoUrl || (photoId ? `/api/documents/${photoId}/download` : undefined);

  return (
    <span className={`avatar ${size} hue-${nameHash % 4}`} title={cleanName}>
      {imageSrc && !failed ? (
        <img src={imageSrc} alt={cleanName} onError={() => setFailed(true)} />
      ) : (
        <span className="avatar-initials" aria-hidden="true">
          {initials(cleanName)}
        </span>
      )}
    </span>
  );
}
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const text = String(children);
  const type =
    tone ||
    (text.match(/Overdue|Due Today|Lost|Urgent|Rejected/)
      ? "rose"
      : text.match(/Active|Won|Completed|Renewed|Connected/)
        ? "mint"
        : text.match(/Attention|Upcoming|High|Pending|Quarantined/)
          ? "amber"
          : text.match(/Lead|Qualified|Meeting/)
            ? "lavender"
            : "blue");
  return <span className={`badge ${type}`}>{children}</span>;
}
export function ProductIcon({
  category,
  size = 18,
}: {
  category: string;
  size?: number;
}) {
  const C = category.includes("Health")
    ? HeartPulse
    : category.includes("Vehicle")
      ? Car
      : category.includes("Loan")
        ? House
        : category.includes("Investment") || category.includes("Bond")
          ? ChartNoAxesColumnIncreasing
          : ShieldCheck;
  return (
    <span
      className={`product-icon ${category.includes("Health") ? "rose" : category.includes("Loan") ? "amber" : category.includes("Investment") ? "lavender" : "blue"}`}
    >
      <C size={size} />
    </span>
  );
}
export function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageHeading({
  title,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}
export function Metrics({
  items,
  showIcons = true,
}: {
  showIcons?: boolean;
  items: {
    label: string;
    value: any;
    icon: string;
    tone?: string;
    note?: string;
    to?: string;
    tooltip?: string;
  }[];
}) {
  return (
    <div
      className="metrics"
      style={{ gridTemplateColumns: `repeat(${items.length},minmax(0,1fr))` }}
    >
      {items.map((m, i) => (
        <Link
          to={m.to || "#"}
          className={`metric summary-card ${m.tone || ["mint", "rose", "lavender", "blue", "amber"][i % 5]}`}
          key={m.label}
          title={m.tooltip || m.note}
        >
          {showIcons && <span className="summary-category-icon" aria-hidden="true"><Icon name={m.icon} size={18} /></span>}
          <div className="metric-body">
            <div className="metric-label">{m.label}</div>
            <strong>
              {typeof m.value === "number"
                ? new Intl.NumberFormat("en-IN").format(m.value)
                : (m.value ?? "—")}
            </strong>
            {m.note && <small>{m.note}</small>}
          </div>
        </Link>
      ))}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          role="tab"
          aria-selected={value === t}
          className={value === t ? "selected" : ""}
          onClick={() => onChange(t)}
          key={t}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Pagination({
  total,
  page,
  limit,
  onChange,
}: {
  total: number;
  page: number;
  limit: number;
  onChange: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const visiblePages = Array.from(
    { length: Math.min(pages, 5) },
    (_, index) => start + index,
  );
  return (
    <div className="pagination">
      <span>
        Showing {total ? (page - 1) * limit + 1 : 0} -{" "}
        {Math.min(page * limit, total)} of {total} records
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {start > 1 && (
          <>
            <button aria-label="Page 1" onClick={() => onChange(1)}>1</button>
            {start > 2 && <span aria-hidden="true">…</span>}
          </>
        )}
        {visiblePages.map(
          (n) => (
            <button
              key={n}
              className={page === n ? "primary" : ""}
              aria-label={`Page ${n}`}
              aria-current={page === n ? "page" : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ),
        )}
        {visiblePages[visiblePages.length - 1] < pages && (
          <>
            {visiblePages[visiblePages.length - 1] < pages - 1 && (
              <span aria-hidden="true">…</span>
            )}
            <button aria-label={`Page ${pages}`} onClick={() => onChange(pages)}>
              {pages}
            </button>
          </>
        )}
        <button
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function ContactActions({
  client,
  detail,
}: {
  client: any;
  detail?: string;
  compact?: boolean;
}) {
  const write = useWrite(),
    toast = useToast();
  const open = async (channel: string) => {
    try {
      await write.mutateAsync({
        path: "/communications",
        body: { clientId: client.id, channel, event: "Conversation opened" },
      });
      if (channel === "WhatsApp")
        window.open(
          `https://wa.me/${client.phone.replace(/\D/g, "")}`,
          "_blank",
          "noopener,noreferrer",
        );
      else window.location.href = `tel:${client.phone}`;
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <span className="contact-actions">
      <button
        title="Open WhatsApp conversation"
        aria-label={`WhatsApp ${client.name}`}
        onClick={(e) => {
          e.stopPropagation();
          void open("WhatsApp");
        }}
      >
        <img
          src="/assets/whatsapp.svg"
          width={18}
          height={18}
          alt=""
          aria-hidden="true"
        />
      </button>
      <button
        aria-label={`Call ${client.name}`}
        title="Open phone dialler"
        onClick={(e) => {
          e.stopPropagation();
          void open("Call");
        }}
      >
        <Phone size={16} />
      </button>
      {detail && (
        <Link
          aria-label={`Open ${client.name} details`}
          to={detail}
          onClick={(e) => e.stopPropagation()}
        >
          <Ellipsis size={18} />
        </Link>
      )}
    </span>
  );
}
export function Calendar({
  selected,
  onSelect,
  title,
  markers = [],
}: {
  selected: string;
  onSelect: (s: string) => void;
  title?: string;
  markers?: { date: string; tone: string }[];
}) {
  const [month, setMonth] = useState(
    () => new Date(selected.slice(0, 7) + "-01T12:00:00"),
  );
  const y = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(y, m, 1).getDay(),
    days = new Date(y, m + 1, 0).getDate();
  const move = (n: number) => setMonth(new Date(y, m + n, 1, 12));
  return (
    <div className="calendar">
      {title && <h2>{title}</h2>}
      <div className="calendar-header">
        <button aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeft size={16} />
        </button>
        <strong>
          {month.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </strong>
        <button aria-label="Next month" onClick={() => move(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={"b" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const tones = [...new Set(markers.filter((marker) => marker.date === d).map((marker) => marker.tone))];
          return (
            <button
              key={d}
              className={d === selected ? "active" : ""}
              aria-label={
                date(d) +
                (tones.length
                  ? " · " + tones.map((tone) => ({ rose: "overdue", amber: "scheduled", mint: "completed", lavender: "birthday" })[tone] || "activity").join(", ")
                  : "")
              }
              aria-pressed={d === selected}
              onClick={() => onSelect(d)}
            >
              {i + 1}
              {tones.length > 0 && <span className="date-markers" aria-hidden="true">{tones.map((tone) => <i key={tone} className={"date-marker " + tone} />)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const quickItems: [string, LucideIcon, string, string][] = [
  ["Add Client", UserPlus, "/clients/new", "mint"],
  ["Add Lead", Target, "/leads/new", "lavender"],
  ["Send WhatsApp", MessageCircle, "/engagement/new", "mint"],
  ["Create Reminder", CalendarPlus, "/followups/new", "rose"],
  ["Upload Document", Upload, "/clients?upload=1", "blue"],
  ["View Renewals", CalendarDays, "/renewals", "amber"],
  ["Prepare Message", Send, "/engagement/new", "lavender"],
  ["View Reports", ChartNoAxesColumnIncreasing, "/reports", "mint"],
];
export function QuickActions({
  profile,
  followup = false,
}: {
  profile?: string;
  followup?: boolean;
}) {
  const items = profile
    ? ([
        [
          "WhatsApp",
          MessageCircle,
          `/engagement/new?clientId=${profile}`,
          "mint",
        ],
        [
          "Call",
          Phone,
          `/engagement/new?clientId=${profile}&channel=Call`,
          "blue",
        ],
        [
          "Email",
          Mail,
          `/engagement/new?clientId=${profile}&channel=Email`,
          "blue",
        ],
        [
          "Add Follow-up",
          CalendarPlus,
          `/followups/new?clientId=${profile}`,
          "rose",
        ],
      ] as typeof quickItems)
    : followup
      ? ([
          quickItems[2],
          ["Make a Call", Phone, "/engagement/new?channel=Call", "blue"],
          ["Schedule Follow-up", CalendarPlus, "/followups/new", "mint"],
          ["Add Note", FileText, "/clients", "mint"],
        ] as typeof quickItems)
      : quickItems;
  return (
    <div className={`quick-grid ${followup ? "two" : ""}`}>
      {items.map(([name, C, to, tone]) => (
        <Link key={name} to={to}>
          <span className={`quick-icon ${tone}`}>
            <C size={25} />
          </span>
          <span>{name}</span>
        </Link>
      ))}
    </div>
  );
}
export function Botanical({
  text = "Helping You Build a Secure Tomorrow",
}: {
  text?: string;
}) {
  return (
    <div className="botanical">
      <img src="/assets/botanical.png" alt="" />
      <p>
        {text}
        <i />
      </p>
    </div>
  );
}
export function Loading({ layout = "rows" }: { layout?: SkeletonLayout }) {
  return <Skeleton layout={layout} />;
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>Unable to load this view</h2>
      <p>{error.message}</p>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function Empty({
  text = "No records found",
  action,
}: {
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FileText size={26} />
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
  headerActions,
}: {
  title: string;
  children: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      aria-label={title}
      className={`modal ${className}`}
    >
      <div className="panel-heading">
        <h2>{title}</h2>
        {headerActions && (
          <div className="modal-header-actions">{headerActions}</div>
        )}
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Tip({
  title = "Tip",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="tip">
      <Lightbulb size={26} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function ExportButton({ module }: { module: string }) {
  return (
    <a className="button" href={`/api/reports/export?module=${module}`}>
      <Download size={16} />
      Export
    </a>
  );
}
export function Back({
  to = "/clients",
  children = "Back to Clients",
}: {
  to?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="back-link" to={to}>
      <ChevronLeft size={16} />
      {children}
    </Link>
  );
}
export function FormError({ error }: { error: any }) {
  return error ? (
    <div role="alert" className="form-error">
      {error.message || String(error)}
    </div>
  ) : null;
}
export function Submit({
  busy,
  children = "Save changes",
}: {
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="primary" type="submit" disabled={busy}>
      {busy ? "Saving…" : children}
      <ArrowRight size={16} />
    </button>
  );
}
export interface ClientItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  kind?: string;
  city?: string;
  [key: string]: any;
}

export function ClientCombobox({
  value,
  onChange,
  name,
  required = false,
  disabled = false,
  placeholder = "Search client by name, phone, or email...",
  excludeId,
  initialClient,
  className = "",
  autoFocus = false,
}: {
  value?: string;
  onChange: (clientId: string, client?: ClientItem | null) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  excludeId?: string;
  initialClient?: ClientItem | null;
  className?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const clientsQuery = useData(
    "/clients?" + query({ q: debouncedTerm, limit: 30 }),
    open || !!value,
  );

  const singleClientQuery = useData(
    "/clients/" + value,
    !!value && !initialClient,
  );

  const rawClients: ClientItem[] = clientsQuery.data?.data || [];
  const listClients = rawClients.filter(
    (c) => !excludeId || c.id !== excludeId,
  );

  const selectedClient: ClientItem | undefined =
    initialClient?.id === value
      ? initialClient
      : listClients.find((c) => c.id === value) ||
        (singleClientQuery.data?.data?.id === value
          ? singleClientQuery.data.data
          : undefined);

  const termLower = searchTerm.trim().toLowerCase();
  const filteredClients = listClients.filter((c) => {
    if (!termLower) return true;
    return (
      (c.name && c.name.toLowerCase().includes(termLower)) ||
      (c.phone && c.phone.toLowerCase().includes(termLower)) ||
      (c.email && c.email.toLowerCase().includes(termLower)) ||
      (c.city && c.city.toLowerCase().includes(termLower))
    );
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleSelect = (client: ClientItem) => {
    onChange(client.id, client);
    setOpen(false);
    setSearchTerm("");
    setHighlightedIndex(-1);
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange("", null);
    setSearchTerm("");
    setOpen(true);
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleOpenSearch = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!disabled) {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`client-combobox ${className} ${open ? "is-open" : ""}`}
    >
      <input
        type="text"
        name={name}
        value={value || ""}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: "absolute",
          opacity: 0,
          width: "1px",
          height: "1px",
          margin: "-1px",
          padding: 0,
          border: 0,
          pointerEvents: "none",
          clip: "rect(0 0 0 0)",
          overflow: "hidden",
        }}
        readOnly
      />

      {value && selectedClient && !open ? (
        <div
          className={`client-combobox-selected ${disabled ? "disabled" : ""}`}
          onClick={handleOpenSearch}
          title="Click to change selected client"
        >
          <div className="client-combobox-selected-info">
            <Avatar name={selectedClient.name} size="small" />
            <div className="client-combobox-details">
              <div className="client-combobox-name-row">
                <strong className="client-combobox-name">
                  {selectedClient.name}
                </strong>
                {selectedClient.kind && (
                  <span
                    className={`badge ${selectedClient.kind === "Business" ? "lavender" : "mint"}`}
                  >
                    {selectedClient.kind}
                  </span>
                )}
              </div>
              <div className="client-combobox-meta">
                {selectedClient.phone && <span>{selectedClient.phone}</span>}
                {selectedClient.email && (
                  <>
                    {selectedClient.phone && (
                      <span className="separator">·</span>
                    )}
                    <span>{selectedClient.email}</span>
                  </>
                )}
                {selectedClient.city && (
                  <>
                    <span className="separator">·</span>
                    <span>{selectedClient.city}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="client-combobox-selected-actions">
            {!disabled && (
              <>
                <button
                  type="button"
                  className="button small client-combobox-change-btn"
                  onClick={handleOpenSearch}
                >
                  Change
                </button>
                <button
                  type="button"
                  aria-label="Clear selected client"
                  title="Clear client"
                  className="client-combobox-clear-btn"
                  onClick={handleClear}
                >
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`client-combobox-input-wrap ${open ? "is-focused" : ""} ${disabled ? "disabled" : ""}`}
          onClick={() => {
            if (!disabled && !open) {
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          <Search size={16} className="client-combobox-icon" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="client-combobox-list"
            autoComplete="off"
            className="client-combobox-input"
            placeholder={
              value && selectedClient
                ? `Current: ${selectedClient.name} (type to change...)`
                : placeholder
            }
            value={searchTerm}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!open) setOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) {
                  setOpen(true);
                } else if (filteredClients.length > 0) {
                  setHighlightedIndex((prev) =>
                    prev < filteredClients.length - 1 ? prev + 1 : 0,
                  );
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (open && filteredClients.length > 0) {
                  setHighlightedIndex((prev) =>
                    prev > 0 ? prev - 1 : filteredClients.length - 1,
                  );
                }
              } else if (e.key === "Enter") {
                if (
                  open &&
                  highlightedIndex >= 0 &&
                  filteredClients[highlightedIndex]
                ) {
                  e.preventDefault();
                  handleSelect(filteredClients[highlightedIndex]);
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
          />
          <div className="client-combobox-input-actions">
            {clientsQuery.isPending && (
              <Loading layout="inline" />
            )}
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search text"
                className="client-combobox-clear-query"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm("");
                  inputRef.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            )}
            {value && (
              <button
                type="button"
                aria-label="Clear selected client"
                title="Clear selected client"
                className="client-combobox-clear-query"
                onClick={handleClear}
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-label={open ? "Close menu" : "Open menu"}
              className="client-combobox-toggle"
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  setOpen(!open);
                  if (!open) inputRef.current?.focus();
                }
              }}
            >
              <ChevronDown
                size={16}
                className={`chevron-icon ${open ? "rotated" : ""}`}
              />
            </button>
          </div>
        </div>
      )}

      {open && !disabled && (
        <div
          id="client-combobox-list"
          role="listbox"
          className="client-combobox-dropdown"
        >
          {clientsQuery.isPending ? <Loading /> : filteredClients.length > 0 ? (
            <div className="client-combobox-options">
              {filteredClients.map((c, idx) => {
                const isSelected = c.id === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`client-combobox-option ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(c)}
                  >
                    <Avatar name={c.name} size="small" />
                    <div className="client-combobox-option-info">
                      <div className="client-combobox-option-title">
                        <strong className="client-name">{c.name}</strong>
                        {c.kind && (
                          <span
                            className={`badge ${c.kind === "Business" ? "lavender" : "mint"}`}
                          >
                            {c.kind}
                          </span>
                        )}
                      </div>
                      <div className="client-combobox-option-meta">
                        {c.phone && <span>{c.phone}</span>}
                        {c.email && (
                          <>
                            {c.phone && <span className="separator">·</span>}
                            <span>{c.email}</span>
                          </>
                        )}
                        {c.city && (
                          <>
                            <span className="separator">·</span>
                            <span>{c.city}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="client-combobox-option-check">
                        <Check size={16} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="client-combobox-empty">
              <Users size={24} className="empty-icon" />
              <div className="empty-text">
                <p>
                  {searchTerm
                    ? `No clients found matching "${searchTerm}"`
                    : "No clients available"}
                </p>
                <small>Check the search query or create a new client</small>
              </div>
              <Link
                to="/clients/new"
                className="button small primary client-combobox-add-btn"
                onClick={() => setOpen(false)}
              >
                <Plus size={14} />
                Add New Client
              </Link>
            </div>
          )}

          <div className="client-combobox-footer">
            <Link
              to="/clients/new"
              className="client-combobox-footer-action"
              onClick={() => setOpen(false)}
            >
              <UserPlus size={14} />
              <span>+ Add New Client</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export {
  ArrowRight,
  Plus,
  Check,
  Download,
  Search,
  CalendarDays,
  MessageCircle,
  Phone,
  ShieldCheck,
  FileText,
};
