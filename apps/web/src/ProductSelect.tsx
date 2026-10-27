import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  category: string;
  provider: { name: string };
};

export default function ProductSelect({
  plans,
  value,
  onChange,
  loading = false,
  error,
  onRetry,
}: {
  plans: Plan[];
  value?: string;
  onChange?: (id: string) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const [internal, setInternal] = useState("");
  const selectedId = value ?? internal;
  const selected = plans.find((p) => p.id === selectedId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const errorId = useId();
  const matches = plans.filter((p) =>
    `${p.name} ${p.provider.name} ${p.category}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const choose = (id: string) => {
    setInternal(id);
    onChange?.(id);
    setInvalid(false);
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    setSearch("");
    setActive(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !popup.current) return;
    const menu = popup.current;
    menu.showPopover?.();
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const vv = window.visualViewport;
      const x = vv?.offsetLeft || 0,
        y = vv?.offsetTop || 0;
      const w = vv?.width || document.documentElement.clientWidth;
      const h = vv?.height || window.innerHeight;
      if (rect.bottom < y || rect.top > y + h) {
        setOpen(false);
        return;
      }
      const below = y + h - rect.bottom - 12,
        above = rect.top - y - 12;
      const up = below < 240 && above > below;
      menu.style.width = Math.min(rect.width, w - 16) + "px";
      menu.style.maxHeight =
        Math.max(0, Math.min(380, up ? above : below)) + "px";
      menu.style.left =
        Math.max(x + 8, Math.min(rect.left, x + w - menu.offsetWidth - 8)) +
        "px";
      menu.style.top =
        (up ? rect.top - menu.offsetHeight - 6 : rect.bottom + 6) + "px";
    };
    place();
    input.current?.focus();
    const resize = new ResizeObserver(place);
    resize.observe(menu);
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);
  useEffect(() => {
    if (open) {
      const options = popup.current?.querySelectorAll('[role="option"]');
      options?.[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active]);

  return (
    <div
      className="product-select"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <select
        className="product-select-native"
        name="definitionId"
        value={selected?.id || ""}
        required
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => choose(e.target.value)}
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <option value="">Select product</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.provider.name} · {p.name} ({p.category})
          </option>
        ))}
      </select>
      <button
        ref={trigger}
        type="button"
        className="product-select-trigger"
        role="combobox"
        aria-label="Product option"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={selected ? "" : "product-select-placeholder"}>
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <small>
                {selected.provider.name} · {selected.category}
              </small>
            </>
          ) : (
            "Select product"
          )}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {invalid && (
        <small className="field-error" id={errorId}>
          Select a product from the list.
        </small>
      )}
      {open && (
        <div
          ref={popup}
          popover="manual"
          className="product-select-popup"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("a")) e.preventDefault();
          }}
        >
          <div className="product-select-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              aria-label="Search products"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                matches[active] ? `${listId}-${active}` : undefined
              }
              placeholder="Search product, provider or category…"
              value={search}
              autoComplete="off"
              onChange={(e) => {
                setSearch(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) =>
                    matches.length
                      ? (i +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          matches.length) %
                        matches.length
                      : 0,
                  );
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches[active]) choose(matches[active].id);
                }
              }}
            />
          </div>
          <div
            className="product-select-options"
            role="listbox"
            aria-label="Product plans"
            id={listId}
          >
            {loading ? (
              <p role="status">Loading products…</p>
            ) : error ? (
              <div role="alert">
                <p>Unable to load products.</p>
                <button type="button" onClick={onRetry}>
                  Retry
                </button>
              </div>
            ) : matches.length ? (
              matches.map((p, i) => (
                <div
                  key={p.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selectedId === p.id}
                  className={`product-select-option ${active === i ? "highlighted" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p.id)}
                >
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.provider.name} · {p.category}
                    </small>
                  </span>
                  {selectedId === p.id && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </div>
              ))
            ) : (
              <p role="status">
                {search
                  ? "No matching products. Try another search."
                  : "No product plans available. Add a plan in Products first."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
