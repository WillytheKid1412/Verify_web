export function formatDate(value) {
  const text = String(value || "");
  if (/^\d{8}/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text.slice(0, 10) || "—";
}

export function isFlagged(value, referenceRange) {
  const result = Number.parseFloat(value);
  const bounds = String(referenceRange || "").match(/-?\d+(?:[.,]\d+)?/g)?.map((item) => Number.parseFloat(item.replace(",", ".")));
  return Number.isFinite(result) && bounds?.length >= 2 && (result < bounds[0] || result > bounds[1]);
}
