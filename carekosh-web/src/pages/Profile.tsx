import { useState } from "react";
import {
  Save,
  Download,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Mail,
  KeyRound,
} from "lucide-react";
import { useApp } from "../context";
import { initials, shortDate } from "../domain";
import { DEMO, request } from "../services/api";
import { backupPayload, downloadJson } from "../services/export";
import { PageTitle, Field, ErrorBox, Dialog, Spinner } from "../components/ui";
export default function Profile() {
  const a = useApp(),
    [name, setName] = useState(a.user?.name || ""),
    [username, setUsername] = useState(a.user?.username || ""),
    [error, setError] = useState(""),
    [password, setPassword] = useState(false),
    [old, setOld] = useState(""),
    [next, setNext] = useState(""),
    [sending, setSending] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const u = await a.act(
        (r) =>
          r.updateProfile({
            name: name.trim(),
            username: username.trim() || undefined,
          }),
        "Profile updated.",
      );
      a.setUser(u);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      if (DEMO)
        throw new Error(
          "Password changes are available only in a connected account.",
        );
      await request("/auth/change-password", "POST", {
        current_password: old,
        new_password: next,
      });
      setPassword(false);
      await a.signOut();
      a.notify("Password updated. Please sign in again.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR SPACE, YOUR WAY"
        title="Account & preferences"
        description="A few personal touches for a more comfortable care space."
      />
      {error && !password && <ErrorBox message={error} />}
      <div className="profile-layout">
        <div className="panel profile-summary">
          <span className="avatar profile-avatar">
            {initials(a.user?.name)}
          </span>
          <h2>{a.user?.name || "Caregiver"}</h2>
          <p>{a.user?.email}</p>
          <span className="badge blue">
            {DEMO ? "Demo account" : "Personal account"}
          </span>
          <div className="profile-detail">
            <Mail size={16} />
            <span>
              {a.user?.isEmailVerified || a.user?.is_verified
                ? "Email verified"
                : "Email verification available via your inbox"}
            </span>
          </div>
          <button
            className="button secondary full-width"
            onClick={async () => {
              if (
                await a.confirm({
                  title: "Sign out?",
                  body: "Unsaved drafts will be cleared from this browser session.",
                  label: "Sign out",
                })
              )
                await a.signOut();
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
        <div className="editor-main">
          <form className="panel form-section" onSubmit={save}>
            <div className="section-heading">
              <div>
                <h2>Your details</h2>
                <p>How you appear in your care space.</p>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Full name" required>
                <input
                  required
                  maxLength={255}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Username">
                <input
                  pattern="[a-z0-9_]+"
                  minLength={3}
                  maxLength={50}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </Field>
              <Field label="Email">
                <input type="email" disabled value={a.user?.email || ""} />
              </Field>
            </div>
            <div className="form-actions">
              <button
                className="button primary"
                disabled={a.busy || !name.trim()}
              >
                {a.busy ? <Spinner /> : <Save size={16} />}Save changes
              </button>
            </div>
          </form>
          <section className="panel form-section">
            <h2>Make yourself comfortable</h2>
            <div className="setting-row">
              <div>
                <strong>Appearance</strong>
                <p>
                  {a.theme === "dark"
                    ? "Calm charcoal with warm highlights."
                    : "A soft, bright space for your day."}
                </p>
              </div>
              <button className="button secondary" onClick={a.toggleTheme}>
                {a.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                Switch to {a.theme === "dark" ? "light" : "dark"}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Password</strong>
                <p>Keep your account access up to date.</p>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setError("");
                  setPassword(true);
                }}
              >
                <KeyRound size={16} />
                Change password
              </button>
            </div>
          </section>
          <section className="panel form-section">
            <h2>Your data</h2>
            <div className="setting-row">
              <div>
                <strong>Download a complete backup</strong>
                <p>
                  Categories, items, orders, and loaded activity. This file is a
                  backup; web restore is not available.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={!a.data}
                onClick={() =>
                  downloadJson(
                    backupPayload(a.data!),
                    "carekosh-full-backup.json",
                  )
                }
              >
                <Download size={16} />
                Backup
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Delete account</strong>
                <p>
                  Request an email to confirm deletion. This affects Android and
                  the web.
                </p>
              </div>
              <button
                className="button ghost-danger"
                onClick={async () => {
                  if (
                    !(await a.confirm({
                      title: "Request account deletion?",
                      body: "CareKosh will email you a confirmation link. Your account is not deleted until you confirm through that link.",
                      label: "Send deletion email",
                      danger: true,
                    }))
                  )
                    return;
                  try {
                    if (DEMO)
                      throw new Error(
                        "Account deletion is unavailable in the local demo.",
                      );
                    await request("/auth/me", "DELETE");
                    a.notify("Check your email to confirm account deletion.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Request deletion
              </button>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  if (DEMO)
                    throw new Error(
                      "No deletion is pending for this demo account.",
                    );
                  await request("/auth/cancel-delete", "POST");
                  a.notify("Pending deletion cancelled.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Cancel a pending deletion request
            </button>
          </section>
          <p className="small-note">
            <ShieldCheck size={14} />
            {DEMO
              ? "You’re exploring fictional sample data."
              : "Your account is shared with the Android app."}
          </p>
        </div>
      </div>
      {password && (
        <Dialog title="Change password" onClose={() => setPassword(false)}>
          <form onSubmit={changePassword}>
            {error && <ErrorBox message={error} />}
            <Field label="Current password" required>
              <input
                autoFocus
                required
                type="password"
                autoComplete="current-password"
                value={old}
                onChange={(e) => setOld(e.target.value)}
              />
            </Field>
            <Field
              label="New password"
              required
              hint="8+ characters with uppercase, lowercase, and a number."
            >
              <input
                required
                minLength={8}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <div className="dialog-actions">
              <button className="button primary" disabled={sending}>
                {sending ? <Spinner /> : <KeyRound size={16} />}Update password
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Activity() {
  const a = useApp();
  return (
    <>
      <PageTitle
        eyebrow="THE LITTLE UPDATES THAT ADD UP"
        title="Recent activity"
        description="A record of the latest changes in your care space."
      />
      <section className="panel activity-page">
        {a.error && <ErrorBox message={a.error} />}
        <div className="activity-list">
          {a.data?.activities.map((v) => (
            <div className="activity" key={v.id}>
              <span className="activity-dot blue">
                <ShieldCheck size={14} />
              </span>
              <div>
                <strong>{v.itemName}</strong>
                <p>{v.details}</p>
                <small>{shortDate(v.timestamp)}</small>
              </div>
              <span className="muted">{v.action.replaceAll("_", " ")}</span>
            </div>
          ))}
        </div>
        {!a.loading && !a.data?.activities.length && (
          <p className="muted">Your inventory updates will appear here.</p>
        )}
        <p className="small-note">
          Showing up to the 100 most recent inventory and order events.
        </p>
      </section>
    </>
  );
}
