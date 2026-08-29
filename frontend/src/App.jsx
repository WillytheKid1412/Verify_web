import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Download, FileText, FlaskConical, FlagTriangleRight, Image, ScanLine, Search, ShieldCheck, XCircle } from "lucide-react";
import { comparisonExportUrl, fetchComparison, fetchComparisonCandidate, submitComparisonVerification } from "./api.js";
import { C, FONTS } from "./theme.js";
import { ActionButton, StatusBadge, tdStyle, thStyle } from "./components/ui.jsx";
import ScanViewport from "./components/ScanViewport.jsx";

const tabs = [["ehr", "EHR", FileText], ["labs", "Lab result", FlaskConical], ["XQ", "XQ", Image], ["CT", "CT", ScanLine], ["MRI", "MRI", ScanLine]];

export default function App() {
  const [session, setSession] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [tab, setTab] = useState("ehr");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchComparison().then((data) => {
      setSession(data);
      setSelectedId(data.candidates[0]?.patient_id || null);
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    setCandidate(null);
    fetchComparisonCandidate(selectedId).then((data) => {
      if (!controller.signal.aborted) setCandidate(data);
    }).catch((requestError) => !controller.signal.aborted && setError(requestError.message));
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => setNote(candidate?.verification?.note || ""), [candidate]);

  const selectedSummary = useMemo(() => session?.candidates.find((item) => item.patient_id === selectedId), [session, selectedId]);
  const filtered = useMemo(() => (session?.candidates || []).filter((item) => item.patient_id.includes(query.trim())), [session, query]);
  if (error && !session) return <Centered>Lỗi: {error}</Centered>;
  if (!session) return <Centered>Đang tải phiên đối chiếu từ dữ liệu raw…</Centered>;

  const status = candidate?.verification?.status || selectedSummary?.verification?.status || "pending";
  const reviewed = session.candidates.filter((item) => item.verification?.status && item.verification.status !== "pending").length;
  const scoreLevel = [
    ["very_similar", "Rất tương tự", CheckCircle2, C.teal],
    ["similar", "Tương tự", CheckCircle2, "#24618A"],
    ["uncertain", "Chưa rõ", FlagTriangleRight, C.amber],
    ["dissimilar", "Khác biệt", XCircle, "#9A5A1A"],
    ["very_dissimilar", "Rất khác", XCircle, C.red],
  ];
  async function decide(nextStatus) {
    if (!candidate) return;
    setSaving(true);
    try {
      const saved = await submitComparisonVerification(candidate.patient_id, { status: nextStatus, note });
      const verification = { status: saved.status, note: saved.note, reviewer: saved.reviewer, at: saved.at };
      setCandidate((old) => ({ ...old, verification }));
      setSession((old) => ({ ...old, candidates: old.candidates.map((item) => item.patient_id === candidate.patient_id ? { ...item, verification } : item) }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <main style={{ minHeight: "100vh", display: "flex", background: C.bg, color: C.ink, fontFamily: "'Inter', sans-serif" }}>
    <style>{FONTS}</style>
    <aside style={{ width: 286, flexShrink: 0, background: C.navy, color: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 18 }}><div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, fontSize: 14 }}><ShieldCheck size={17} color="#8FE0D4" />Đối chiếu bệnh nhân</div><div style={{ color: "#8da0ac", fontSize: 11, marginTop: 7 }}>{reviewed} / {session.candidates.length} kết quả đã xử lý</div></div>
      <div style={searchBox}><Search size={14} color="#8da0ac" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã bệnh nhân" style={searchInput} /></div>
      <div style={{ padding: "4px 8px", overflowY: "auto", flex: 1 }}>{filtered.map((item) => <button key={item.patient_id} onClick={() => setSelectedId(item.patient_id)} style={sidebarItemStyle(selectedId === item.patient_id)}><span style={{ color: "#8FE0D4", fontFamily: "monospace", fontSize: 12, width: 28 }}>#{item.rank}</span><span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{item.patient_id}</span><span style={{ fontSize: 11, color: "#9aabb5" }}>{(item.similarity_score * 100).toFixed(2)}% tương tự</span></span>{item.verification?.status && item.verification.status !== "pending" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: reviewColor(item.verification.status) }} />}<ChevronRight size={14} color="#81939e" /></button>)}</div>
    </aside>
    <section style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "16px 22px 0", background: C.surface, borderBottom: `1px solid ${C.border}` }}><div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: C.inkMuted }}>Query <strong style={{ color: C.ink }}>{session.query.id}</strong><ChevronRight size={14} /> Kết quả #{selectedSummary?.rank || "—"} <strong style={{ color: C.ink }}>{selectedId || "—"}</strong>{selectedSummary && <span style={{ color: C.teal, fontWeight: 700 }}>{(selectedSummary.similarity_score * 100).toFixed(2)}%</span>}<StatusBadge status={status} /></div><nav style={{ marginTop: 14, display: "flex", gap: 4 }}>{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} style={tabStyle(tab === id)}><Icon size={15} />{label}</button>)}</nav></header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 1, flex: 1, overflow: "hidden", background: C.border }}><PatientPanel title="Bệnh nhân query" patient={session.query} tab={tab} />{candidate ? <PatientPanel title={`Bệnh nhân tương tự #${candidate.rank} · ${(candidate.similarity_score * 100).toFixed(2)}%`} patient={candidate.patient} tab={tab} /> : <Centered>Đang tải hồ sơ tương tự…</Centered>}</div>
      <footer style={{ padding: "12px 22px", display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", background: C.surface, borderTop: `1px solid ${C.border}` }}><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho kết quả đối chiếu…" style={{ flex: "1 1 240px", minWidth: 170, padding: "9px 11px", borderRadius: 7, border: `1px solid ${C.border}` }} />{scoreLevel.map(([value, label, Icon, color]) => <ActionButton key={value} label={label} icon={Icon} color={color} onClick={() => decide(value)} disabled={saving || !candidate} active={status === value} />)}<a href={comparisonExportUrl("csv")} style={exportLinkStyle}><Download size={14} />CSV</a><a href={comparisonExportUrl("json")} style={exportLinkStyle}><Download size={14} />JSON</a></footer>
      {error && <div style={{ color: C.red, padding: "0 22px 10px", background: C.surface, fontSize: 12 }}>{error}</div>}
    </section>
  </main>;
}

function PatientPanel({ title, patient, tab }) {
  const [recordId, setRecordId] = useState(patient.records[0]?.id || "");
  useEffect(() => setRecordId(patient.records[0]?.id || ""), [patient.id]);
  const record = patient.records.find((item) => item.id === recordId) || patient.records[0];
  return <article style={{ background: C.bg, minWidth: 0, overflowY: "auto", padding: 18 }}><h2 style={{ fontSize: 14, margin: 0 }}>{title}</h2><div style={{ color: C.inkMuted, fontSize: 12, margin: "4px 0 13px" }}>{patient.id} · {patient.age} tuổi · {patient.gender}</div><label style={labelStyle}>Bệnh án<select value={recordId} onChange={(event) => setRecordId(event.target.value)} style={selectStyle}>{patient.records.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}</select></label>{tab === "ehr" && <Ehr ehr={record.ehr} />}{tab === "labs" && <Labs labs={record.labs} />}{["XQ", "CT", "MRI"].includes(tab) && <Imaging modality={tab} patient={patient} studies={record.studies[tab]} />}</article>;
}

function Ehr({ ehr }) { return <div style={{ marginTop: 18, display: "grid", gap: 10 }}>{ehr.details.length ? ehr.details.map(([title, value]) => <Card key={title} title={title}>{value}</Card>) : <Empty label="Không có dữ liệu EHR" />}</div>; }
function Labs({ labs }) {
  const dates = [...new Set(labs.map((lab) => lab.date || "Không rõ ngày"))].sort((a, b) => b.localeCompare(a));
  const [selectedDate, setSelectedDate] = useState(dates[0] || "");
  useEffect(() => setSelectedDate(dates[0] || ""), [labs]);
  if (!labs.length) return <Empty label="Không có kết quả xét nghiệm" />;
  const dailyLabs = labs.filter((lab) => (lab.date || "Không rõ ngày") === selectedDate);
  return <div style={{ marginTop: 18 }}><label style={labelStyle}>Ngày trả kết quả<select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={selectStyle}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label><div style={{ marginTop: 12, overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: "white" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: `1px solid ${C.border}` }}><th style={thStyle}>Chỉ số</th><th style={thStyle}>Kết quả</th><th style={thStyle}>Tham chiếu</th><th style={thStyle}>Mẫu</th><th style={thStyle}>Khoa xét nghiệm</th></tr></thead><tbody>{dailyLabs.map((lab, index) => <tr key={`${lab.name}-${lab.date}-${index}`} style={{ borderBottom: `1px solid ${C.border}` }}><td style={tdStyle}>{lab.name}</td><td style={{ ...tdStyle, color: lab.flagged ? C.red : C.ink, fontWeight: 600 }}>{lab.value} {lab.unit}</td><td style={tdStyle}>{lab.range}</td><td style={tdStyle} title={lab.diagnosis}>{lab.sample}</td><td style={tdStyle} title={lab.diagnosis}>{lab.department || "—"}</td></tr>)}</tbody></table></div><div style={{ marginTop: 7, fontSize: 11, color: C.inkFaint }}>{dailyLabs.length} chỉ số · chẩn đoán chỉ định hiển thị khi rê chuột vào cột Mẫu/Khoa</div></div>;
}

function Imaging({ modality, patient, studies }) {
  const [studyId, setStudyId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  useEffect(() => { setStudyId(studies[0]?.id || ""); setSeriesId(""); }, [modality, studies]);
  const study = studies.find((item) => item.id === studyId) || studies[0];
  useEffect(() => setSeriesId(study?.series[0]?.id || ""), [study?.id]);
  if (!study) return <Empty label={`Không có dữ liệu ${modality}`} />;
  const currentSeries = study.series.find((item) => item.id === seriesId) || study.series[0];
  const previews = modality === "XQ" ? [...study.series.slice(0, 2), null].slice(0, 2) : [currentSeries];
  return <div style={{ marginTop: 18 }}><label style={labelStyle}>{modality} study<select value={study.id} onChange={(event) => setStudyId(event.target.value)} style={selectStyle}>{studies.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}</select></label>{modality !== "XQ" && <label style={{ ...labelStyle, marginTop: 12 }}>Series<select value={currentSeries.id} onChange={(event) => setSeriesId(event.target.value)} style={selectStyle}>{study.series.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<div style={{ fontSize: 12, color: C.inkMuted, margin: "14px 0 8px" }}>{modality === "XQ" ? "Tối đa hai series XQ đầu của study đã chọn" : currentSeries.label}</div><div style={{ display: "grid", gridTemplateColumns: modality === "XQ" ? "1fr 1fr" : "1fr", gap: 10 }}>{previews.map((series, index) => series ? <ScanViewport key={series.id} patient={patient} modality={modality} series={series} /> : <Empty key={`empty-${index}`} label="Không có ảnh XQ thứ hai" />)}</div></div>;
}

function Card({ title, children }) { return <div style={{ border: `1px solid ${C.border}`, background: "white", borderRadius: 8, padding: "11px 12px", fontSize: 13, lineHeight: 1.5 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", marginBottom: 4 }}>{title}</div>{children}</div>; }
function Empty({ label }) { return <div style={{ minHeight: 120, display: "grid", placeItems: "center", color: C.inkFaint, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8, marginTop: 18 }}>{label}</div>; }
function Centered({ children }) { return <div style={{ minHeight: "100%", display: "grid", placeItems: "center", fontFamily: "Inter, sans-serif", color: C.inkMuted, padding: 18 }}>{children}</div>; }
const labelStyle = { display: "block", fontSize: 11, color: C.inkMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
const selectStyle = { display: "block", marginTop: 5, width: "100%", padding: "8px 9px", border: `1px solid ${C.border}`, borderRadius: 6, background: "white", color: C.ink };
const searchBox = { margin: "0 14px 10px", padding: "8px 10px", background: "#0f1a22", border: "1px solid #2a3d4c", borderRadius: 7, display: "flex", gap: 7 };
const searchInput = { border: 0, outline: 0, width: "100%", background: "transparent", color: "white" };
const sidebarItemStyle = (selected) => ({ display: "flex", alignItems: "center", textAlign: "left", width: "100%", border: 0, borderLeft: selected ? "3px solid #8FE0D4" : "3px solid transparent", borderRadius: 7, marginBottom: 3, padding: "10px 8px", background: selected ? C.navySoft : "transparent", color: "white", cursor: "pointer" });
const tabStyle = (selected) => ({ border: 0, borderBottom: selected ? `2px solid ${C.teal}` : "2px solid transparent", padding: "10px 14px", background: "none", cursor: "pointer", color: selected ? C.ink : C.inkFaint, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 });
const exportLinkStyle = { display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 10px", borderRadius: 7, border: `1px solid ${C.border}`, color: C.inkMuted, textDecoration: "none", fontSize: 12, fontWeight: 600, background: "white" };
const reviewColor = (status) => ({ very_similar: C.teal, similar: "#24618A", uncertain: C.amber, dissimilar: "#9A5A1A", very_dissimilar: C.red }[status] || C.inkFaint);
