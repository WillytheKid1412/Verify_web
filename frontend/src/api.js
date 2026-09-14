const API_URL = import.meta.env.VITE_API_URL || "/api";
export const API_ORIGIN = API_URL.startsWith("http") ? API_URL.replace(/\/api$/, "") : "";

const queryParam = (queryPatientId) => queryPatientId
  ? `query_patient_id=${encodeURIComponent(queryPatientId)}` : "";

async function apiFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "include" });
  if (response.status === 401) window.dispatchEvent(new Event("auth-expired"));
  return response;
}

async function responseError(response, fallbackMessage) {
  try {
    const body = await response.json();
    return body?.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function requestJson(url, fallbackMessage, options) {
  let response;
  try {
    response = await apiFetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Không kết nối được API. Hãy kiểm tra backend và reverse proxy.");
  }
  if (!response.ok) throw new Error(await responseError(response, fallbackMessage));
  try {
    return await response.json();
  } catch {
    throw new Error("API không trả JSON hợp lệ.");
  }
}

export async function login(username, password) {
  const data = await requestJson(`${API_URL}/auth/login`, "Không đăng nhập được", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return data.user;
}

export async function fetchCurrentUser() {
  try {
    const response = await apiFetch(`${API_URL}/auth/me`);
    if (!response.ok) return null;
    return (await response.json()).user;
  } catch {
    return null;
  }
}

export async function logout() {
  await apiFetch(`${API_URL}/auth/logout`, { method: "POST" });
}

export async function fetchUsers() {
  const data = await requestJson(`${API_URL}/auth/users`, "Không tải được danh sách tài khoản");
  return data.users;
}

export async function createAccount(payload) {
  const data = await requestJson(`${API_URL}/auth/users`, "Không tạo được tài khoản", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function downloadComparisonExport(format, queryPatientId) {
  const response = await apiFetch(
    `${API_URL}/comparison/export?format=${format}&${queryParam(queryPatientId)}`,
  );
  if (!response.ok) throw new Error(await responseError(response, "Không tải được file kết quả"));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `comparison-results-${queryPatientId}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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

export async function submitComparisonVerification(queryPatientId, id, { status, note, version }) {
  return requestJson(
    `${API_URL}/comparison/${encodeURIComponent(id)}/verify`,
    "Không lưu được kết quả xác minh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query_patient_id: queryPatientId, status, note, version }),
    },
  );
}
