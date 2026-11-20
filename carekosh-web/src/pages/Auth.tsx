import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { useApp } from "../context";
import { DEMO, request, register } from "../services/api";
import { Field, ErrorBox, Spinner } from "../components/ui";
import { BRAND } from "../brand";
export default function Auth() {
  const a = useApp(),
    { pathname } = useLocation(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const mode = pathname.slice(1) || "login";
  const feedback = useRef<HTMLDivElement>(null);
  const [identifier, setIdentifier] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    setError("");
    setSuccess("");
    setPassword("");
    setShow(false);
    window.scrollTo(0, 0);
  }, [mode]);
  useEffect(() => {
    if (!(error || a.authError || success)) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "center" });
  }, [error, a.authError, success]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "login") {
        await a.signIn(identifier, password);
        navigate("/");
      } else if (DEMO) {
        setSuccess(
          "This is a local preview. Email and account changes are available when connected to the CareKosh API.",
        );
      } else if (mode === "register") {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          username: username.trim() || undefined,
          password,
        });
        setSuccess(
          result.verificationRequired
            ? "Account created. Check your email for a verification link, then sign in."
            : "Account created. You can sign in now.",
        );
        setPassword("");
      } else if (mode === "forgot-password") {
        await request("/auth/forgot-password", "POST", { email });
        setSuccess(
          "If this email has an account, a password reset link is on its way.",
        );
      } else if (mode === "reset-password") {
        if (!params.get("token"))
          throw new Error(
            "The reset token is missing. Request a new reset email.",
          );
        await request("/auth/reset-password", "POST", {
          token: params.get("token"),
          new_password: password,
        });
        setSuccess("Password updated. Sign in with your new password.");
        setPassword("");
        navigate("/reset-password", { replace: true });
      } else if (mode === "verify-email") {
        if (!params.get("token"))
          throw new Error("Open the full verification link from your email.");
        await request(
          `/auth/verify-email/${encodeURIComponent(params.get("token")!)}`,
        );
        setSuccess("Your email is verified. You can sign in now.");
        navigate("/verify-email", { replace: true });
      } else if (mode === "resend-verification") {
        await request("/auth/resend-verification", "POST", { email });
        setSuccess(
          "If verification is needed for this account, a new link is on its way.",
        );
      }
    } catch (e) {
      setError(
        (e as Error).message === "EMAIL_NOT_VERIFIED"
          ? "Please verify your email before signing in. Use the resend verification link below."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  const titles: Record<string, [string, string?]> = {
    login: ["Welcome back."],
    register: [
      "A calmer way to care.",
      "Create your account to start organizing your home ICU.",
    ],
    "forgot-password": [
      "Let’s get you back in.",
      "Enter your account email and we’ll send a reset link.",
    ],
    "reset-password": [
      "Choose a new password.",
      "Use a strong password you haven’t used before.",
    ],
    "verify-email": [
      "Verify your email.",
      "Confirm your email to access your CareKosh account.",
    ],
    "resend-verification": [
      "A fresh verification link.",
      "Enter the email you used to create your account.",
    ],
  };
  const [title, subtitle] = titles[mode] || titles.login;
  // A signed-in visitor (e.g. from the landing page's Sign In link) goes to the
  // workspace instead of a form that would replace the current session.
  if (a.authReady && a.user && (mode === "login" || mode === "register"))
    return <Navigate to="/" replace />;
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link to="/login" className="brand" aria-label={BRAND.fullName}>
          <span className="brand-mark">
            <img src="/brand/mark-dark.png" alt="" />
          </span>
          <span>
            <strong>
              CareKosh<span className="brand-dot">.</span>
            </strong>
            <small>{BRAND.descriptor}</small>
          </span>
        </Link>
        <div className="auth-story-content">
          <strong className="auth-story-title">More prepared.</strong>
          <div className="auth-visual" aria-hidden="true">
            <div className="auth-orbit" />
            <div className="auth-visual-main">
              <img src="/brand/mark-dark.png" alt="" />
            </div>
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <a className="auth-home" href={BRAND.siteOrigin}>
          <ArrowLeft size={16} />
          Back to CareKosh
        </a>
        <button
          className="icon-button auth-theme"
          aria-label="Toggle appearance"
          onClick={a.toggleTheme}
        >
          {a.theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="auth-form-wrap">
          <Link
            to="/login"
            className="brand auth-mobile-brand"
            aria-label={BRAND.fullName}
          >
            <span className="brand-mark">
              <img src={`/brand/mark-${a.theme}.png`} alt="" />
            </span>
            <span>
              <strong>
                CareKosh<span className="brand-dot">.</span>
              </strong>
              <small>{BRAND.descriptor}</small>
            </span>
          </Link>
          <div className="auth-heading">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {DEMO && (
            <div className="demo-auth-note">
              <span className="status-dot blue" />
              Demo changes stay in this browser.
            </div>
          )}
          {(error || a.authError) && (
            <div ref={feedback} tabIndex={-1} className="auth-feedback">
              <ErrorBox message={error || a.authError} />
            </div>
          )}{" "}
          {success ? (
            <div
              ref={feedback}
              tabIndex={-1}
              className="auth-success auth-feedback"
            >
              <Check size={26} />
              <p role="status">{success}</p>
              <Link className="button primary" to="/login">
                Back to sign in
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={send}>
              {mode === "register" && (
                <>
                  <Field label="Your name" required>
                    <input
                      required
                      maxLength={255}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="What should we call you?"
                    />
                  </Field>
                  <Field
                    label="Username"
                    hint="Optional · lowercase letters, numbers, and underscores"
                  >
                    <input
                      minLength={3}
                      maxLength={50}
                      pattern="[a-z0-9_]+"
                      autoComplete="username"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase())
                      }
                    />
                  </Field>
                </>
              )}
              {mode === "login" ? (
                <Field label="Email or username" required={!DEMO}>
                  <input
                    required={!DEMO}
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      DEMO ? "No credentials needed" : "you@example.com"
                    }
                  />
                </Field>
              ) : (
                !["reset-password", "verify-email"].includes(mode) && (
                  <Field label="Email address" required>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                )
              )}
              {["login", "register", "reset-password"].includes(mode) && (
                <Field
                  label={
                    mode === "reset-password" ? "New password" : "Password"
                  }
                  required={!DEMO}
                  hint={
                    mode !== "login"
                      ? "At least 8 characters, including uppercase, lowercase, and a number."
                      : undefined
                  }
                >
                  <span className="password-input">
                    <input
                      type={show ? "text" : "password"}
                      aria-label={
                        mode === "reset-password" ? "New password" : "Password"
                      }
                      required={!DEMO}
                      minLength={mode === "login" ? 1 : 8}
                      maxLength={128}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={show ? "Hide password" : "Show password"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </Field>
              )}
              {mode === "login" && (
                <div className="auth-options">
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>
              )}
              <button className="button primary auth-submit" disabled={busy}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    {mode === "login"
                      ? DEMO
                        ? "Explore demo workspace"
                        : "Sign in"
                      : mode === "register"
                        ? "Create account"
                        : mode === "reset-password"
                          ? "Update password"
                          : mode === "verify-email"
                            ? "Verify email"
                            : "Send email"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          )}
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <p>
                  New to CareKosh? <Link to="/register">Create an account</Link>
                </p>
                <Link className="muted" to="/resend-verification">
                  Resend verification email
                </Link>
              </>
            ) : (
              <p>
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            )}
          </div>
        </div>
        <div className="auth-footer">{BRAND.fullName}</div>
      </main>
    </div>
  );
}
