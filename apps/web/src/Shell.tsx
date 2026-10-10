import { Fragment, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  ChartNoAxesColumnIncreasing,
  CheckSquare,
  ChevronDown,
  House,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Search,
  Settings,
  Target,
  Users,
  X,
  CalendarDays,
  Moon,
  Sun,
  PanelLeft,
} from "lucide-react";
import { api, useData } from "./api";
import { Avatar, Loading, Modal, useAuth } from "./components";
import { Notifications } from "./Supporting";
import { useTheme } from "./theme";
const nav = [
  ["Dashboard", "/dashboard", House],
  ["Calendar", "/calendar", CalendarDays],
  ["Renewals", "/renewals", CalendarDays],
  ["Follow-ups", "/followups", CheckSquare],
  ["Clients", "/clients", Users],
  ["Leads", "/leads", Target],
  ["Products", "/products", Package],
  ["Providers", "/providers", House],
  ["Engagement", "/engagement", MessageCircle],
  ["Reports", "/reports", ChartNoAxesColumnIncreasing],
  ["Settings", "/settings", Settings],
] as const;
export default function Shell() {
  const user = useAuth(),
    location = useLocation(),
    navigate = useNavigate(),
    { resolvedTheme, toggleTheme } = useTheme();
  const [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [account, setAccount] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [sidebarExpanded, setSidebarExpanded] = useState(false),
    [pinned, setPinned] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 999px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 999px)");
    const update = () => {
      setCompact(media.matches);
      setDrawer(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!drawer || !compact) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = sidebar.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>("a,button") || [],
      ).filter((node) => node.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    element?.addEventListener("keydown", trap);
    return () => {
      element?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [drawer, compact]);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180);
    return () => clearTimeout(t);
  }, [search]);
  const results = useData(
      "/search?q=" + encodeURIComponent(debounced),
      debounced.length >= 2,
    ),
    notifications = useData("/notifications");
  useEffect(() => {
    setDrawer(false);
    setSearch("");
    setSearchOpen(false);
    setAccount(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!searchOpen && !account) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        searchOpen &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setSearchOpen(false);
        setSearch("");
      }
      if (
        account &&
        accountRef.current &&
        !accountRef.current.contains(target)
      ) {
        setAccount(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [searchOpen, account]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => input.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setDrawer(false);
        setSearch("");
        setSearchOpen(false);
        setAccount(false);
        input.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const isLead = location.pathname.startsWith("/leads"),
    isFollow = location.pathname.startsWith("/followups");
  const primary = isLead
    ? ["Add Lead", "/leads/new"]
    : isFollow
      ? ["Add Follow-up", "/followups/new"]
      : ["Add Client", "/clients/new"];
  return (
    <div className="app-shell workspace-redesign">
      {drawer && (
        <button
          className="drawer-backdrop"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="main-navigation"
        className={`sidebar ${compact ? (drawer ? "open" : "") : pinned || sidebarExpanded ? "sidebar--expanded" : "sidebar--mini"}`}
        inert={compact && !drawer ? true : undefined}
        role={compact && drawer ? "dialog" : undefined}
        aria-modal={compact && drawer ? true : undefined}
        aria-label={compact && drawer ? "Navigation" : undefined}
        onMouseEnter={() => !compact && setSidebarExpanded(true)}
        onMouseLeave={() => !compact && setSidebarExpanded(false)}
      >
        <Link className="brand" to="/dashboard">
          <img src="/assets/leaf-logo.png" alt="" />
          <span className="brand-text">
            <strong>Parvath FinServ</strong>
            <small>Your Financial Partner</small>
          </span>
        </Link>
        <button
          className="drawer-close"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X />
        </button>
        <div className="nav-section-label">DAILY WORK</div>
        <nav aria-label="Main navigation">
          {nav.map(([label, to, C], index) => (
            <Fragment key={to}>
              {index === 4 && (
                <div className="nav-section-label">RELATIONSHIPS</div>
              )}
              {index === 9 && (
                <div className="nav-section-label">MANAGEMENT</div>
              )}
              <NavLink key={to} to={to} title={label} aria-label={label}>
                <C size={19} />
                <span className="nav-label">{label}</span>
              </NavLink>
            </Fragment>
          ))}
        </nav>
        <Link className="sidebar-account" to="/settings">
          <Avatar name={user.name} followCursor={false} />
          <span>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </span>
          <Settings size={16} />
        </Link>
      </aside>
      <div className="workspace" inert={compact && drawer}>
        <header className="topbar">
          <button
            className="menu-toggle"
            aria-label={
              compact
                ? "Open navigation"
                : pinned
                  ? "Unpin navigation"
                  : "Pin navigation"
            }
            aria-expanded={compact ? drawer : pinned}
            aria-controls="main-navigation"
            onClick={() => (compact ? setDrawer(true) : setPinned(!pinned))}
          >
            {compact ? <Menu /> : <PanelLeft />}
          </button>
          <div className="workspace-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>
              {nav.find(([, to]) => location.pathname.startsWith(to))?.[0] ||
                "Notifications"}
            </strong>
          </div>
          <div className="top-actions">
            <div
              ref={searchContainerRef}
              className={`topbar-search ${searchOpen ? "is-expanded" : ""}`}
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true);
                  setTimeout(() => input.current?.focus(), 50);
                }
              }}
            >
              <button
                type="button"
                className="topbar-search-icon"
                aria-label={searchOpen ? "Search icon" : "Search records"}
                tabIndex={searchOpen ? -1 : 0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (searchOpen) {
                    if (search.length === 0) {
                      setSearchOpen(false);
                      input.current?.blur();
                    } else {
                      input.current?.focus();
                    }
                  } else {
                    setSearchOpen(true);
                    setTimeout(() => input.current?.focus(), 50);
                  }
                }}
              >
                <Search size={18} />
              </button>
              <input
                ref={input}
                className="topbar-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search clients, leads, policies..."
                aria-label="Search all records"
                tabIndex={searchOpen ? 0 : -1}
              />
              {searchOpen && (
                <button
                  type="button"
                  className="topbar-search-clear"
                  aria-label="Close search"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearch("");
                    setSearchOpen(false);
                    input.current?.blur();
                  }}
                >
                  <X size={14} />
                </button>
              )}
              {searchOpen && debounced.length >= 2 && (
                <div className="search-results">
                  {results.isPending ? (
                    <Loading />
                  ) : results.error ? (
                    <p className="search-status search-error">
                      {results.error.message}
                    </p>
                  ) : results.data?.data.length ? (
                    results.data.data.map((r: any) => (
                      <Link
                        key={r.id}
                        to={r.url}
                        onClick={() => {
                          setSearchOpen(false);
                          setSearch("");
                        }}
                      >
                        <Search size={15} />
                        <span>
                          <strong>{r.title}</strong>
                          <small>{r.subtitle}</small>
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="search-status">No matching records found</p>
                  )}
                </div>
              )}
            </div>
            {!isLead &&
              !location.pathname.startsWith("/products") &&
              (user.role !== "Operations" || isFollow) && (
                <Link className="button primary" to={primary[1]}>
                  <Plus size={19} />
                  <span>{primary[0]}</span>
                </Link>
              )}
            <button
              type="button"
              className="notification-button"
              onClick={() => setNotificationsOpen(true)}
              aria-haspopup="dialog"
              aria-label="Notifications"
            >
              <Bell size={20} />
              {notifications.data?.data.filter((n: any) => !n.readAt).length >
                0 && (
                <b>
                  {notifications.data.data.filter((n: any) => !n.readAt).length}
                </b>
              )}
            </button>
            <div
              ref={accountRef}
              className="account"
              onMouseEnter={() => setAccount(true)}
              onMouseLeave={() => setAccount(false)}
            >
              <button
                onClick={() => setAccount(!account)}
                aria-expanded={account}
                aria-label="Account menu"
              >
                <Avatar name={user.name} />
                <span>{user.name.split(" ")[0]}</span>
                <ChevronDown size={15} />
              </button>
              {account && (
                <div className="account-menu">
                  <p>{user.role}</p>

                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme();
                    }}
                  >
                    {resolvedTheme === "dark" ? (
                      <Sun size={16} />
                    ) : (
                      <Moon size={16} />
                    )}
                    {resolvedTheme === "dark"
                      ? "Light appearance"
                      : "Dark appearance"}
                  </button>
                  <Link to="/settings">
                    <Settings size={16} />
                    Account settings
                  </Link>
                  <button
                    onClick={async () => {
                      await api("/auth/logout", { method: "POST" });
                      navigate("/login");
                      window.location.reload();
                    }}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {notificationsOpen && (
          <Modal title="Notifications" className="notifications-popup" onClose={() => setNotificationsOpen(false)}>
            <Notifications onClose={() => setNotificationsOpen(false)} />
          </Modal>
        )}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
