import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

export type Theme = "light" | "dark" | "system";

export interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const systemOnly = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ].includes(pathname);
  const [authTheme, setAuthTheme] = useState<Theme>("system");
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    } catch {
      /* ignore local storage error */
    }
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    const preference = systemOnly ? authTheme : theme;
    if (preference !== "system") return preference;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const activeTheme = systemOnly ? authTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const update = () => {
      const active: "light" | "dark" =
        activeTheme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : activeTheme;
      setResolvedTheme(active);
      if (active === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      }
    };

    update();

    const listener = () => {
      if (activeTheme === "system") {
        update();
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    } else if ((media as any).addListener) {
      (media as any).addListener(listener);
      return () => (media as any).removeListener(listener);
    }
  }, [activeTheme]);

  const setTheme = (newTheme: Theme) => {
    if (systemOnly) {
      setAuthTheme(newTheme);
    } else {
      setThemeState(newTheme);
      try {
        localStorage.setItem("theme", newTheme);
      } catch {
        /* ignore */
      }
    }
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const active =
      newTheme === "system" ? (media.matches ? "dark" : "light") : newTheme;
    setResolvedTheme(active);
    if (active === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider
      value={{ theme: activeTheme, resolvedTheme, setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle({
  className = "",
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={
        resolvedTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      title={
        resolvedTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 17v-1a5 5 0 1 1 6 0v1M9 20h6M10 23h4" />
        {resolvedTheme === "light" && (
          <path d="M12 1v2M3 11H1M23 11h-2M4.2 3.2l1.4 1.4M19.8 3.2l-1.4 1.4M4.2 18.8l1.4-1.4M19.8 18.8l-1.4-1.4" />
        )}
      </svg>
    </button>
  );
}
