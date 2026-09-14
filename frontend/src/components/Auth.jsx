import React, { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { createAccount, fetchUsers, login } from "../api.js";
import { C, FONTS } from "../theme.js";

export function LoginPage({ onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      onAuthenticated(await login(username, password));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={loginPageStyle}>
      <style>{FONTS}</style>
      <form onSubmit={submit} style={loginCardStyle}>
        <div style={loginIconStyle}><ShieldCheck size={28} /></div>
        <h1 style={{ margin: "16px 0 6px", fontSize: 22 }}>Đăng nhập hệ thống xác minh</h1>
        <p style={{ margin: "0 0 22px", color: C.inkMuted, fontSize: 13 }}>
          Dữ liệu bệnh nhân chỉ hiển thị cho tài khoản đã được quản trị viên cấp.
        </p>
        <label style={labelStyle}>
          Tên đăng nhập
          <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Mật khẩu
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required style={inputStyle} />
        </label>
        {error && <div role="alert" style={{ color: C.red, fontSize: 12 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={primaryButtonStyle}>
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}

export function AccountManager({ onClose }) {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("reviewer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers().then(setUsers).catch((requestError) => setError(requestError.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createAccount({ username, password, role });
      setUsers((current) => [...current, created].sort((left, right) => left.username.localeCompare(right.username)));
      setUsername("");
      setPassword("");
      setRole("reviewer");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Quản lý tài khoản">
      <section style={modalStyle}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Quản lý tài khoản</h2>
            <p style={{ margin: "5px 0 0", color: C.inkMuted, fontSize: 12 }}>Chỉ quản trị viên có quyền tạo tài khoản.</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Đóng" style={closeButtonStyle}><X size={17} /></button>
        </header>

        <form onSubmit={submit} style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 150px auto", gap: 10, alignItems: "end" }}>
          <label style={labelStyle}>Tên đăng nhập<input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={50} style={inputStyle} /></label>
          <label style={labelStyle}>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} style={inputStyle} /></label>
          <label style={labelStyle}>Vai trò<select value={role} onChange={(event) => setRole(event.target.value)} style={inputStyle}><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select></label>
          <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 0 }}><UserPlus size={15} />{saving ? "Đang tạo…" : "Tạo"}</button>
        </form>
        {error && <div role="alert" style={{ marginTop: 10, color: C.red, fontSize: 12 }}>{error}</div>}

        <div style={{ marginTop: 20, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          {users.map((user) => (
            <div key={user.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px", padding: "10px 12px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
              <strong>{user.username}</strong>
              <span>{user.role === "admin" ? "Quản trị viên" : "Reviewer"}</span>
              <span style={{ color: user.active ? C.teal : C.red }}>{user.active ? "Hoạt động" : "Đã khóa"}</span>
            </div>
          ))}
          {!users.length && <div style={{ padding: 16, color: C.inkFaint, fontSize: 13 }}>Chưa có tài khoản.</div>}
        </div>
      </section>
    </div>
  );
}

const loginPageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg, #0b1720, #16313d)", color: C.ink, fontFamily: "'Inter', sans-serif" };
const loginCardStyle = { width: "min(420px, 100%)", boxSizing: "border-box", padding: 32, borderRadius: 14, background: "white", boxShadow: "0 20px 70px rgba(0,0,0,.28)", display: "grid", gap: 14 };
const loginIconStyle = { width: 52, height: 52, borderRadius: 12, display: "grid", placeItems: "center", background: C.tealSoft, color: C.teal };
const labelStyle = { display: "grid", gap: 6, color: C.inkMuted, fontSize: 12, fontWeight: 700 };
const inputStyle = { boxSizing: "border-box", width: "100%", minWidth: 0, padding: "10px 11px", border: `1px solid ${C.border}`, borderRadius: 7, background: "white", color: C.ink, outlineColor: C.teal };
const primaryButtonStyle = { marginTop: 4, padding: "11px 14px", border: 0, borderRadius: 7, background: C.teal, color: "white", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const backdropStyle = { position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center", padding: 24, background: "rgba(5, 15, 22, .7)" };
const modalStyle = { width: "min(850px, 100%)", maxHeight: "85vh", overflow: "auto", boxSizing: "border-box", padding: 24, borderRadius: 12, background: "white", boxShadow: "0 24px 80px rgba(0,0,0,.35)" };
const closeButtonStyle = { border: `1px solid ${C.border}`, borderRadius: 7, padding: 7, background: "white", color: C.inkMuted, display: "grid", placeItems: "center", cursor: "pointer" };
