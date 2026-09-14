import React, { useEffect, useState } from "react";
import { C } from "../theme.js";
import { isEhrMetadata, normalizeText } from "../utils/text.js";
import { Card, Empty, evidenceChipStyle, labelStyle, selectStyle, tdStyle, thStyle } from "./ui.jsx";
import HighlightedText from "./HighlightedText.jsx";
import ScanViewport from "./ScanViewport.jsx";

export default function PatientPanel({ title, patient, tab, evidence, similarOnly, side }) {
  const [recordId, setRecordId] = useState(patient.records[0]?.id || "");
  useEffect(() => setRecordId(patient.records[0]?.id || ""), [patient.id]);
  const record = patient.records.find((item) => item.id === recordId) || patient.records[0];
  return (
    <article style={{ background: C.bg, minWidth: 0, overflowY: "auto", padding: 18 }}>
      <h2 style={{ fontSize: 14, margin: 0 }}>{title}</h2>
      <div style={{ color: C.inkMuted, fontSize: 12, margin: "4px 0 13px" }}>{patient.id} · {patient.age} tuổi · {patient.gender}</div>
      <label style={labelStyle}>Bệnh án
        <select value={recordId} onChange={(event) => setRecordId(event.target.value)} style={selectStyle}>
          {patient.records.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}
        </select>
      </label>
      {tab === "ehr" && (
        <Ehr
          ehr={record.ehr}
          highlightTerms={[...(evidence?.ehr_phrases || []), ...(evidence?.ehr_keywords || [])]}
          matchedTitles={(evidence?.ehr_matches || []).map((match) => side === "query" ? match.query_title : match.candidate_title)}
          similarOnly={similarOnly}
        />
      )}
      {tab === "labs" && <Labs labs={record.labs} sharedLabs={evidence?.shared_labs || []} similarOnly={similarOnly} />}
      {["XQ", "CT", "MRI"].includes(tab) && <Imaging modality={tab} patient={patient} studies={record.studies[tab]} shared={evidence?.shared_modalities?.includes(tab)} />}
    </article>
  );
}

function Ehr({ ehr, highlightTerms, matchedTitles, similarOnly }) {
  const matched = new Set(matchedTitles.map(normalizeText));
  const details = similarOnly ? ehr.details.filter(([title]) => !isEhrMetadata(title) && matched.has(normalizeText(title))) : ehr.details;
  return (
    <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
      {details.length
        ? details.map(([title, value]) => <Card key={title} title={title}><HighlightedText value={value} terms={highlightTerms} /></Card>)
        : <Empty label={similarOnly ? "Không tìm thấy nội dung EHR lâm sàng chung" : "Không có dữ liệu EHR"} />}
    </div>
  );
}

function Labs({ labs, sharedLabs, similarOnly }) {
  const dates = [...new Set(labs.map((lab) => lab.date || "Không rõ ngày"))].sort((a, b) => b.localeCompare(a));
  const [selectedDate, setSelectedDate] = useState(dates[0] || "");
  useEffect(() => setSelectedDate(dates[0] || ""), [labs]);
  if (!labs.length) return <Empty label="Không có kết quả xét nghiệm" />;
  const shared = new Set(sharedLabs.map(normalizeText));
  const dailyLabs = labs.filter((lab) => (lab.date || "Không rõ ngày") === selectedDate);
  const visibleLabs = similarOnly ? labs.filter((lab) => shared.has(normalizeText(lab.name))) : dailyLabs;
  return (
    <div style={{ marginTop: 18 }}>
      {!similarOnly && (
        <label style={labelStyle}>Ngày trả kết quả
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={selectStyle}>
            {dates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>
      )}
      <div style={{ marginTop: 12, overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: "white" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle}>Chỉ số</th>
              {similarOnly && <th style={thStyle}>Ngày KQ</th>}
              <th style={thStyle}>Kết quả</th>
              <th style={thStyle}>Tham chiếu</th>
              <th style={thStyle}>Mẫu</th>
              <th style={thStyle}>Khoa xét nghiệm</th>
            </tr>
          </thead>
          <tbody>
            {visibleLabs.map((lab, index) => {
              const isShared = shared.has(normalizeText(lab.name));
              return (
                <tr key={`${lab.name}-${lab.date}-${index}`} style={{ borderBottom: `1px solid ${C.border}`, background: isShared ? "#F4FBF9" : "transparent" }}>
                  <td style={{ ...tdStyle, fontWeight: isShared ? 700 : 400 }}>{lab.name}{isShared && <span style={{ ...evidenceChipStyle, marginLeft: 5 }}>Chung</span>}</td>
                  {similarOnly && <td style={tdStyle}>{lab.date}</td>}
                  <td style={{ ...tdStyle, color: lab.flagged ? C.red : C.ink, fontWeight: 600 }}>{lab.value} {lab.unit}</td>
                  <td style={tdStyle}>{lab.range}</td>
                  <td style={tdStyle} title={lab.diagnosis}>{lab.sample}</td>
                  <td style={tdStyle} title={lab.diagnosis}>{lab.department || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 7, fontSize: 11, color: C.inkFaint }}>{visibleLabs.length} chỉ số{similarOnly ? " chung ở mọi ngày" : " trong ngày"} · hàng xanh là xét nghiệm xuất hiện ở cả hai bệnh nhân</div>
    </div>
  );
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
  return (
    <div style={{ marginTop: 18 }}>
      {shared && <div style={{ ...evidenceChipStyle, display: "inline-block", marginBottom: 10 }}>Cả hai bệnh nhân đều có {modality}</div>}
      <label style={labelStyle}>{modality} study
        <select value={study.id} onChange={(event) => setStudyId(event.target.value)} style={selectStyle}>
          {studies.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.date}</option>)}
        </select>
      </label>
      {modality !== "XQ" && (
        <label style={{ ...labelStyle, marginTop: 12 }}>Series
          <select value={currentSeries.id} onChange={(event) => setSeriesId(event.target.value)} style={selectStyle}>
            {study.series.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
      <div style={{ fontSize: 12, color: C.inkMuted, margin: "14px 0 8px" }}>{modality === "XQ" ? "Tối đa hai series XQ đầu của study đã chọn" : currentSeries.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: modality === "XQ" ? "1fr 1fr" : "1fr", gap: 10 }}>
        {previews.map((series, index) => series
          ? <ScanViewport key={series.id} patient={patient} modality={modality} series={series} />
          : <Empty key={`empty-${index}`} label="Không có ảnh XQ thứ hai" />)}
      </div>
    </div>
  );
}
