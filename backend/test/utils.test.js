import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { shuffle } from "../src/utils/array.js";
import { parseCsvLine, readCsv, toCsv } from "../src/utils/csv.js";
import { isSafeSegment, readJson, writeJson } from "../src/utils/file.js";
import { formatDate, isFlagged } from "../src/utils/format.js";
import { assertAllowed, httpError } from "../src/utils/http.js";
import { normalize, phraseSet, tokenize } from "../src/utils/text.js";

test("parses and serializes CSV with quoted commas", () => {
  assert.deepEqual(parseCsvLine('a,"b,c","d""e"'), ["a", "b,c", "d\"e"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-csv-"));
  const file = path.join(dir, "rows.csv");
  fs.writeFileSync(file, "\uFEFFname,note\nCRP,\"a,b\"\n");
  assert.deepEqual(readCsv(file), { header: ["name", "note"], rows: [{ name: "CRP", note: "a,b" }] });
  assert.equal(toCsv([{ name: "CRP", note: "a,b" }], ["name", "note"]), "name,note\n\"CRP\",\"a,b\"");
});

test("normalizes Vietnamese text and builds phrases", () => {
  assert.equal(normalize("  Viêm Phổi  "), "viêm phổi");
  assert.deepEqual(tokenize("Viêm phổi thùy dưới", { stopWords: new Set(["dưới"]) }), ["viêm", "phổi", "thùy"]);
  assert.deepEqual([...phraseSet(["viêm", "phổi", "thùy"])], ["viêm phổi thùy", "viêm phổi", "phổi thùy"]);
});

test("formats dates and flags lab outliers", () => {
  assert.equal(formatDate("20250714"), "2025-07-14");
  assert.equal(formatDate("2025-07-14 00:00:00"), "2025-07-14");
  assert.equal(isFlagged("3.7", "4 - 10"), true);
  assert.equal(isFlagged("6.2", "4 - 10"), false);
});

test("guards path segments and JSON fallback", () => {
  assert.equal(isSafeSegment("24179852"), true);
  assert.equal(isSafeSegment("../secret"), false);
  const missing = path.join(os.tmpdir(), "verify-missing.json");
  assert.deepEqual(readJson(missing, { ok: false }), { ok: false });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "verify-json-")), "data.json");
  writeJson(file, { a: 1 });
  assert.deepEqual(readJson(file), { a: 1 });
});

test("http helpers throw status-aware errors", () => {
  assert.throws(() => httpError(404, "missing"), (error) => error.status === 404 && error.message === "missing");
  assert.throws(() => assertAllowed("nope", ["ok"], "bad"), (error) => error.status === 400);
  assert.equal(assertAllowed("ok", ["ok"], "bad"), "ok");
  const shuffled = shuffle([1, 2, 3]);
  assert.deepEqual([...shuffled].sort(), [1, 2, 3]);
});
