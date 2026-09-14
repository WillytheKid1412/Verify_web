import React from "react";
import { ChevronRight, Download, Filter } from "lucide-react";
import { comparisonExportUrl } from "../api.js";
import { SCORE_LEVELS, TABS } from "../constants.js";
import { C } from "../theme.js";
import { ActionButton, StatusBadge } from "./ui.jsx";

export function ComparisonHeader({
  session,
  selectedSummary,
  selectedId,
  status,
  tab,
  setTab,
  setShowSimilarOnly,
  candidate,
  similarityFilterActive,
}) {
  const similarOnlyDisabled = !candidate || !["ehr", "labs"].includes(tab);
  return (
    <header style={{ padding: "16px 22px 0", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: C.inkMuted }}>
        Query <strong style={{ color: C.ink }}>{session.query.id}</strong><ChevronRight size={14} />
        Kết quả #{selectedSummary?.rank || "—"} <strong style={{ color: C.ink }}>{selectedId || "—"}</strong>
        {selectedSummary && <span style={{ color: C.teal, fontWeight: 700 }}>{(selectedSummary.similarity_score * 100).toFixed(2)}%</span>}
        <StatusBadge status={status} />
      </div>
      <nav style={{ marginTop: 14, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} style={tabStyle(tab === id)}>
            <Icon size={15} />{label}
          </button>
        ))}
        <button
          onClick={() => setShowSimilarOnly((value) => !value)}
          disabled={similarOnlyDisabled}
          style={similarOnlyButtonStyle(similarityFilterActive, similarOnlyDisabled)}
        >
          <Filter size={14} />{similarityFilterActive ? "Đang chỉ phần giống nhau" : "Chỉ phần giống nhau"}
        </button>
      </nav>
    </header>
  );
}

export function ComparisonFooter({ note, setNote, decide, saving, candidate, status, queryId, error }) {
  return (
    <>
      <footer style={{ padding: "12px 22px", display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi chú cho kết quả đối chiếu…"
          style={{ flex: "1 1 240px", minWidth: 170, padding: "9px 11px", borderRadius: 7, border: `1px solid ${C.border}` }}
        />
        {SCORE_LEVELS.map(([value, label, Icon, color]) => (
          <ActionButton key={value} label={label} icon={Icon} color={color} onClick={() => decide(value)} disabled={saving || !candidate} active={status === value} />
        ))}
        <a href={comparisonExportUrl("csv", queryId)} style={exportLinkStyle}><Download size={14} />CSV</a>
        <a href={comparisonExportUrl("json", queryId)} style={exportLinkStyle}><Download size={14} />JSON</a>
      </footer>
      {error && <div style={{ color: C.red, padding: "0 22px 10px", background: C.surface, fontSize: 12 }}>{error}</div>}
    </>
  );
}

const tabStyle = (selected) => ({
  border: 0,
  borderBottom: selected ? `2px solid ${C.teal}` : "2px solid transparent",
  padding: "10px 14px",
  background: "none",
  cursor: "pointer",
  color: selected ? C.ink : C.inkFaint,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 6,
});
const similarOnlyButtonStyle = (active, disabled) => ({
  marginLeft: "auto",
  border: `1px solid ${active ? C.teal : C.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  background: active ? C.tealSoft : "white",
  color: active ? "#0B6C62" : C.inkMuted,
  fontSize: 12,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
});
const exportLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "9px 10px",
  borderRadius: 7,
  border: `1px solid ${C.border}`,
  color: C.inkMuted,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
  background: "white",
};
