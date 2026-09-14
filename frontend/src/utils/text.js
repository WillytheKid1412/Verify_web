export function normalizeText(value) {
  return String(value || "").normalize("NFC").toLocaleLowerCase("vi").trim();
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isEhrMetadata(title) {
  return new Set([
    "số bệnh án",
    "số vào viện",
    "mã bệnh án",
    "ngày vào viện",
    "ngày ra viện",
    "khoa điều trị",
    "kết quả điều trị",
  ]).has(normalizeText(title));
}
