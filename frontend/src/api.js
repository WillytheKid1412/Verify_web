const API_URL = import.meta.env.VITE_API_URL || "/api";
export const API_ORIGIN = API_URL.startsWith("http") ? API_URL.replace(/\/api$/, "") : "";
export const comparisonExportUrl = (format) => `${API_URL}/comparison/export?format=${format}`;

export async function fetchPatientList() {
  const res = await fetch(`${API_URL}/patients`);
  if (!res.ok) throw new Error("Không tải được danh sách bệnh nhân");
  return res.json();
}

export async function fetchPatientDetail(id) {
  const res = await fetch(`${API_URL}/patients/${id}`);
  if (!res.ok) throw new Error("Không tải được chi tiết bệnh nhân");
  return res.json();
}

export async function submitVerification(id, { status, note }) {
  const res = await fetch(`${API_URL}/patients/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!res.ok) throw new Error("Không lưu được kết quả xác minh");
  return res.json();
}

export async function fetchComparison() {
  const res = await fetch(`${API_URL}/comparison`);
  if (!res.ok) throw new Error("Không tải được phiên đối chiếu");
  return res.json();
}

export async function fetchComparisonCandidate(id) {
  const res = await fetch(`${API_URL}/comparison/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Không tải được hồ sơ bệnh nhân tương tự");
  return res.json();
}

export async function submitComparisonVerification(id, { status, note }) {
  const res = await fetch(`${API_URL}/comparison/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!res.ok) throw new Error("Không lưu được kết quả xác minh");
  return res.json();
}
