import { useEffect, useRef, useState } from "react";
import { SearchInput } from "./components";
// Search box that keeps what is typed locally and hands it to `onCommit` once typing
// pauses, so the address bar and API are not hit on every keystroke. `value` is the
// committed value (usually a URL param); outside changes to it replace the typed text.
export default function DebouncedSearch({
  value,
  onCommit,
  placeholder,
  delay = 300,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  delay?: number;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const known = useRef(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    // Our own commit lands here equal to `known`; anything else came from outside
    // (Back, a link, clearing filters), so drop the pending text and follow it.
    if (value !== known.current) {
      window.clearTimeout(timer.current);
      setText(value);
    }
    known.current = value;
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <SearchInput
      value={text}
      placeholder={placeholder}
      onChange={(v) => {
        setText(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          if (v === known.current) return;
          known.current = v;
          commit.current(v);
        }, delay);
      }}
    />
  );
}
