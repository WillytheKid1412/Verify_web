import React, { useState, useEffect, useMemo } from "react";
import {
  Search, ChevronRight, FileText, ScanLine, FlaskConical,
  CheckCircle2, XCircle, FlagTriangleRight, AlertTriangle,
  CircleDot, ShieldCheck,
} from "lucide-react";

import { C, FONTS } from "./theme.js";
import { StatusBadge, UrgencyDot, InfoCard, ActionButton, thStyle, tdStyle } from "./components/ui.jsx";
import ScanViewport from "./components/ScanViewport.jsx";
import { fetchPatientList, fetchPatientDetail, submitVerification } from "./api.js";

export default function App() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [tab, setTab] = useState("ehr");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // tải danh sách bệnh nhân khi mở app
  useEffect(() => {
    fetchPatientList()
      .then((data) => {
        setList(data);
        if (data.length) setSelectedId(data[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingList(false));
  }, []);

  // tải chi tiết mỗi khi đổi bệnh nhân
  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    fetchPatientDetail(selectedId)
      .then((data) => {
        setPatient(data);
        setNote(data.verification?.note || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const filtered = useMemo(
    () => list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase())),
    [list, query]
  );

  const reviewedCount = list.filter((p) => p.status && p.status !== "pending").length;
  const currentStatus = patient?.verification?.status || "pending";

  const decide = async (status) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const saved = await submitVerification(selectedId, { status, note });
      setPatient((prev) => (prev ? { ...prev, verification: saved } : prev));
      setList((prev) => prev.map((p) => (p.id === selectedId ? { ...p, status: saved.status } : p)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "ehr", label: "Hồ sơ bệnh án", icon: FileText },
    { id: "imaging", label: "Hình ảnh", icon: ScanLine },
    { id: "labs", label: "Xét nghiệm", icon: FlaskConical },
  ];

  if (loadingList) {
    return <Centered>Đang tải danh sách bệnh nhân…</Centered>;
  }
  if (error && !list.length) {
    return <Centered error>Lỗi: {error}. Kiểm tra backend đã chạy ở cổng 4000 chưa.</Centered>;
  }

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif", background: C.bg, color: C.ink,
      minHeight: "100vh", display: "flex", overflow: "hidden",
    }}>
      <style>{FONTS}</style>

      {/* ---------------- SIDEBAR / QUEUE ---------------- */}
      <div style={{ width: 300, flexShrink: 0, background: C.navy, color: C.navyText, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ShieldCheck size={17} color="#8FE0D4" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.2 }}>Hàng chờ xác minh</span>
          </div>
          <div style={{ fontSize: 11, color: "#7E93A0", fontFamily: "'IBM Plex Mono', monospace" }}>
            {reviewedCount} / {list.length} đã xử lý
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 3 }}>
            {list.map((p) => {
              const color = p.status === "approved" ? C.teal : p.status === "rejected" ? C.red : p.status === "flagged" ? "#8F6AD9" : "#33475A";
              return <div key={p.id} style={{ height: 4, flex: 1, borderRadius: 2, background: color }} />;
            })}
          </div>
        </div>

        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} color="#7E93A0" style={{ position: "absolute", left: 10, top: 9 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã BN"
              style={{
                width: "100%", boxSizing: "border-box", background: "#0F1A22", border: "1px solid #2A3D4C",
                borderRadius: 7, padding: "8px 10px 8px 30px", color: "#E4ECEF", fontSize: 12.5, outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px 12px" }}>
          {filtered.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                  background: active ? C.navySoft : "transparent", border: "none", borderRadius: 8,
                  padding: "9px 10px", marginBottom: 2, cursor: "pointer",
                  borderLeft: active ? "3px solid #8FE0D4" : "3px solid transparent",
                }}
              >
                <UrgencyDot urgency={p.urgency} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#7E93A0", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {p.id} · {p.age}{p.gender === "Nữ" ? "F" : "M"}
                  </div>
                </div>
                {p.status !== "pending" && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: p.status === "approved" ? C.teal : p.status === "rejected" ? C.red : "#8F6AD9",
                  }} />
                )}
                <ChevronRight size={13} color="#4E6373" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- DETAIL PANEL ---------------- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, minWidth: 0 }}>
        {loadingDetail || !patient ? (
          <Centered>Đang tải hồ sơ…</Centered>
        ) : (
          <>
            <div style={{ padding: "20px 28px 0", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600, fontSize: 24, margin: 0 }}>
                      {patient.name}
                    </h1>
                    <StatusBadge status={currentStatus} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {patient.id} · {patient.age} tuổi · {patient.gender} · Nhập viện {patient.admitted}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, marginTop: 8, maxWidth: 520 }}>
                    <strong style={{ fontWeight: 600 }}>Lý do vào viện: </strong>{patient.complaint}
                  </div>
                  {patient.allergies.length > 0 && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, background: C.redSoft, color: "#8F332B", fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20 }}>
                      <AlertTriangle size={12} /> Dị ứng: {patient.allergies.join(", ")}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10.5, color: C.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Điểm ưu tiên</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, fontSize: 26, color: patient.urgency > 70 ? C.red : patient.urgency > 45 ? "#B5811F" : C.teal }}>
                    {patient.urgency}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, marginTop: 18 }}>
                {tabs.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 13, fontWeight: 600, color: active ? C.ink : C.inkFaint,
                        borderBottom: active ? `2px solid ${C.teal}` : "2px solid transparent",
                      }}
                    >
                      <Icon size={14} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
              {tab === "ehr" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 780 }}>
                  <InfoCard title="Chẩn đoán">
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{patient.dx}</p>
                  </InfoCard>
                  <InfoCard title="Tiền sử bệnh">
                    <p style={{ margin: 0, fontSize: 13.5, color: C.inkMuted }}>{patient.history}</p>
                  </InfoCard>
                  <InfoCard title="Đơn thuốc hiện tại">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: C.inkMuted }}>
                      {patient.medications.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </InfoCard>
                  <InfoCard title="Dị ứng">
                    <p style={{ margin: 0, fontSize: 13.5, color: C.inkMuted }}>
                      {patient.allergies.length ? patient.allergies.join(", ") : "Không ghi nhận"}
                    </p>
                  </InfoCard>
                </div>
              )}

              {tab === "imaging" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, maxWidth: 780 }}>
                  {patient.imaging.map((study) => (
                    <div key={study.id}>
                      <ScanViewport study={study} patient={patient} />
                      <div style={{ marginTop: 8, fontSize: 12.5, color: C.inkMuted }}>{study.note}</div>
                    </div>
                  ))}
                  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: C.inkFaint, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <CircleDot size={11} /> Ảnh minh họa cho bản thử nghiệm — chưa kết nối kho lưu trữ DICOM thật.
                  </div>
                </div>
              )}

              {tab === "labs" && (
                <div style={{ maxWidth: 560, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#FAFBFA", borderBottom: `1px solid ${C.border}` }}>
                        <th style={thStyle}>Chỉ số</th>
                        <th style={thStyle}>Kết quả</th>
                        <th style={thStyle}>Khoảng tham chiếu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patient.labs.map((l) => (
                        <tr key={l.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={tdStyle}>{l.name}</td>
                          <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: l.flagged ? C.red : C.ink }}>
                            {l.value} {l.unit} {l.flagged && "•"}
                          </td>
                          <td style={{ ...tdStyle, color: C.inkFaint, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{l.range}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: "14px 28px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)…"
                style={{
                  flex: 1, minWidth: 200, border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "'Inter', sans-serif",
                }}
              />
              <ActionButton label="Từ chối" icon={XCircle} color={C.red} onClick={() => decide("rejected")} active={currentStatus === "rejected"} disabled={saving} />
              <ActionButton label="Cần xem lại" icon={FlagTriangleRight} color="#7A57C9" onClick={() => decide("flagged")} active={currentStatus === "flagged"} disabled={saving} />
              <ActionButton label="Xác nhận" icon={CheckCircle2} color={C.teal} onClick={() => decide("approved")} active={currentStatus === "approved"} filled disabled={saving} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Centered({ children, error }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", minHeight: "100vh", fontFamily: "'Inter', sans-serif",
      color: error ? "#8F332B" : "#5B6570", fontSize: 14,
    }}>
      {children}
    </div>
  );
}
