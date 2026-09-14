import React from "react";
import { ChevronRight, LogOut, Search, ShieldCheck, Users } from "lucide-react";
import { C } from "../theme.js";
import { reviewColor } from "../constants.js";

export default function QuerySidebar({
  queries,
  queryPatientId,
  loadSession,
  loadingSession,
  reviewed,
  candidateCount,
  candidateSearch,
  setCandidateSearch,
  filtered,
  selectedId,
  setSelectedId,
  user,
  onLogout,
  onManageAccounts,
}) {
  return (
    <aside style={{ width: 300, flexShrink: 0, background: C.navy, color: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 16px 10px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, fontSize: 14 }}>
          <ShieldCheck size={17} color="#8FE0D4" />Đối chiếu bệnh nhân
        </div>
        <div style={{ color: "#8da0ac", fontSize: 11, marginTop: 7 }}>
          {queries.length.toLocaleString("vi-VN")} query · {reviewed}/{candidateCount} kết quả đã xử lý
        </div>
        <div style={accountSummaryStyle}>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{user.username}</strong>
            {user.role === "admin" ? "Quản trị viên" : "Người đánh giá"}
          </span>
          <button onClick={onLogout} type="button" title="Đăng xuất" style={darkIconButtonStyle}><LogOut size={15} /></button>
        </div>
        {user.role === "admin" && (
          <button onClick={onManageAccounts} type="button" style={manageAccountsButtonStyle}>
            <Users size={14} />Quản lý tài khoản
          </button>
        )}
      </div>
      <div style={{ padding: "0 14px 12px" }}>
        <label style={{ fontSize: 10, color: "#8da0ac", fontWeight: 700, textTransform: "uppercase" }}>
          Bệnh nhân query
          <select
            value={queryPatientId}
            onChange={(event) => loadSession(event.target.value)}
            disabled={loadingSession || !queries.length}
            style={querySelectStyle}
          >
            {queries.map((item) => (
              <option key={item.patient_id} value={item.patient_id}>
                {item.patient_id} · {item.split || "—"} · Top {item.candidate_count}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 5, color: "#8da0ac", fontSize: 10 }}>Chọn query để đổi sang Top-20 tương ứng.</div>
      </div>
      <div style={searchBox}>
        <Search size={14} color="#8da0ac" />
        <input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Lọc trong Top-20" style={searchInput} />
      </div>
      <div style={{ padding: "4px 8px", overflowY: "auto", flex: 1 }}>
        {filtered.map((item) => (
          <button key={item.patient_id} onClick={() => setSelectedId(item.patient_id)} style={sidebarItemStyle(selectedId === item.patient_id)}>
            <span style={{ color: "#8FE0D4", fontFamily: "monospace", fontSize: 12, width: 28 }}>#{item.rank}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{item.patient_id}</span>
              <span style={{ fontSize: 11, color: "#9aabb5" }}>{(item.similarity_score * 100).toFixed(2)}% tương tự</span>
              {!!item.shared_primary_icd_groups?.length && <span style={sidebarIcdStyle}>ICD {item.shared_primary_icd_groups.join(", ")}</span>}
            </span>
            {item.verification?.status && item.verification.status !== "pending" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: reviewColor(item.verification.status) }} />}
            <ChevronRight size={14} color="#81939e" />
          </button>
        ))}
      </div>
    </aside>
  );
}

const searchBox = { margin: "0 14px 10px", padding: "8px 10px", background: "#0f1a22", border: "1px solid #2a3d4c", borderRadius: 7, display: "flex", gap: 7 };
const searchInput = { border: 0, outline: 0, width: "100%", minWidth: 0, background: "transparent", color: "white" };
const querySelectStyle = { display: "block", marginTop: 5, width: "100%", padding: "8px 9px", border: "1px solid #2a3d4c", borderRadius: 7, background: "#0f1a22", color: "white", outline: 0 };
const sidebarIcdStyle = { display: "block", width: "fit-content", marginTop: 3, padding: "1px 5px", borderRadius: 4, background: "#193441", color: "#8FE0D4", fontSize: 9 };
const accountSummaryStyle = { marginTop: 14, paddingTop: 12, borderTop: "1px solid #2a3d4c", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#8da0ac", fontSize: 10 };
const darkIconButtonStyle = { border: "1px solid #2a3d4c", borderRadius: 6, padding: 7, display: "grid", placeItems: "center", background: "#0f1a22", color: "white", cursor: "pointer" };
const manageAccountsButtonStyle = { marginTop: 8, width: "100%", border: "1px solid #2a3d4c", borderRadius: 6, padding: "8px 9px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#193441", color: "#8FE0D4", cursor: "pointer", fontSize: 11, fontWeight: 700 };
const sidebarItemStyle = (selected) => ({
  display: "flex",
  alignItems: "center",
  textAlign: "left",
  width: "100%",
  border: 0,
  borderLeft: selected ? "3px solid #8FE0D4" : "3px solid transparent",
  borderRadius: 7,
  marginBottom: 3,
  padding: "9px 8px",
  background: selected ? C.navySoft : "transparent",
  color: "white",
  cursor: "pointer",
});
