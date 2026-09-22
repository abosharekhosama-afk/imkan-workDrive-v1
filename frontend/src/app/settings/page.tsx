"use client";
import { useEffect, useState } from "react";
import { useLocale } from "../../components/locale-provider";
import { me } from "../../lib/api/auth";
import {
  changePassword,
  listSessions,
  logoutAllSessions,
  revokeSession,
  updateProfile,
  type SessionRecord,
  listSecurityEvents,
  type SecurityEventRecord,
} from "../../lib/api/settings";
import { getToken } from "../../lib/api/jwt";

export default function SettingsPage() {
  const { label } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    const token = getToken();
    if (!token) return;
    const [u, s, ev] = await Promise.all([me(token), listSessions(), listSecurityEvents()]);
    setName(u.name ?? "");
    setEmail(u.email);
    setRole(u.role);
    setSessions(s);
    setSecurityEvents(ev);
  }

  useEffect(() => {
    void load().catch(() => setError(label("settings.error")));
  }, [label]);

  async function save() {
    try {
      setError("");
      setMessage("");
      const u = await updateProfile(name);
      setName(u.name ?? "");
      setMessage(label("settings.saved"));
    } catch {
      setError(label("settings.error"));
    }
  }

  async function password() {
    try {
      setError("");
      setMessage("");
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage(label("settings.passwordChanged"));
      await load();
    } catch {
      setError(label("settings.error"));
    }
  }

  async function revoke(id: string) {
    try {
      await revokeSession(id);
      await load();
    } catch {
      setError(label("settings.error"));
    }
  }

  async function all() {
    try {
      await logoutAllSessions();
      window.location.href = "/auth/login";
    } catch {
      setError(label("settings.error"));
    }
  }

  return (
    <section className="imkan-page imkan-settings-page">
      <header className="imkan-page-header">
        <div>
          <p className="imkan-meta">IMKAN WorkDrive</p>
          <h1 className="imkan-title">{label("settings.title")}</h1>
        </div>
      </header>
      {message && <div className="imkan-alert">{message}</div>}
      {error && <div className="imkan-alert imkan-alert-danger">{error}</div>}
      <div className="imkan-settings-grid">
        <section className="imkan-panel imkan-settings-card">
          <h2 className="imkan-panel-title">{label("settings.account")}</h2>
          <div className="imkan-field">
            <label className="imkan-label">{label("settings.name")}</label>
            <input className="imkan-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="imkan-field">
            <label className="imkan-label">{label("settings.email")}</label>
            <input className="imkan-input" value={email} disabled />
          </div>
          <div className="imkan-field">
            <label className="imkan-label">{label("settings.role")}</label>
            <input className="imkan-input" value={role} disabled />
          </div>
          <div className="imkan-field-actions">
            <button className="imkan-button" onClick={save}>
              {label("settings.save")}
            </button>
          </div>
        </section>

        <section className="imkan-panel imkan-settings-card">
          <h2 className="imkan-panel-title">{label("settings.password")}</h2>
          <div className="imkan-field">
            <label className="imkan-label">{label("settings.currentPassword")}</label>
            <input
              type="password"
              className="imkan-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="imkan-field">
            <label className="imkan-label">{label("settings.newPassword")}</label>
            <input
              type="password"
              className="imkan-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="imkan-field-actions">
            <button className="imkan-button" onClick={password}>
              {label("settings.changePassword")}
            </button>
          </div>
        </section>

        <section className="imkan-panel imkan-settings-card">
          <h2 className="imkan-panel-title">{label("settings.sessions")}</h2>
          {sessions.length === 0 ? (
            <p className="imkan-muted">{label("settings.noSessions")}</p>
          ) : (
            <div className="overflow-x-auto w-full max-w-full"><table className="imkan-table">
              <thead>
                <tr className="imkan-table-row">
                  <th className="px-3 py-2 text-start font-medium">{label("settings.sessionId")}</th>
                  <th className="px-3 py-2 text-start font-medium">{label("settings.lastSeen")}</th>
                  <th className="px-3 py-2 text-start font-medium">{label("settings.device")}</th>
                  <th className="px-3 py-2 text-start font-medium">IP</th>
                  <th className="px-3 py-2 text-start font-medium">{label("settings.expires")}</th>
                  <th className="px-3 py-2 text-end font-medium">{label("files.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="imkan-table-row">
                    <td className="px-3 py-2">{session.id.slice(0, 12)}… {session.isCurrent ? <span className="imkan-chip">Current</span> : null}</td>
                    <td className="px-3 py-2">
                      {session.lastSeenAt
                        ? new Date(session.lastSeenAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={session.userAgent || ""}>{session.userAgent || "Web"}</td>
                    <td className="px-3 py-2">{session.ipAddress || "—"}</td>
                    <td className="px-3 py-2">
                      {session.expiresAt
                        ? new Date(session.expiresAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        className="imkan-button-secondary"
                        onClick={() => revoke(session.id)}
                      >
                        {label("settings.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="imkan-field-actions">
            <button className="imkan-button-destructive" onClick={all}>
              {label("settings.logoutAll")}
            </button>
          </div>
        </section>

        <section className="imkan-panel imkan-settings-card">
          <h2 className="imkan-panel-title">Security activity</h2>
          {securityEvents.length === 0 ? <p className="imkan-muted">No security events.</p> : <div className="overflow-x-auto w-full max-w-full"><table className="imkan-table"><thead><tr><th>Event</th><th>Severity</th><th>IP</th><th>Time</th></tr></thead><tbody>{securityEvents.map((event) => <tr key={event.id} className="imkan-table-row"><td>{event.eventType}</td><td>{event.severity}</td><td>{event.ipAddress || "—"}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </section>
  );
}
