import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { todayIST } from "./api";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const isoOf = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
const display = (v: string) => (v ? v.split("-").reverse().join("/") : "");
// Typed dates are day-first (India); only a real calendar date with a four-digit year is accepted.
const parse = (text: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(y, mo - 1, d);
  return y >= 1000 && real.getMonth() === mo - 1 && real.getDate() === d
    ? iso(y, mo, d)
    : "";
};
// Slashes are added as digits are typed (12031990 → 12/03/1990); typed separators are kept as slashes.
const mask = (raw: string) => {
  const parts = raw
    .replace(/[^\d/.\-\s]/g, "")
    .split(/[/.\-\s]+/)
    .slice(0, 3);
  for (let i = 0; i < parts.length && i < 3; i++) {
    const size = i === 2 ? 4 : 2;
    if (parts[i].length <= size) continue;
    if (i < 2) parts[i + 1] = parts[i].slice(size) + (parts[i + 1] || "");
    parts[i] = parts[i].slice(0, size);
  }
  return parts.join("/");
};
const shift = (v: string, days: number, months = 0) => {
  const [y, m, d] = v.split("-").map(Number);
  if (!months) return isoOf(new Date(y, m - 1, d + days));
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return isoOf(new Date(y, m - 1 + months, Math.min(d, last)));
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const timeLabel = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
const slots = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);

// A day-first date input with a calendar. Values are YYYY-MM-DD, or YYYY-MM-DDTHH:mm with `withTime`,
// and "" until a complete, real date in range is entered. With `name` the value is posted with the form.
export default function DateField({
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  required = false,
  disabled = false,
  min,
  max,
  withTime = false,
  error,
  inputRef,
  className = "",
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  withTime?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  "aria-label"?: string;
}) {
  const initial = value ?? defaultValue ?? "";
  const [day, setDay] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [text, setText] = useState(display(initial.slice(0, 10)));
  const [left, setLeft] = useState(false);
  const [open, setOpen] = useState(false);
  const today = todayIST();
  const within = (v: string) => (!min || v >= min) && (!max || v <= max);
  const start = () => day || (within(today) ? today : max || min || today);
  const [view, setView] = useState(() => start().slice(0, 7));
  const [cursor, setCursor] = useState("");
  const wrap = useRef<HTMLSpanElement>(null),
    control = useRef<HTMLSpanElement>(null),
    input = useRef<HTMLInputElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const emitted = useRef(initial);
  useEffect(() => {
    if (value === undefined || value === emitted.current) return;
    emitted.current = value;
    setDay(value.slice(0, 10));
    setTime(value.slice(11, 16));
    setText(display(value.slice(0, 10)));
    setLeft(false);
  }, [value]);
  const compose = (d: string, t: string) =>
    d ? (withTime ? `${d}T${t || "10:00"}` : d) : "";
  const commit = (d: string, t = time) => {
    setDay(d);
    if (withTime && d && !t) setTime((t = "10:00"));
    const next = compose(d, t);
    if (next === emitted.current) return;
    emitted.current = next;
    onChange?.(next);
  };
  const typed = parse(text);
  const issue = !text
    ? ""
    : !typed
      ? /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)
        ? "That date does not exist. Check the day and month."
        : "Enter the full date as DD/MM/YYYY."
      : min && typed < min
        ? `Choose a date on or after ${display(min)}.`
        : max && typed > max
          ? `Choose a date on or before ${display(max)}.`
          : "";
  // Forms that rely on the browser's own checks are held back by the same message.
  useEffect(() => input.current?.setCustomValidity(issue), [issue]);
  const message = error || (left ? issue : "");
  const show = () => {
    const from = start();
    setView(from.slice(0, 7));
    setCursor(from);
    setOpen(true);
  };
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) input.current?.focus();
  };
  const pick = (d: string) => {
    setText(display(d));
    commit(d);
    close(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const el = popup.current!;
    // The top layer keeps the calendar above dialogs and clear of scrolling containers.
    try {
      el.showPopover?.();
    } catch {
      /* Already shown */
    }
    const place = () => {
      const r = control.current!.getBoundingClientRect();
      const w = el.offsetWidth,
        h = el.offsetHeight,
        vw = document.documentElement.clientWidth,
        vh = window.innerHeight;
      const below = r.bottom + 6;
      el.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + "px";
      el.style.top =
        (below + h <= vh - 8
          ? below
          : r.top - h - 6 >= 8
            ? r.top - h - 6
            : Math.max(8, vh - h - 8)) + "px";
    };
    place();
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open]);
  const moved = useRef(false);
  useEffect(() => {
    if (!open || !moved.current) return;
    moved.current = false;
    popup.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)
      ?.focus();
  }, [open, cursor, view]);
  const [vy, vm] = view.split("-").map(Number);
  const firstYear = Number((min || "1900").slice(0, 4)),
    lastYear = Number(
      (max || String(new Date().getFullYear() + 30)).slice(0, 4),
    );
  const go = (y: number, m: number) => {
    const d = new Date(y, m - 1, 1);
    if (d.getFullYear() < firstYear || d.getFullYear() > lastYear) return;
    setView(isoOf(d).slice(0, 7));
  };
  const offset = new Date(vy, vm - 1, 1).getDay(),
    count = new Date(vy, vm, 0).getDate();
  const focusable =
    cursor.slice(0, 7) === view
      ? cursor
      : day.slice(0, 7) === view
        ? day
        : view + "-01";
  const gridKeys = (e: KeyboardEvent) => {
    const from = (e.target as HTMLElement).dataset?.date;
    if (!from) return;
    const to = {
      ArrowLeft: shift(from, -1),
      ArrowRight: shift(from, 1),
      ArrowUp: shift(from, -7),
      ArrowDown: shift(from, 7),
      PageUp: shift(from, 0, -1),
      PageDown: shift(from, 0, 1),
    }[e.key];
    if (!to) return;
    e.preventDefault();
    if (!within(to)) return;
    moved.current = true;
    setView(to.slice(0, 7));
    setCursor(to);
  };
  return (
    <span
      ref={wrap}
      className={`date-field ${withTime ? "with-time " : ""}${className}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        // Escape closes only the calendar, not the dialog around it.
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }}
      onBlur={(e) => {
        if (e.relatedTarget && !wrap.current?.contains(e.relatedTarget))
          setOpen(false);
      }}
    >
      <span className="date-field-control" ref={control}>
        <input
          ref={(el) => {
            input.current = el;
            if (typeof inputRef === "function") inputRef(el);
            else if (inputRef) inputRef.current = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          aria-label={ariaLabel}
          aria-invalid={!!message}
          aria-describedby={message ? errorId : undefined}
          required={required}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            const next = mask(e.target.value);
            const d = parse(next);
            setText(next);
            if (d && within(d)) {
              setView(d.slice(0, 7));
              setCursor(d);
              commit(d);
            } else commit("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              show();
            }
          }}
          onBlur={() => {
            setLeft(true);
            if (typed && !issue) setText(display(typed));
            onBlur?.();
          }}
        />
        <button
          type="button"
          className="date-field-toggle"
          aria-label={open ? "Close calendar" : "Open calendar"}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => (open ? close() : show())}
        >
          <CalendarDays size={16} />
        </button>
      </span>
      {withTime && (
        <select
          className="date-field-time"
          aria-label="Time"
          value={day ? time || "10:00" : time}
          disabled={disabled}
          onChange={(e) => {
            setTime(e.target.value);
            commit(day, e.target.value);
          }}
        >
          {!day && !time && <option value="">Time</option>}
          {(time && !slots.includes(time)
            ? [...slots, time].sort()
            : slots
          ).map((slot) => (
            <option key={slot} value={slot}>
              {timeLabel(slot)}
            </option>
          ))}
        </select>
      )}
      {name && <input type="hidden" name={name} value={compose(day, time)} />}
      {open && (
        <div
          ref={popup}
          popover="manual"
          role="dialog"
          aria-label="Choose a date"
          className="date-popover"
          // Inside a <label>, a click on the calendar's background must not jump back to the text box.
          onClick={(e) => e.preventDefault()}
        >
          <div className="date-popover-head">
            <button
              type="button"
              aria-label="Previous month"
              disabled={vy === firstYear && vm === 1}
              onClick={() => go(vy, vm - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <select
              aria-label="Month"
              value={vm}
              onChange={(e) => go(vy, Number(e.target.value))}
            >
              {months.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={vy}
              onChange={(e) => go(Number(e.target.value), vm)}
            >
              {Array.from(
                { length: lastYear - firstYear + 1 },
                (_, i) => firstYear + i,
              ).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              disabled={vy === lastYear && vm === 12}
              onClick={() => go(vy, vm + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-popover-grid" onKeyDown={gridKeys}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const n = i - offset + 1;
              if (n < 1 || n > count) return <span key={i} />;
              const d = iso(vy, vm, n);
              return (
                <button
                  key={i}
                  type="button"
                  data-date={d}
                  className={
                    (d === day ? "selected " : "") +
                    (d === today ? "today" : "")
                  }
                  aria-label={`${n} ${months[vm - 1]} ${vy}`}
                  aria-pressed={d === day}
                  tabIndex={d === focusable ? 0 : -1}
                  disabled={!within(d)}
                  onClick={() => pick(d)}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="date-popover-foot">
            {!required && (day || text) ? (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  commit("");
                  close(true);
                }}
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            {within(today) && (
              <button type="button" onClick={() => pick(today)}>
                Today
              </button>
            )}
          </div>
        </div>
      )}
      {message && (
        <small className="field-error" id={errorId}>
          {message}
        </small>
      )}
    </span>
  );
}
