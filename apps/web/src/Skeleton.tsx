import "./skeleton.css";

export type SkeletonLayout = "rows" | "dashboard" | "board" | "calendar" | "detail" | "form" | "inline";

export default function Skeleton({ layout = "rows" }: { layout?: SkeletonLayout }) {
  const line = (className = "", key?: number) => <span key={key} className={`skeleton-block ${className}`} />;
  const rows = (count: number) => <div className="skeleton-rows">{Array.from({ length: count }, (_, i) => <div className="skeleton-row" key={i}>{line("skeleton-avatar")}<div className="skeleton-copy">{line("skeleton-title")}{line("skeleton-text")}</div>{line("skeleton-tag")}</div>)}</div>;
  const metrics = <div className="skeleton-metrics">{Array.from({ length: 4 }, (_, i) => <div className="skeleton-panel" key={i}>{line("skeleton-title")}{line("skeleton-number")}{line("skeleton-text")}</div>)}</div>;
  const calendar = <div className="skeleton-panel">{line("skeleton-title")}<div className="skeleton-calendar">{Array.from({ length: 35 }, (_, i) => line("skeleton-day", i))}</div>{rows(3)}</div>;
  return <div className={`skeleton-loader skeleton-${layout}`} role="status" aria-label="Loading content">
    <span className="skeleton-sr-only">Loading content…</span>
    <div aria-hidden="true">
      {layout === "inline" ? line("skeleton-text") :
        layout === "dashboard" ? <>{metrics}<div className="skeleton-columns"><div className="skeleton-panel">{line("skeleton-title")}{rows(4)}</div>{calendar}</div></> :
        layout === "board" ? <div className="skeleton-board">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-panel" key={i}>{line("skeleton-title")}{rows(3)}</div>)}</div> :
        layout === "calendar" ? <div className="skeleton-columns">{calendar}<div className="skeleton-panel">{rows(5)}</div></div> :
        layout === "detail" ? <>{line("skeleton-heading")}{metrics}<div className="skeleton-panel">{rows(5)}</div></> :
        layout === "form" ? <div className="skeleton-panel">{line("skeleton-heading")}<div className="skeleton-fields">{Array.from({ length: 6 }, (_, i) => <div key={i}>{line("skeleton-title")}{line("skeleton-input")}</div>)}</div></div> : rows(5)}
    </div>
  </div>;
}
