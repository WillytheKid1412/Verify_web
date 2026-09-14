import { readText } from "./file.js";

export function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

export function readCsv(filePath) {
  const lines = readText(filePath).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines.length ? parseCsvLine(lines[0]) : [];
  const rows = lines.slice(1).filter((line) => line.trim()).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
  return { header, rows };
}

export function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function toCsv(rows, columns) {
  const cols = columns ?? Object.keys(rows[0] || {});
  return [cols.join(","), ...rows.map((row) => cols.map((column) => csvCell(row[column])).join(","))].join("\n");
}
