import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  Plus,
  Table2,
} from "lucide-react";
import {
  leadStageLabel,
  stages,
  visibleLeadStages,
} from "../../../packages/contracts/src/index";
import { date, query, useData, useInfiniteData, useWrite } from "./api";
import {
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Loading,
  Metrics,
  Pagination,
  ProductIcon,
  pageSizeFrom,
  useAuth,
  useToast,
} from "./components";
export default function Leads() {
  const user = useAuth();
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    toast = useToast(),
    write = useWrite();
  // Each stage loads its own pages, so a column's count is the stage's full total and every lead is reachable.
  const filters = {
      q: params.get("q"),
      priority: params.get("priority"),
    },
    stats = useData("/dashboard");
  const [view, setViewState] = useState<"board" | "table">(() => {
    try {
      return localStorage.getItem("leads-view") === "table" ? "table" : "board";
    } catch {
      return "board";
    }
  });
  const setView = (next: "board" | "table") => {
    setViewState(next);
    try {
      localStorage.setItem("leads-view", next);
    } catch {
      /* ignore */
    }
  };
  const [dragging, setDragging] = useState<any>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const d = stats.data?.data || {};
  const boardRef = useRef<HTMLDivElement>(null);
  // A plain mouse wheel moves the board sideways, so scrolling works anywhere over it.
  // A column whose cards can still scroll keeps the wheel, and the page scrolls once the
  // board reaches its end. The listener must be non-passive to cancel the default.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
      const cards = (e.target as HTMLElement).closest(".lead-column-cards");
      if (
        cards instanceof HTMLElement &&
        cards.scrollHeight > cards.clientHeight
      ) {
        const down = e.deltaY > 0;
        const room = down
          ? cards.scrollTop + cards.clientHeight < cards.scrollHeight - 1
          : cards.scrollTop > 0;
        if (room) return;
      }
      const amount = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const max = board.scrollWidth - board.clientWidth;
      const canMove =
        amount > 0 ? board.scrollLeft < max - 1 : board.scrollLeft > 0;
      if (!canMove) return;
      e.preventDefault();
      board.scrollLeft += amount;
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);
  // One stage at a time: a column is about 300px wide plus its gap.
  const scrollBoard = (direction: number) =>
    boardRef.current?.scrollBy({ left: direction * 316, behavior: "smooth" });
  const move = async (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over) return;
    const lead = e.active.data.current?.lead,
      stage = String(e.over.id);
    if (!lead || lead.stage === stage) return;
    if (
      ["Won", "Lost"].includes(stage) ||
      ["Won", "Lost"].includes(lead.stage)
    ) {
      navigate("/leads/" + lead.id);
      toast("Record the sales outcome from lead details.");
      return;
    }
    try {
      await write.mutateAsync({
        path: `/leads/${lead.id}/stage`,
        body: { stage, version: lead.version },
      });
      toast("Lead moved to " + stage);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <>
      <Metrics
        items={[
          {
            label: "Total Leads",
            value: d.totalLeads ?? d.leads?.length,
            icon: "clients",
            note: "All opportunities",
            to: "/leads",
          },
          {
            label: "Hot Leads",
            value: d.hotLeads,
            icon: "hot",
            note: "Need attention",
            tone: "rose",
            to: "/leads?priority=Hot",
          },
          {
            label: "Converted",
            value: d.won,
            icon: "leads",
            note: "Sales accepted",
            tone: "blue",
            to: "/leads",
          },
          {
            label: "Lost",
            value: d.lost,
            icon: "lost",
            note: "Closed opportunities",
            tone: "rose",
            to: "/leads",
          },
        ]}
      />
      <div className="lead-toolbar">
        <div className="lead-view-toggle" role="group" aria-label="Lead view">
          <button
            type="button"
            className={view === "board" ? "active" : ""}
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={16} /> Board
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <Table2 size={16} /> Table
          </button>
        </div>
        {user.role !== "Operations" && (
          <Link className="lead-add-bar" to="/leads/new">
            <Plus size={18} /> Add Lead
          </Link>
        )}
      </div>
      {view === "table" ? (
        <LeadTable filters={filters} />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setDragging(e.active.data.current?.lead || null)
          }
          onDragEnd={move}
          onDragCancel={() => setDragging(null)}
        >
          <div className="lead-board-nav">
            <span>
              Swipe, use shift + scroll, or the arrows to see every stage
            </span>
            <div>
              <button
                type="button"
                aria-label="Scroll stages left"
                onClick={() => scrollBoard(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Scroll stages right"
                onClick={() => scrollBoard(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="lead-board" ref={boardRef}>
            {visibleLeadStages.map((s) => (
              <LeadColumn
                key={s}
                stage={s}
                index={stages.indexOf(s)}
                filters={filters}
              />
            ))}
          </div>
          {/* The dragged card is drawn here, above every column, so it never slides behind the others. */}
          <DragOverlay dropAnimation={null}>
            {dragging ? <LeadCardView lead={dragging} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
}
const pageSize = 25;
function LeadColumn({
  stage,
  index,
  filters,
}: {
  stage: string;
  index: number;
  filters: Record<string, string | null>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const leads = useInfiniteData(
    "/leads?" + query({ ...filters, stage }),
    pageSize,
  );
  const rows: any[] = leads.data?.data || [];
  const total: number = leads.data?.meta?.total ?? 0;
  const more = useRef<HTMLButtonElement>(null);
  // Next page loads as the end of the column scrolls into view; the button does the same by hand.
  useEffect(() => {
    const el = more.current;
    if (!el || collapsed || !leads.hasMore || leads.loadingMore) return;
    const watcher = new IntersectionObserver(
      (hits) => hits.some((h) => h.isIntersecting) && leads.loadMore(),
      { rootMargin: "120px" },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [collapsed, leads.hasMore, leads.loadingMore, rows.length]);
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={`lead-column stage-${index} ${isOver ? "drag-over" : ""} ${collapsed ? "is-collapsed" : ""}`}
      aria-label={stage}
    >
      <header>
        <button
          type="button"
          className="lead-column-toggle"
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${stage}`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <h2>
          {stage}
          <b aria-label={`${total} leads in ${stage}`}>
            {leads.isPending ? "…" : total}
          </b>
        </h2>
        <p>
          {
            [
              "Recently received leads",
              "Initial discussion done",
              "Requirement confirmed",
              "Quotation shared",
              "Sales accepted · fulfilment separate",
              "Not interested / closed",
            ][index]
          }
        </p>
      </header>
      <div className="lead-column-cards" hidden={collapsed}>
        {rows.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
        {leads.isPending && <p className="empty-column">Loading leads…</p>}
        {leads.error && !rows.length && (
          <p className="empty-column" role="alert">
            {leads.error.message}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => void leads.refetch()}
            >
              Retry
            </button>
          </p>
        )}
        {!leads.isPending && !leads.error && !rows.length && (
          <p className="empty-column">No opportunities</p>
        )}
        {leads.hasMore && (
          <button
            ref={more}
            type="button"
            className="lead-load-more"
            disabled={leads.loadingMore}
            onClick={leads.loadMore}
          >
            {leads.loadingMore
              ? "Loading…"
              : `Show more (${rows.length} of ${total})`}
          </button>
        )}
      </div>
    </section>
  );
}
function LeadCard({ lead: l }: { lead: any }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: l.id,
    data: { lead: l },
  });
  // Pointer drags start from anywhere on the card; the handle keeps the keyboard drag.
  const { onPointerDown, ...keyboard } = (listeners || {}) as Record<
    string,
    any
  >;
  return (
    <LeadCardView
      lead={l}
      innerRef={setNodeRef}
      dragging={isDragging}
      onPointerDown={onPointerDown}
      handleProps={{ ...keyboard, ...attributes }}
    />
  );
}
function LeadCardView({
  lead: l,
  innerRef,
  dragging,
  overlay,
  onPointerDown,
  handleProps,
}: {
  lead: any;
  innerRef?: (node: HTMLElement | null) => void;
  dragging?: boolean;
  overlay?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  handleProps?: Record<string, any>;
}) {
  return (
    <article
      ref={innerRef}
      onPointerDown={onPointerDown}
      className={`lead-card ${dragging ? "dragging" : ""} ${overlay ? "lead-card-overlay" : ""}`}
    >
      <div className="lead-card-body">
        <div className="lead-card-profile min-w-0">
          <Avatar name={l.client.name} />
          <Link to={"/leads/" + l.id} className="min-w-0" title={l.client.name}>
            <strong>{l.client.name}</strong>
          </Link>
        </div>
        <p>
          <ProductIcon category={l.requirement} size={13} />
          <span>{l.requirement}</span>
        </p>
        <div className="lead-tags">
          <Badge
            tone={
              l.stage === "Won" ? "mint" : l.stage === "Lost" ? "rose" : "blue"
            }
          >
            {l.stage === "Won"
              ? "Converted"
              : l.stage === "Lost"
                ? "Closed"
                : l.source}
          </Badge>
          <span>{date(l.nextFollowUp || l.createdAt).replace("2026", "")}</span>
        </div>
        <Link
          className="lead-card-edit"
          to={`/leads/${l.id}${["Won", "Lost"].includes(l.stage) ? "" : "?edit=1"}`}
          aria-label={`${["Won", "Lost"].includes(l.stage) ? "View" : "Edit"} lead for ${l.client.name}`}
        >
          {["Won", "Lost"].includes(l.stage) ? "View details" : "Edit lead"}
        </Link>
      </div>
      <button
        type="button"
        className="drag-handle"
        {...handleProps}
        aria-label={`Move ${l.client.name}; use lead details for stage selection`}
      >
        <GripVertical size={14} />
      </button>
    </article>
  );
}

// Every lead in one paged table, with the same search and priority filters as the board.
function LeadTable({ filters }: { filters: Record<string, string | null> }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1),
    limit = pageSizeFrom(params.get("limit"), 25);
  const leads = useData(
    "/leads?" + query({ ...filters, page, limit }),
  );
  const go = (key: string, value: string) =>
    setParams((prev) => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      if (key !== "page") prev.delete("page");
      return prev;
    });
  if (leads.isPending) return <Loading />;
  if (leads.error) return <ErrorState error={leads.error} retry={leads.refetch} />;
  const rows: any[] = leads.data.data;
  return (
    <div className="lead-table-wrap">
      <div className="table-scroll">
        <table className="lead-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Requirement</th>
              <th>Stage</th>
              <th>Priority</th>
              <th>Source</th>
              <th>Next follow-up</th>
              <th>Added</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const closed = ["Won", "Lost"].includes(l.stage);
              return (
                <tr key={l.id}>
                  <td>
                    <Link className="person-cell" to={"/leads/" + l.id}>
                      <Avatar name={l.client.name} />
                      <span>
                        <strong>{l.client.name}</strong>
                        <small>{l.client.phone}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="lead-table-requirement">
                      <ProductIcon category={l.requirement} size={14} />
                      {l.requirement}
                    </span>
                  </td>
                  <td>
                    <Badge
                      tone={
                        l.stage === "Won"
                          ? "mint"
                          : l.stage === "Lost"
                            ? "rose"
                            : "blue"
                      }
                    >
                      {leadStageLabel(l.stage)}
                    </Badge>
                  </td>
                  <td>{l.priority}</td>
                  <td>{l.source || "—"}</td>
                  <td>{l.nextFollowUp ? date(l.nextFollowUp) : "—"}</td>
                  <td>{date(l.createdAt)}</td>
                  <td>
                    <Link
                      className="button small"
                      to={`/leads/${l.id}${closed ? "" : "?edit=1"}`}
                    >
                      {closed ? "View" : "Edit"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty text="No leads match these filters" />}
      </div>
      <Pagination
        total={leads.data.meta.total}
        page={page}
        limit={limit}
        onChange={(n) => go("page", n > 1 ? String(n) : "")}
        onLimitChange={(n) => go("limit", n === 25 ? "" : String(n))}
      />
    </div>
  );
}
