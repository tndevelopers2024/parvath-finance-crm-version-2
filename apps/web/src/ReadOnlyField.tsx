import { useId, type ReactNode } from "react";

/** Display-only form information must explain why it cannot be edited. */
export default function ReadOnlyField({
  label,
  value,
  reason,
  badge = "Read only",
  live = false,
}: {
  label: string;
  value: ReactNode;
  reason: string;
  badge?: string;
  live?: boolean;
}) {
  const labelId = useId(),
    reasonId = useId();
  return (
    <div className="readonly-field">
      <div className="readonly-field-label">
        <span id={labelId}>{label}</span>
        <span className="readonly-field-badge">{badge}</span>
      </div>
      <output
        aria-labelledby={labelId}
        aria-describedby={reasonId}
        aria-live={live ? "polite" : "off"}
      >
        {value}
      </output>
      <small id={reasonId}>{reason}</small>
    </div>
  );
}
