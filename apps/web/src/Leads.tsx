import { useState } from "react";
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
import {
  Columns3,
  Filter,
  GripVertical,
  List,
  Phone,
  Plus,
} from "lucide-react";
import { stages } from "../../../packages/contracts/src/index";
import { date, query, useData, useWrite } from "./api";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  Metrics,
  PageHeading,
  Panel,
  ProductIcon,
  SearchInput,
  useToast,
} from "./components";
export default function Leads() {
  const [params, setParams] = useSearchParams(),
    [view, setView] = useState("Kanban"),
    [filters, setFilters] = useState(false),
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
      <PageHeading
        title="Leads"
        subtitle="Track and manage your prospects from enquiry to conversion."
        actions={
          <>
            <div className="segmented">
              {[
                ["Kanban", Columns3],
                ["List", List],
              ].map(([label, C]: any) => (
                <button
                  key={label}
                  className={view === label ? "primary" : ""}
                  onClick={() => setView(label)}
                >
                  <C size={16} />
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <Filter size={16} />
              More Filters
            </button>
            <Link className="button primary" to="/leads/new">
              <Plus size={16} />
              Add Lead
            </Link>
          </>
        }
      />
      <Metrics
        items={[
          {
            label: "Total Leads",
            value: d.leads?.length,
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
      {filters && (
        <div className="filters panel">
          <SearchInput
            value={params.get("q") || ""}
            onChange={(v) =>
              setParams((p) => {
                p.set("q", v);
                return p;
              })
            }
            placeholder="Search leads by name or requirement..."
          />
          <select
            aria-label="Lead priority"
            value={params.get("priority") || ""}
            onChange={(e) =>
              setParams((p) => {
                p.set("priority", e.target.value);
                return p;
              })
            }
          >
            <option value="">All priorities</option>
            <option>Normal</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
          <button onClick={() => setParams({})}>Reset</button>
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : view === "Kanban" ? (
        <DndContext sensors={sensors} onDragEnd={move}>
          <div className="lead-board">
            {stages.map((s, i) => (
              <LeadColumn
                key={s}
                stage={s}
                index={i}
                rows={rows.filter((r: any) => r.stage === s)}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <Panel>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Requirement</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Next action</th>
                  <th>Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <Link className="person-cell" to={"/leads/" + l.id}>
                        <Avatar name={l.client.name} />
                        <strong>{l.client.name}</strong>
                      </Link>
                    </td>
                    <td>{l.requirement}</td>
                    <td>
                      <Badge>{l.stage}</Badge>
                    </td>
                    <td>
                      <Badge>{l.priority}</Badge>
                    </td>
                    <td>{l.nextAction}</td>
                    <td>{date(l.nextFollowUp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
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
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={`lead-column stage-${index} ${isOver ? "drag-over" : ""}`}
      aria-label={stage}
    >
      <header>
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
      <Link
        className="button add-lead"
        to={
          "/leads/new?stage=" +
          encodeURIComponent(index < 4 ? stage : "New Enquiries")
        }
      >
        <Plus size={16} />
        Add {index === 0 ? "New " : ""}Lead
      </Link>
      <div className="lead-column-cards">
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
      <Avatar name={l.client.name} />
      <div className="lead-card-body">
        <Link to={"/leads/" + l.id}>
          <strong>{l.client.name}</strong>
        </Link>
        <small>
          <Phone size={10} />
          {l.client.phone}
        </small>
        <p>
          <ProductIcon category={l.requirement} size={13} />
          {l.requirement}
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
