import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { stages } from "../../../packages/contracts/src/index";
import { date, query, useData, useWrite } from "./api";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  Metrics,
  ProductIcon,
  useAuth,
  useToast,
} from "./components";
export default function Leads() {
  const user = useAuth();
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    toast = useToast(),
    write = useWrite();
  const q = useData(
      "/leads?" +
        query({
          q: params.get("q"),
          priority: params.get("priority"),
          limit: 100,
        }),
    ),
    stats = useData("/dashboard");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const d = stats.data?.data || {},
    rows = q.data?.data || [];
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
  }, [q.isPending]);
  // One stage at a time: a column is about 300px wide plus its gap.
  const scrollBoard = (direction: number) =>
    boardRef.current?.scrollBy({ left: direction * 316, behavior: "smooth" });
  const move = async (e: DragEndEvent) => {
    if (!e.over) return;
    const lead = rows.find((r: any) => r.id === e.active.id),
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
            to: "/leads?priority=High",
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
      {user.role !== "Operations" && (
        <Link className="lead-add-bar" to="/leads/new">
          <Plus size={18} /> Add Lead
        </Link>
      )}
      {q.isPending ? (
        <Loading layout="board" />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <DndContext sensors={sensors} onDragEnd={move}>
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
            {stages.map((s, i) => s === "Qualified" ? null : (
              <LeadColumn
                key={s}
                stage={s}
                index={i}
                rows={rows.filter((r: any) => r.stage === s)}
              />
            ))}
          </div>
        </DndContext>
      )}
    </>
  );
}
function LeadColumn({
  stage,
  index,
  rows,
}: {
  stage: string;
  index: number;
  rows: any[];
}) {
  const [collapsed, setCollapsed] = useState(false);
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
          <b>{rows.length}</b>
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
        {!rows.length && <p className="empty-column">No opportunities</p>}
      </div>
    </section>
  );
}
function LeadCard({ lead: l }: { lead: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: l.id });
  return (
    <article
      ref={setNodeRef}
      className={`lead-card ${isDragging ? "dragging" : ""}`}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px,${transform.y}px,0)`,
              zIndex: 10,
            }
          : undefined
      }
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
        className="drag-handle"
        {...listeners}
        {...attributes}
        aria-label={`Move ${l.client.name}; use lead details for stage selection`}
      >
        <GripVertical size={14} />
      </button>
    </article>
  );
}
