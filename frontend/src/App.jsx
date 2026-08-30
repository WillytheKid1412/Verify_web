import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronRight, Download, FileText, FlaskConical,
  Filter, FlagTriangleRight, Image, ScanLine, Search, ShieldCheck, XCircle,
} from "lucide-react";
import {
  comparisonExportUrl, fetchComparison, fetchComparisonCandidate,
  fetchComparisonQueries, submitComparisonVerification,
} from "./api.js";
import { C, FONTS } from "./theme.js";
import { ActionButton, StatusBadge, tdStyle, thStyle } from "./components/ui.jsx";
import ScanViewport from "./components/ScanViewport.jsx";

const tabs = [
  ["ehr", "EHR", FileText], ["labs", "Lab result", FlaskConical],
  ["XQ", "XQ", Image], ["CT", "CT", ScanLine], ["MRI", "MRI", ScanLine],
];

export default function App() {
  const [session, setSession] = useState(null);
  const [queries, setQueries] = useState([]);
  const [queryPatientId, setQueryPatientId] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [tab, setTab] = useState("ehr");
  const [note, setNote] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSimilarOnly, setShowSimilarOnly] = useState(false);

  async function loadSession(patientId) {
    const cleanId = String(patientId || "").trim();
    if (!cleanId) return;
    setLoadingSession(true);
    setError("");
    setCandidate(null);
    try {
      const data = await fetchComparison(cleanId);
      setSession(data);
      setQueryPatientId(data.query.id);
      setCandidateSearch("");
      setSelectedId(data.candidates[0]?.patient_id || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingSession(false);
    }
  }

  useEffect(() => {
    fetchComparisonQueries().then((data) => {
      setQueries(data.queries || []);
      return loadSession(data.default_query_patient_id);
    }).catch((requestError) => {
      setError(requestError.message);
      setLoadingSession(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId || !queryPatientId) return undefined;
    const controller = new AbortController();
    setCandidate(null);
    fetchComparisonCandidate(queryPatientId, selectedId).then((data) => {
      if (!controller.signal.aborted) setCandidate(data);
    }).catch((requestError) => !controller.signal.aborted && setError(requestError.message));
    return () => controller.abort();
  }, [selectedId, queryPatientId]);

  useEffect(() => setNote(candidate?.verification?.note || ""), [candidate]);

  const selectedSummary = useMemo(
    () => session?.candidates.find((item) => item.patient_id === selectedId),
    [session, selectedId],
  );
  const filtered = useMemo(
    () => (session?.candidates || []).filter((item) => item.patient_id.includes(candidateSearch.trim())),
    [session, candidateSearch],
  );
  if (error && !session) return <Centered>Lỗi: {error}</Centered>;
  if (!session) return <Centered>Đang tải Top-20 và dữ liệu raw…</Centered>;

  const status = candidate?.verification?.status || selectedSummary?.verification?.status || "pending";
  const similarityFilterActive = showSimilarOnly && (tab === "ehr" || tab === "labs");
  const reviewed = session.candidates.filter(
    (item) => item.verification?.status && item.verification.status !== "pending",
  ).length;
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
      const saved = await submitComparisonVerification(
        session.query.id, candidate.patient_id, { status: nextStatus, note },
      );
      const verification = {
        status: saved.status, note: saved.note, reviewer: saved.reviewer, at: saved.at,
      };
      setCandidate((old) => ({ ...old, verification }));
      setSession((old) => ({
        ...old,
        candidates: old.candidates.map((item) => (
          item.patient_id === candidate.patient_id ? { ...item, verification } : item
        )),
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <main style={{ minHeight: "100vh", display: "flex", background: C.bg, color: C.ink, fontFamily: "'Inter', sans-serif" }}>
    <style>{FONTS}</style>
    <aside style={{ width: 300, flexShrink: 0, background: C.navy, color: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 16px 10px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, fontSize: 14 }}>
          <ShieldCheck size={17} color="#8FE0D4" />Đối chiếu bệnh nhân
        </div>
        <div style={{ color: "#8da0ac", fontSize: 11, marginTop: 7 }}>
          {queries.length.toLocaleString("vi-VN")} query · {reviewed}/{session.candidates.length} kết quả đã xử lý
        </div>
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
            {queries.map((item) => <option key={item.patient_id} value={item.patient_id}>
              {item.patient_id} · {item.split || "—"} · Top {item.candidate_count}
            </option>)}
          </select>
        </label>
        <div style={{ marginTop: 5, color: "#8da0ac", fontSize: 10 }}>Chọn query để đổi sang Top-20 tương ứng.</div>
      </div>
      <div style={searchBox}>
        <Search size={14} color="#8da0ac" />
        <input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Lọc trong Top-20" style={searchInput} />
      </div>
      <div style={{ padding: "4px 8px", overflowY: "auto", flex: 1 }}>
        {filtered.map((item) => <button key={item.patient_id} onClick={() => setSelectedId(item.patient_id)} style={sidebarItemStyle(selectedId === item.patient_id)}>
          <span style={{ color: "#8FE0D4", fontFamily: "monospace", fontSize: 12, width: 28 }}>#{item.rank}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{item.patient_id}</span>
            <span style={{ fontSize: 11, color: "#9aabb5" }}>{(item.similarity_score * 100).toFixed(2)}% tương tự</span>
            {!!item.shared_primary_icd_groups?.length && <span style={sidebarIcdStyle}>ICD {item.shared_primary_icd_groups.join(", ")}</span>}
          </span>
          {item.verification?.status && item.verification.status !== "pending" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: reviewColor(item.verification.status) }} />}
          <ChevronRight size={14} color="#81939e" />
        </button>)}
      </div>
    </aside>
    <section style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "16px 22px 0", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: C.inkMuted }}>
          Query <strong style={{ color: C.ink }}>{session.query.id}</strong><ChevronRight size={14} />
          Kết quả #{selectedSummary?.rank || "—"} <strong style={{ color: C.ink }}>{selectedId || "—"}</strong>
          {selectedSummary && <span style={{ color: C.teal, fontWeight: 700 }}>{(selectedSummary.similarity_score * 100).toFixed(2)}%</span>}
          <StatusBadge status={status} />
        </div>
        <nav style={{ marginTop: 14, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} style={tabStyle(tab === id)}><Icon size={15} />{label}</button>)}
          <button onClick={() => setShowSimilarOnly((value) => !value)} disabled={!candidate || !["ehr", "labs"].includes(tab)} style={similarOnlyButtonStyle(similarityFilterActive, !candidate || !["ehr", "labs"].includes(tab))}>
            <Filter size={14} />{similarityFilterActive ? "Đang chỉ phần giống nhau" : "Chỉ phần giống nhau"}
          </button>
        </nav>
      </header>
      <SimilarityEvidence evidence={candidate?.similarity_evidence} />
      {similarityFilterActive && <SimilarityFocus tab={tab} evidence={candidate?.similarity_evidence} />}
      {similarityFilterActive && candidate
        ? <AlignedComparison tab={tab} evidence={candidate.similarity_evidence} queryId={session.query.id} candidateId={candidate.patient.id} />
        : <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 1, flex: 1, overflow: "hidden", background: C.border }}>
          <PatientPanel title="Bệnh nhân query" patient={session.query} tab={tab} evidence={candidate?.similarity_evidence} similarOnly={similarityFilterActive} side="query" />
          {candidate
            ? <PatientPanel title={`Bệnh nhân tương tự #${candidate.rank} · ${(candidate.similarity_score * 100).toFixed(2)}%`} patient={candidate.patient} tab={tab} evidence={candidate.similarity_evidence} similarOnly={similarityFilterActive} side="candidate" />
            : <Centered>Đang tải hồ sơ tương tự…</Centered>}
        </div>}
      <footer style={{ padding: "12px 22px", display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho kết quả đối chiếu…" style={{ flex: "1 1 240px", minWidth: 170, padding: "9px 11px", borderRadius: 7, border: `1px solid ${C.border}` }} />
        {scoreLevel.map(([value, label, Icon, color]) => <ActionButton key={value} label={label} icon={Icon} color={color} onClick={() => decide(value)} disabled={saving || !candidate} active={status === value} />)}
        <a href={comparisonExportUrl("csv", session.query.id)} style={exportLinkStyle}><Download size={14} />CSV</a>
        <a href={comparisonExportUrl("json", session.query.id)} style={exportLinkStyle}><Download size={14} />JSON</a>
      </footer>
      {error && <div style={{ color: C.red, padding: "0 22px 10px", background: C.surface, fontSize: 12 }}>{error}</div>}
    </section>
  </main>;
}

function SimilarityEvidence({ evidence }) {
  if (!evidence) return <div style={evidenceBarStyle}>Đang xác định các điểm trùng quan sát được…</div>;
  const groups = [
    ["ICD chính chung", evidence.shared_primary_icd_groups, "#DFF3EF", "#146B60"],
    ["Cụm EHR chung", evidence.ehr_phrases?.length ? evidence.ehr_phrases : evidence.ehr_keywords, "#E8EFF8", "#24577B"],
    ["Xét nghiệm chung", evidence.shared_labs, "#F3ECFA", "#65428A"],
    ["Bất thường chung", evidence.shared_abnormal_labs, "#FCE9E5", C.red],
    ["Modality chung", evidence.shared_modalities, "#FFF1D9", "#8A5B10"],
  ].filter(([, values]) => values?.length);
  return <section style={evidenceBarStyle} title={evidence.disclaimer}>
    <strong style={{ whiteSpace: "nowrap", fontSize: 11 }}>Điểm giống quan sát được</strong>
    {groups.length
      ? groups.map(([label, values, background, color]) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ color: C.inkFaint, fontSize: 10 }}>{label}:</span>
        {values.slice(0, 8).map((value) => <span key={value} style={{ ...evidenceChipStyle, background, color }}>{value}</span>)}
        {values.length > 8 && <span style={{ color: C.inkFaint, fontSize: 10 }}>+{values.length - 8}</span>}
      </div>)
      : <span style={{ color: C.inkFaint, fontSize: 11 }}>Chưa tìm thấy điểm trùng trực tiếp trong dữ liệu hiển thị.</span>}
  </section>;
}

function SimilarityFocus({ tab, evidence }) {
  if (!evidence) return null;
  if (tab === "ehr") {
    const rows = evidence.ehr_matches || [];
    return <section style={focusPanelStyle}>
      <strong>Phần EHR trùng nhau</strong>
      <span>{rows.length ? "Mỗi hàng bên dưới là một cặp trường tương ứng, đặt thẳng hàng để đối chiếu." : "Không tìm thấy cặp nội dung EHR lâm sàng trùng đủ rõ để đánh dấu."}</span>
    </section>;
  }
  const rows = evidence.shared_lab_results || [];
  return <section style={focusPanelStyle}><strong>Xét nghiệm/cận lâm sàng chung</strong><span>{rows.length ? "Mỗi chỉ số cùng tên được ghép một hàng với các kết quả của hai bên." : "Không có xét nghiệm trùng tên giữa hai hồ sơ."}</span></section>;
}

function AlignedComparison({ tab, evidence, queryId, candidateId }) {
  if (tab === "ehr") {
    const rows = evidence.ehr_matches || [];
    return <section style={alignedSectionStyle}>
      {rows.length ? <table style={alignedTableStyle}>
        <thead><tr><th style={{ ...thStyle, width: 190 }}>Trường EHR</th><th style={thStyle}>Query · {queryId}</th><th style={thStyle}>Bệnh nhân tương tự · {candidateId}</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.query_title}-${index}`} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: "top" }}>
          <td style={{ ...tdStyle, fontWeight: 700 }}><div>{row.query_title}</div><div style={{ marginTop: 5 }}>{[...(row.phrases || []), ...(row.terms || [])].slice(0, 4).map((value) => <span key={value} style={{ ...evidenceChipStyle, margin: "0 3px 3px 0", background: "#FFF0A8", color: C.ink }}>{value}</span>)}</div></td>
          <td style={{ ...tdStyle, lineHeight: 1.55 }}><HighlightedText value={row.query_value} terms={[...(row.phrases || []), ...(row.terms || [])]} /></td>
          <td style={{ ...tdStyle, lineHeight: 1.55 }}><HighlightedText value={row.candidate_value} terms={[...(row.phrases || []), ...(row.terms || [])]} /></td>
        </tr>)}</tbody>
      </table> : <Empty label="Không có nội dung EHR trùng để xếp hàng đối chiếu" />}
    </section>;
  }

  const rows = evidence.shared_lab_results || [];
  return <section style={alignedSectionStyle}>
    {rows.length ? <table style={alignedTableStyle}>
      <thead><tr><th style={{ ...thStyle, width: 240 }}>Chỉ số/cận lâm sàng</th><th style={thStyle}>Query · {queryId}</th><th style={thStyle}>Bệnh nhân tương tự · {candidateId}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.name} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: "top" }}><td style={{ ...tdStyle, fontWeight: 700 }}>{row.name}</td><td style={tdStyle}>{formatLabResults(row.query_results)}</td><td style={tdStyle}>{formatLabResults(row.candidate_results)}</td></tr>)}</tbody>
    </table> : <Empty label="Không có chỉ số/cận lâm sàng trùng tên để xếp hàng đối chiếu" />}
  </section>;
}

function formatLabResults(results) {
  return (results || []).map((result) => <div key={`${result.date}-${result.value}`} style={{ color: result.flagged ? C.red : C.ink }}><span style={{ color: C.inkFaint }}>{result.date}: </span>{result.value} {result.unit}</div>);
}

function PatientPanel({ title, patient, tab, evidence, similarOnly, side }) {
  const [recordId, setRecordId] = useState(patient.records[0]?.id || "");
  useEffect(() => setRecordId(patient.records[0]?.id || ""), [patient.id]);
  const record = patient.records.find((item) => item.id === recordId) || patient.records[0];
  return <article style={{ background: C.bg, minWidth: 0, overflowY: "auto", padding: 18 }}>
    <h2 style={{ fontSize: 14, margin: 0 }}>{title}</h2>
    <div style={{ color: C.inkMuted, fontSize: 12, margin: "4px 0 13px" }}>{patient.id} · {patient.age} tuổi · {patient.gender}</div>
    <label style={labelStyle}>Bệnh án
      <select value={recordId} onChange={(event) => setRecordId(event.target.value)} style={selectStyle}>
        {patient.records.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}
      </select>
    </label>
    {tab === "ehr" && <Ehr ehr={record.ehr} highlightTerms={[...(evidence?.ehr_phrases || []), ...(evidence?.ehr_keywords || [])]} matchedTitles={(evidence?.ehr_matches || []).map((match) => side === "query" ? match.query_title : match.candidate_title)} similarOnly={similarOnly} />}
    {tab === "labs" && <Labs labs={record.labs} sharedLabs={evidence?.shared_labs || []} similarOnly={similarOnly} />}
    {["XQ", "CT", "MRI"].includes(tab) && <Imaging modality={tab} patient={patient} studies={record.studies[tab]} shared={evidence?.shared_modalities?.includes(tab)} />}
  </article>;
}

function Ehr({ ehr, highlightTerms, matchedTitles, similarOnly }) {
  const matched = new Set(matchedTitles.map(normalizeText));
  const details = similarOnly ? ehr.details.filter(([title]) => !isEhrMetadata(title) && matched.has(normalizeText(title))) : ehr.details;
  return <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
    {details.length
      ? details.map(([title, value]) => <Card key={title} title={title}><HighlightedText value={value} terms={highlightTerms} /></Card>)
      : <Empty label={similarOnly ? "Không tìm thấy nội dung EHR lâm sàng chung" : "Không có dữ liệu EHR"} />}
  </div>;
}

function Labs({ labs, sharedLabs, similarOnly }) {
  const dates = [...new Set(labs.map((lab) => lab.date || "Không rõ ngày"))].sort((a, b) => b.localeCompare(a));
  const [selectedDate, setSelectedDate] = useState(dates[0] || "");
  useEffect(() => setSelectedDate(dates[0] || ""), [labs]);
  if (!labs.length) return <Empty label="Không có kết quả xét nghiệm" />;
  const shared = new Set(sharedLabs.map(normalizeText));
  const dailyLabs = labs.filter((lab) => (lab.date || "Không rõ ngày") === selectedDate);
  const visibleLabs = similarOnly ? labs.filter((lab) => shared.has(normalizeText(lab.name))) : dailyLabs;
  return <div style={{ marginTop: 18 }}>
    {!similarOnly && <label style={labelStyle}>Ngày trả kết quả
      <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={selectStyle}>
        {dates.map((date) => <option key={date} value={date}>{date}</option>)}
      </select>
    </label>}
    <div style={{ marginTop: 12, overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: "white" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}><th style={thStyle}>Chỉ số</th>{similarOnly && <th style={thStyle}>Ngày KQ</th>}<th style={thStyle}>Kết quả</th><th style={thStyle}>Tham chiếu</th><th style={thStyle}>Mẫu</th><th style={thStyle}>Khoa xét nghiệm</th></tr></thead>
        <tbody>{visibleLabs.map((lab, index) => {
          const isShared = shared.has(normalizeText(lab.name));
          return <tr key={`${lab.name}-${lab.date}-${index}`} style={{ borderBottom: `1px solid ${C.border}`, background: isShared ? "#F4FBF9" : "transparent" }}>
            <td style={{ ...tdStyle, fontWeight: isShared ? 700 : 400 }}>{lab.name}{isShared && <span style={{ ...evidenceChipStyle, marginLeft: 5 }}>Chung</span>}</td>
            {similarOnly && <td style={tdStyle}>{lab.date}</td>}
            <td style={{ ...tdStyle, color: lab.flagged ? C.red : C.ink, fontWeight: 600 }}>{lab.value} {lab.unit}</td>
            <td style={tdStyle}>{lab.range}</td><td style={tdStyle} title={lab.diagnosis}>{lab.sample}</td><td style={tdStyle} title={lab.diagnosis}>{lab.department || "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div style={{ marginTop: 7, fontSize: 11, color: C.inkFaint }}>{visibleLabs.length} chỉ số{similarOnly ? " chung ở mọi ngày" : " trong ngày"} · hàng xanh là xét nghiệm xuất hiện ở cả hai bệnh nhân</div>
  </div>;
}

function Imaging({ modality, patient, studies, shared }) {
  const [studyId, setStudyId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  useEffect(() => { setStudyId(studies[0]?.id || ""); setSeriesId(""); }, [modality, studies]);
  const study = studies.find((item) => item.id === studyId) || studies[0];
  useEffect(() => setSeriesId(study?.series[0]?.id || ""), [study?.id]);
  if (!study) return <Empty label={`Không có dữ liệu ${modality}`} />;
  const currentSeries = study.series.find((item) => item.id === seriesId) || study.series[0];
  const previews = modality === "XQ" ? [...study.series.slice(0, 2), null].slice(0, 2) : [currentSeries];
  return <div style={{ marginTop: 18 }}>
    {shared && <div style={{ ...evidenceChipStyle, display: "inline-block", marginBottom: 10 }}>Cả hai bệnh nhân đều có {modality}</div>}
    <label style={labelStyle}>{modality} study
      <select value={study.id} onChange={(event) => setStudyId(event.target.value)} style={selectStyle}>
        {studies.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}
      </select>
    </label>
    {modality !== "XQ" && <label style={{ ...labelStyle, marginTop: 12 }}>Series
      <select value={currentSeries.id} onChange={(event) => setSeriesId(event.target.value)} style={selectStyle}>
        {study.series.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    <div style={{ fontSize: 12, color: C.inkMuted, margin: "14px 0 8px" }}>{modality === "XQ" ? "Tối đa hai series XQ đầu của study đã chọn" : currentSeries.label}</div>
    <div style={{ display: "grid", gridTemplateColumns: modality === "XQ" ? "1fr 1fr" : "1fr", gap: 10 }}>
      {previews.map((series, index) => series
        ? <ScanViewport key={series.id} patient={patient} modality={modality} series={series} />
        : <Empty key={`empty-${index}`} label="Không có ảnh XQ thứ hai" />)}
    </div>
  </div>;
}

function HighlightedText({ value, terms }) {
  const text = String(value ?? "");
  const usefulTerms = [...new Set(terms.filter(Boolean))].sort((left, right) => right.length - left.length);
  if (!usefulTerms.length) return text;
  const pattern = new RegExp(`(${usefulTerms.map(escapeRegExp).join("|")})`, "giu");
  return text.split(pattern).map((part, index) => (
    usefulTerms.some((term) => normalizeText(term) === normalizeText(part))
      ? <mark key={`${part}-${index}`} style={{ background: "#FFF0A8", color: "inherit", padding: "0 1px", borderRadius: 2 }}>{part}</mark>
      : part
  ));
}

function containsSimilarTerm(value, terms) {
  const normalizedValue = normalizeText(value);
  return terms.some((term) => normalizeText(term).length >= 4 && normalizedValue.includes(normalizeText(term)));
}

function isEhrMetadata(title) {
  return new Set(["số bệnh án", "số vào viện", "mã bệnh án", "ngày vào viện", "ngày ra viện", "khoa điều trị", "kết quả điều trị"]).has(normalizeText(title));
}

function normalizeText(value) { return String(value || "").normalize("NFC").toLocaleLowerCase("vi").trim(); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function Card({ title, children }) { return <div style={{ border: `1px solid ${C.border}`, background: "white", borderRadius: 8, padding: "11px 12px", fontSize: 13, lineHeight: 1.5 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", marginBottom: 4 }}>{title}</div>{children}</div>; }
function Empty({ label }) { return <div style={{ minHeight: 120, display: "grid", placeItems: "center", color: C.inkFaint, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8, marginTop: 18 }}>{label}</div>; }
function Centered({ children }) { return <div style={{ minHeight: "100%", display: "grid", placeItems: "center", fontFamily: "Inter, sans-serif", color: C.inkMuted, padding: 18 }}>{children}</div>; }
const labelStyle = { display: "block", fontSize: 11, color: C.inkMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
const selectStyle = { display: "block", marginTop: 5, width: "100%", padding: "8px 9px", border: `1px solid ${C.border}`, borderRadius: 6, background: "white", color: C.ink };
const searchBox = { margin: "0 14px 10px", padding: "8px 10px", background: "#0f1a22", border: "1px solid #2a3d4c", borderRadius: 7, display: "flex", gap: 7 };
const searchInput = { border: 0, outline: 0, width: "100%", minWidth: 0, background: "transparent", color: "white" };
const querySelectStyle = { display: "block", marginTop: 5, width: "100%", padding: "8px 9px", border: "1px solid #2a3d4c", borderRadius: 7, background: "#0f1a22", color: "white", outline: 0 };
const sidebarIcdStyle = { display: "block", width: "fit-content", marginTop: 3, padding: "1px 5px", borderRadius: 4, background: "#193441", color: "#8FE0D4", fontSize: 9 };
const sidebarItemStyle = (selected) => ({ display: "flex", alignItems: "center", textAlign: "left", width: "100%", border: 0, borderLeft: selected ? "3px solid #8FE0D4" : "3px solid transparent", borderRadius: 7, marginBottom: 3, padding: "9px 8px", background: selected ? C.navySoft : "transparent", color: "white", cursor: "pointer" });
const tabStyle = (selected) => ({ border: 0, borderBottom: selected ? `2px solid ${C.teal}` : "2px solid transparent", padding: "10px 14px", background: "none", cursor: "pointer", color: selected ? C.ink : C.inkFaint, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 });
const exportLinkStyle = { display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 10px", borderRadius: 7, border: `1px solid ${C.border}`, color: C.inkMuted, textDecoration: "none", fontSize: 12, fontWeight: 600, background: "white" };
const evidenceBarStyle = { minHeight: 36, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "7px 22px", background: "#FBFCFD", borderBottom: `1px solid ${C.border}` };
const focusPanelStyle = { display: "flex", alignItems: "flex-start", gap: 9, flexWrap: "wrap", padding: "9px 22px", background: "#F4FBF9", borderBottom: `1px solid ${C.border}`, color: C.inkMuted, fontSize: 11 };
const alignedSectionStyle = { flex: 1, overflow: "auto", padding: 18, background: C.bg };
const alignedTableStyle = { width: "100%", minWidth: 760, borderCollapse: "collapse", background: "white", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontSize: 12 };
const evidenceChipStyle = { display: "inline-block", padding: "2px 6px", borderRadius: 999, background: "#DFF3EF", color: "#146B60", fontSize: 10, fontWeight: 700 };
const reviewColor = (status) => ({ very_similar: C.teal, similar: "#24618A", uncertain: C.amber, dissimilar: "#9A5A1A", very_dissimilar: C.red }[status] || C.inkFaint);
const similarOnlyButtonStyle = (active, disabled) => ({ marginLeft: "auto", border: `1px solid ${active ? C.teal : C.border}`, borderRadius: 7, padding: "7px 10px", background: active ? C.tealSoft : "white", color: active ? "#0B6C62" : C.inkMuted, fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 5 });
