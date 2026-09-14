import React from "react";
import { Clock, CheckCircle2, XCircle, FlagTriangleRight } from "lucide-react";
import { C } from "../theme.js";

export function StatusBadge({ status }) {
  const map = {
    pending: { label: "Chờ đánh giá", bg: C.amberSoft, fg: "#8A6413", icon: Clock },
    very_similar: { label: "Rất tương tự", bg: C.tealSoft, fg: "#0B6C62", icon: CheckCircle2 },
    similar: { label: "Tương tự", bg: "#E8F2FA", fg: "#24618A", icon: CheckCircle2 },
    uncertain: { label: "Chưa rõ", bg: C.amberSoft, fg: "#8A6413", icon: FlagTriangleRight },
    dissimilar: { label: "Khác biệt", bg: "#F9EEE7", fg: "#9A5A1A", icon: XCircle },
    very_dissimilar: { label: "Rất khác biệt", bg: C.redSoft, fg: "#8F332B", icon: XCircle },
  };
  const s = map[status] || map.pending;
  const Icon = s.icon;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600,
        padding: "3px 8px", borderRadius: 20, fontFamily: "'Inter', sans-serif",
        letterSpacing: 0.2,
      }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {s.label}
    </span>
  );
}

export function ActionButton({ label, icon: Icon, color, onClick, active, filled, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 7,
        fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        border: `1.5px solid ${color}`,
        background: active || filled ? color : "transparent",
        color: active || filled ? "#fff" : color,
        transition: "all 0.12s ease",
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

export function Card({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: "white", borderRadius: 8, padding: "11px 12px", fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

export function Empty({ label }) {
  return (
    <div style={{ minHeight: 120, display: "grid", placeItems: "center", color: C.inkFaint, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8, marginTop: 18 }}>
      {label}
    </div>
  );
}

export function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Inter, sans-serif", color: C.inkMuted, padding: 18, background: C.bg }}>
      {children}
    </div>
  );
}

export const thStyle = { textAlign: "left", padding: "9px 14px", fontSize: 11, fontWeight: 700, color: "#5B6570", textTransform: "uppercase", letterSpacing: 0.4 };
export const tdStyle = { padding: "9px 14px" };
export const labelStyle = { display: "block", fontSize: 11, color: C.inkMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
export const selectStyle = { display: "block", marginTop: 5, width: "100%", padding: "8px 9px", border: `1px solid ${C.border}`, borderRadius: 6, background: "white", color: C.ink };
export const evidenceChipStyle = { display: "inline-block", padding: "2px 6px", borderRadius: 999, background: "#DFF3EF", color: "#146B60", fontSize: 10, fontWeight: 700 };
