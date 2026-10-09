import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { FormError } from "./components";
import { ThemeToggle } from "./theme";
export default function Auth({
  mode = "login",
}: {
  mode?: "login" | "forgot" | "reset" | "signup";
}) {
  const navigate = useNavigate(),
    qc = useQueryClient(),
    [params] = useSearchParams(),
    [error, setError] = useState<Error>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api(
        "/auth/" +
          (mode === "login"
            ? "login"
            : mode === "forgot"
              ? "forgot-password"
              : "reset-password"),
        {
          method: "POST",
          body: JSON.stringify({
            ...f,
            ...(mode === "reset" ? { token: params.get("token") } : {}),
          }),
        },
      );
      if (mode === "login") {
        await qc.invalidateQueries();
        navigate("/dashboard");
      } else
        setMessage(
          mode === "forgot"
            ? result.data.message
            : "Password updated. You can sign in now.",
        );
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const copy = {
    signup: {
      eyebrow: "JOIN YOUR TEAM",
      title: "Your next chapter starts here.",
      description: "Get access to your team’s Parvath FinServ workspace.",
      action: "Back to sign in",
      pending: "",
    },
    login: {
      eyebrow: "YOUR WORKSPACE",
      title: "Log in",
      description: "Sign in to keep your client relationships moving forward.",
      action: "Log in",
      pending: "Signing in…",
    },
    forgot: {
      eyebrow: "ACCOUNT RECOVERY",
      title: "Let’s get you back in.",
      description:
        "Enter your work email and we’ll send you a password reset link.",
      action: "Send reset link",
      pending: "Sending link…",
    },
    reset: {
      eyebrow: "A FRESH START",
      title: "Set a new password.",
      description: "Choose a strong password with at least 12 characters.",
      action: "Update password",
      pending: "Updating password…",
    },
  }[mode];
  return (
    <main className="auth-page auth-redesign">
      <div className="auth-frame">
        <section className="auth-story" aria-label="Parvath FinServ">
          <img
            className="auth-hero-art"
            src="/assets/financial-growth.png"
            alt="An olive tree and golden coins on ascending green pillars, symbolizing financial growth"
          />
          <Link className="auth-logo" to="/login">
            <img src="/assets/leaf-logo.png" alt="" />
            <span>
              <strong>Parvath FinServ</strong>
              <small>Your Financial Partner</small>
            </span>
          </Link>
        </section>
        <section className="auth-form-panel">
          <div className="auth-card">
            {mode !== "login" && (
              <span className="auth-eyebrow">{copy.eyebrow}</span>
            )}
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
            {mode === "signup" ? (
              <div className="auth-signup-info">
                <span className="auth-signup-badge">
                  <ShieldCheck size={16} /> Administrator-managed access
                </span>
                <h2>Let’s get you connected.</h2>
                <p>
                  Ask your workspace administrator to create your account using
                  your work email. Once you receive your sign-in details, you’re
                  ready to get started.
                </p>
                <Link className="primary auth-signup-link" to="/login">
                  Go to sign in <ArrowRight size={18} />
                </Link>
              </div>
            ) : message ? (
              <div role="status" className="success-note">
                {message}
                <Link to="/login">
                  Back to sign in <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <form onSubmit={submit}>
                {mode !== "reset" && (
                  <label htmlFor="auth-email">
                    Work email
                    <div className="auth-input-wrap">
                      <Mail size={18} aria-hidden="true" />
                      <input
                        id="auth-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        placeholder="you@company.com"
                      />
                    </div>
                  </label>
                )}
                {mode !== "forgot" && (
                  <label htmlFor="auth-password">
                    <span className="auth-label-row">
                      <span>
                        {mode === "reset" ? "New password" : "Password"}
                      </span>
                    </span>
                    <div className="auth-input-wrap">
                      <LockKeyhole size={18} aria-hidden="true" />
                      <input
                        id="auth-password"
                        aria-label={
                          mode === "reset" ? "New password" : "Password"
                        }
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        minLength={mode === "reset" ? 12 : 1}
                        maxLength={mode === "reset" ? 128 : 200}
                        required
                        placeholder={
                          mode === "reset"
                            ? "At least 12 characters"
                            : "Enter your password"
                        }
                      />
                      <button
                        className="auth-password-toggle"
                        type="button"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </label>
                )}
                <FormError error={error} />
                <button
                  className="primary auth-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? copy.pending : copy.action}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {mode !== "login" && mode !== "signup" && !message && (
              <Link className="auth-back text-link" to="/login">
                Back to sign in
              </Link>
            )}
          </div>
        </section>
      </div>
      <div className="auth-theme-bottom">
        <ThemeToggle size={22} />
      </div>
    </main>
  );
}
