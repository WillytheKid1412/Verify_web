import React from "react";
import { C } from "../theme.js";
import { Empty, evidenceChipStyle, tdStyle, thStyle } from "./ui.jsx";
import HighlightedText from "./HighlightedText.jsx";

export function SimilarityEvidence({ evidence }) {
  if (!evidence) return <div style={evidenceBarStyle}>Đang xác định các điểm trùng quan sát được…</div>;
  const groups = [
    ["ICD chính chung", evidence.shared_primary_icd_groups, "#DFF3EF", "#146B60"],
    ["Cụm EHR chung", evidence.ehr_phrases?.length ? evidence.ehr_phrases : evidence.ehr_keywords, "#E8EFF8", "#24577B"],
    ["Xét nghiệm chung", evidence.shared_labs, "#F3ECFA", "#65428A"],
    ["Bất thường chung", evidence.shared_abnormal_labs, "#FCE9E5", C.red],
    ["Modality chung", evidence.shared_modalities, "#FFF1D9", "#8A5B10"],
  ].filter(([, values]) => values?.length);
  return (
    <section style={evidenceBarStyle} title={evidence.disclaimer}>
      <strong style={{ whiteSpace: "nowrap", fontSize: 11 }}>Điểm giống quan sát được</strong>
      {groups.length
        ? groups.map(([label, values, background, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ color: C.inkFaint, fontSize: 10 }}>{label}:</span>
            {values.slice(0, 8).map((value) => <span key={value} style={{ ...evidenceChipStyle, background, color }}>{value}</span>)}
            {values.length > 8 && <span style={{ color: C.inkFaint, fontSize: 10 }}>+{values.length - 8}</span>}
          </div>
        ))
        : <span style={{ color: C.inkFaint, fontSize: 11 }}>Chưa tìm thấy điểm trùng trực tiếp trong dữ liệu hiển thị.</span>}
    </section>
  );
}

export function SimilarityFocus({ tab, evidence }) {
  if (!evidence) return null;
  if (tab === "ehr") {
    const rows = evidence.ehr_matches || [];
    return (
      <section style={focusPanelStyle}>
        <strong>Phần EHR trùng nhau</strong>
        <span>{rows.length ? "Mỗi hàng bên dưới là một cặp trường tương ứng, đặt thẳng hàng để đối chiếu." : "Không tìm thấy cặp nội dung EHR lâm sàng trùng đủ rõ để đánh dấu."}</span>
      </section>
    );
  }
  const rows = evidence.shared_lab_results || [];
  return (
    <section style={focusPanelStyle}>
      <strong>Xét nghiệm/cận lâm sàng chung</strong>
      <span>{rows.length ? "Mỗi chỉ số cùng tên được ghép một hàng với các kết quả của hai bên." : "Không có xét nghiệm trùng tên giữa hai hồ sơ."}</span>
    </section>
  );
}

export function AlignedComparison({ tab, evidence, queryId, candidateId }) {
  if (tab === "ehr") {
    const rows = evidence.ehr_matches || [];
    return (
      <section style={alignedSectionStyle}>
        {rows.length ? (
          <table style={alignedTableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 190 }}>Trường EHR</th>
                <th style={thStyle}>Query · {queryId}</th>
                <th style={thStyle}>Bệnh nhân tương tự · {candidateId}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.query_title}-${index}`} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: "top" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    <div>{row.query_title}</div>
                    <div style={{ marginTop: 5 }}>
                      {[...(row.phrases || []), ...(row.terms || [])].slice(0, 4).map((value) => (
                        <span key={value} style={{ ...evidenceChipStyle, margin: "0 3px 3px 0", background: "#FFF0A8", color: C.ink }}>{value}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, lineHeight: 1.55 }}><HighlightedText value={row.query_value} terms={[...(row.phrases || []), ...(row.terms || [])]} /></td>
                  <td style={{ ...tdStyle, lineHeight: 1.55 }}><HighlightedText value={row.candidate_value} terms={[...(row.phrases || []), ...(row.terms || [])]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty label="Không có nội dung EHR trùng để xếp hàng đối chiếu" />}
      </section>
    );
  }

  const rows = evidence.shared_lab_results || [];
  return (
    <section style={alignedSectionStyle}>
      {rows.length ? (
        <table style={alignedTableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 240 }}>Chỉ số/cận lâm sàng</th>
              <th style={thStyle}>Query · {queryId}</th>
              <th style={thStyle}>Bệnh nhân tương tự · {candidateId}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: "top" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{row.name}</td>
                <td style={tdStyle}>{formatLabResults(row.query_results)}</td>
                <td style={tdStyle}>{formatLabResults(row.candidate_results)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty label="Không có chỉ số/cận lâm sàng trùng tên để xếp hàng đối chiếu" />}
    </section>
  );
}

function formatLabResults(results) {
  return (results || []).map((result) => (
    <div key={`${result.date}-${result.value}`} style={{ color: result.flagged ? C.red : C.ink }}>
      <span style={{ color: C.inkFaint }}>{result.date}: </span>{result.value} {result.unit}
    </div>
  ));
}

const evidenceBarStyle = { minHeight: 36, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "7px 22px", background: "#FBFCFD", borderBottom: `1px solid ${C.border}` };
const focusPanelStyle = { display: "flex", alignItems: "flex-start", gap: 9, flexWrap: "wrap", padding: "9px 22px", background: "#F4FBF9", borderBottom: `1px solid ${C.border}`, color: C.inkMuted, fontSize: 11 };
const alignedSectionStyle = { flex: 1, overflow: "auto", padding: 18, background: C.bg };
const alignedTableStyle = { width: "100%", minWidth: 760, borderCollapse: "collapse", background: "white", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontSize: 12 };
