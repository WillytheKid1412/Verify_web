import fs from "fs";
import path from "path";

// Thư mục lưu dữ liệu có thể ghi đè bằng env DATA_DIR (dùng cho Docker volume).
// KHÔNG dùng chung thư mục với code nguồn (src/data) để tránh volume đè mất code.
const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DB_FILE = path.join(DATA_DIR, "verifications.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getVerifications() {
  return readAll();
}

export function getVerification(patientId) {
  const all = readAll();
  return all[patientId] || null;
}

export function setVerification(patientId, { status, note, reviewer }) {
  const all = readAll();
  all[patientId] = {
    status,
    note: note || "",
    reviewer: reviewer || "unknown",
    at: new Date().toISOString(),
  };
  writeAll(all);
  return all[patientId];
}
