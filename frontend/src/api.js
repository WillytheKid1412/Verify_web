const API_URL = import.meta.env.VITE_API_URL || "/api";
export const API_ORIGIN = API_URL.startsWith("http") ? API_URL.replace(/\/api$/, "") : "";
const queryParam = (queryPatientId) => queryPatientId
  ? `query_patient_id=${encodeURIComponent(queryPatientId)}` : "";
export const comparisonExportUrl = (format, queryPatientId) =>
  `${API_URL}/comparison/export?format=${format}&${queryParam(queryPatientId)}`;

export async function requestJson(url, fallbackMessage, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Không kết nối được API. Hãy chạy backend rồi tải lại trang.");
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("API không trả JSON. Kiểm tra backend đang chạy (cổng 4000) hoặc mở frontend Docker tại http://localhost:5174.");
  }
  if (!response.ok) throw new Error(body?.error || fallbackMessage);
  return body;
}

export async function fetchComparisonQueries() {
  return requestJson(`${API_URL}/comparison/queries`, "Không tải được danh sách query");
}

export async function fetchComparison(queryPatientId) {
  const suffix = queryParam(queryPatientId);
  return requestJson(
    `${API_URL}/comparison${suffix ? `?${suffix}` : ""}`,
    "Không tải được phiên đối chiếu",
  );
}

export async function fetchComparisonCandidate(queryPatientId, id) {
  return requestJson(
    `${API_URL}/comparison/${encodeURIComponent(id)}?${queryParam(queryPatientId)}`,
    "Không tải được hồ sơ bệnh nhân tương tự",
  );
}

export async function submitComparisonVerification(queryPatientId, id, { status, note }) {
  return requestJson(
    `${API_URL}/comparison/${id}/verify`,
    "Không lưu được kết quả xác minh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query_patient_id: queryPatientId, status, note }),
    },
  );
}
