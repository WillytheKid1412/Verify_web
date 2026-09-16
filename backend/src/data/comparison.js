import fs from "fs";
import { fileURLToPath } from "url";
import { getPatient } from "./rawPatients.js";
import { getVerification, setComparisonVerification } from "./store.js";
import { REVIEW_CRITERIA } from "./reviewSchema.js";

const RETRIEVAL_FILE = process.env.RETRIEVAL_FILE
  || fileURLToPath(new URL("./retrieval.json", import.meta.url));
const TOPK_FILE = process.env.TOPK_FILE || "";
const DEFAULT_QUERY_PATIENT_ID = process.env.QUERY_PATIENT_ID || "";
const QUERY_LIMIT = 5;
const CANDIDATE_LIMIT = 5;
const STOP_WORDS = new Set([
  "bệnh", "nhân", "điều", "trị", "chẩn", "đoán", "không", "có", "của",
  "cho", "và", "với", "trong", "ngoài", "được", "theo", "sau", "trước",
  "tại", "này", "đến", "vào", "ra", "viện", "ngày", "tháng",
  "năm", "một", "các", "những", "hiện", "tiền", "sử", "tình", "trạng",
  "the", "patient", "normal", "âm", "tính", "dương", "ghi", "nhận",
  "bình", "thường", "khám", "kết", "quả", "lần",
]);

const EHR_METADATA_LABELS = new Set([
  "số bệnh án", "số vào viện", "mã bệnh án", "ngày vào viện", "ngày ra viện",
]);

const EHR_BOILERPLATE_LABELS = new Set([
  // "khám tổn thương", "diễn biến lâm sàng", "hướng điều trị", "phương pháp điều trị",
]);

let topkCache = null;

function readQuerySelection() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(RETRIEVAL_FILE, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được cấu hình query ${RETRIEVAL_FILE}: ${error.message}`);
  }
  const selected = Array.isArray(config?.query_patient_ids)
    ? [...new Set(config.query_patient_ids.map((id) => String(id).trim()).filter(Boolean))]
    : [];
  if (selected.length !== QUERY_LIMIT) {
    throw new Error(`retrieval.json phải chứa đúng ${QUERY_LIMIT} query_patient_ids duy nhất.`);
  }
  return selected;
}

function parseCsvLine(line) {
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

function readTopkIndex() {
  if (!TOPK_FILE || !fs.statSync(TOPK_FILE, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("TOPK_FILE phải trỏ tới CSV Top-20 hợp lệ; ứng dụng không dùng dữ liệu retrieval dự phòng.");
  }
  const stat = fs.statSync(TOPK_FILE);
  if (topkCache?.mtimeMs === stat.mtimeMs && topkCache?.size === stat.size) return topkCache.value;
  const lines = fs.readFileSync(TOPK_FILE, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`Top-K CSV không có dữ liệu: ${TOPK_FILE}`);
  const header = parseCsvLine(lines[0]);
  const required = [
    "query_patient_id", "query_split", "rank", "related_patient_id",
    "related_split", "cosine_similarity", "shares_primary_icd_group",
    "shared_primary_icd_groups",
  ];
  const positions = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]));
  const missing = required.filter((name) => positions[name] < 0);
  if (missing.length) throw new Error(`Top-K CSV thiếu cột: ${missing.join(", ")}`);

  const byQuery = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const queryId = String(cells[positions.query_patient_id] || "").trim();
    const patientId = String(cells[positions.related_patient_id] || "").trim();
    const rank = Number(cells[positions.rank]);
    const similarityScore = Number(cells[positions.cosine_similarity]);
    if (!queryId || !patientId || !Number.isInteger(rank) || !Number.isFinite(similarityScore)) continue;
    const candidate = {
      rank,
      patient_id: patientId,
      similarity_score: similarityScore,
      query_split: String(cells[positions.query_split] || ""),
      related_split: String(cells[positions.related_split] || ""),
      shares_primary_icd_group: String(cells[positions.shares_primary_icd_group]).toLowerCase() === "true",
      shared_primary_icd_groups: String(cells[positions.shared_primary_icd_groups] || "").split("|").filter(Boolean),
    };
    if (!byQuery.has(queryId)) byQuery.set(queryId, []);
    byQuery.get(queryId).push(candidate);
  }
  for (const [queryId, candidates] of byQuery.entries()) {
    const topFive = candidates
      .sort((left, right) => left.rank - right.rank)
      .filter((candidate) => candidate.rank >= 1 && candidate.rank <= CANDIDATE_LIMIT)
      .slice(0, CANDIDATE_LIMIT);
    byQuery.set(queryId, topFive);
  }
  const selectedIds = readQuerySelection();
  if (selectedIds.length) {
    const missing = selectedIds.filter((id) => !byQuery.has(id));
    if (missing.length) throw new Error(`Các query không có trong Top-K CSV: ${missing.join(", ")}`);
    const incomplete = selectedIds.filter((id) => {
      const ranks = byQuery.get(id).map((candidate) => candidate.rank);
      return ranks.length !== CANDIDATE_LIMIT
        || ranks.some((rank, index) => rank !== index + 1);
    });
    if (incomplete.length) {
      throw new Error(`Các query không có đủ rank 1-${CANDIDATE_LIMIT} trong CSV: ${incomplete.join(", ")}`);
    }
    for (const patientId of [...byQuery.keys()]) {
      if (!selectedIds.includes(patientId)) byQuery.delete(patientId);
    }
  }
  const queryOrder = selectedIds;
  const queries = queryOrder.map((patientId) => {
    const candidates = byQuery.get(patientId);
    return {
      patient_id: patientId,
      split: candidates[0]?.query_split || "",
      candidate_count: candidates.length,
    };
  });
  const value = { byQuery, queries, source: TOPK_FILE };
  topkCache = { mtimeMs: stat.mtimeMs, size: stat.size, value };
  return value;
}

function resolveContext(queryPatientId) {
  const topk = readTopkIndex();
  const requested = String(queryPatientId || DEFAULT_QUERY_PATIENT_ID || topk.queries[0]?.patient_id || "");
  const candidates = topk.byQuery.get(requested);
  if (!candidates) {
    const error = new Error(`Không có Top-5 cho bệnh nhân query ${requested}.`);
    error.status = 404;
    throw error;
  }
  return { patientId: requested, candidates, source: topk.source };
}

function loadContext(queryPatientId) {
  const context = resolveContext(queryPatientId);
  const query = getPatient(context.patientId);
  if (!query) throw new Error(`Không đọc được query ${context.patientId} trong data/raw.`);
  return { query, candidates: context.candidates, source: context.source };
}

function withVerification(queryId, candidate) {
  return { ...candidate, verification: getVerification(`${queryId}:${candidate.patient_id}`) };
}

function normalize(value) {
  return String(value || "").normalize("NFC").toLocaleLowerCase("vi").trim();
}

// Cắt tokens theo ranh giới câu (dấu . , ; và xuống dòng) để n-gram không băng qua câu khác nhau.
// Cần tokenize kèm theo vị trí ký tự ngắt câu trong text gốc, trước khi bỏ dấu câu đi.
function clauses(rawValue) {
  return normalize(rawValue)
    .split(/[.,;\n]+/)
    .map((clause) => (clause.match(/[\p{L}\p{N}]+/gu) || [])
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))
    .filter((tokens) => tokens.length >= 2);
}

function exactPhraseSet(rawValue) {
  const phrases = new Set();
  for (const clause of clauses(rawValue)) {
    for (const width of [8, 7, 6, 5, 4, 3, 2]) {
      for (let index = 0; index <= clause.length - width; index += 1) {
        phrases.add(clause.slice(index, index + width).join(" "));
      }
    }
  }
  return phrases;
}

function dedupeContained(phrases) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length); // dài trước
  const kept = [];
  for (const phrase of sorted) {
    const isContained = kept.some((longer) => longer.includes(phrase));
    if (!isContained) kept.push(phrase);
  }
  return kept;
}

// Levenshtein trên mảng token (không phải ký tự) — 1 "edit" = thêm/xóa/thay nguyên 1 từ.
function tokenLevelEditDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyPhraseMatch(queryPhrases, candidatePhrases) {
  const results = [];
  const usedCandidates = new Set();
  for (const qp of queryPhrases) {
    let best = null;
    for (const cp of candidatePhrases) {
      if (usedCandidates.has(cp)) continue;
      const qTokens = qp.split(" ");
      const cTokens = cp.split(" ");
      if (Math.abs(qTokens.length - cTokens.length) > 1) continue;
      const maxLen = Math.max(qTokens.length, cTokens.length);
      if (maxLen > 6) continue;
      const dist = tokenLevelEditDistance(qTokens, cTokens);
      if (dist > 1) continue;
      if (!best || dist < best.editDistance) best = { query: qp, candidate: cp, editDistance: dist };
    }
    if (best) {
      results.push(best);
      usedCandidates.add(best.candidate);
    }
  }
  return results;
}

function scoreOf(exact, fuzzy) {
  // Cụm dài + exact được ưu tiên hơn fuzzy; fuzzy bị trừ điểm theo editDistance.
  const exactScore = exact.reduce((total, phrase) => total + phrase.split(" ").length * 3, 0);
  const fuzzyScore = fuzzy.reduce((total, m) => total + Math.max(1, m.query.split(" ").length * 2 - m.editDistance), 0);
  return exactScore + fuzzyScore;
}

function fieldOverlap(queryField, candidateField) {
  if (normalize(queryField.title) !== normalize(candidateField.title)) return null;

  const qExact = exactPhraseSet(queryField.value);
  const cExact = exactPhraseSet(candidateField.value);
  const rawExact = [...qExact].filter((phrase) => cExact.has(phrase));
  const exact = dedupeContained(rawExact)
    .sort((left, right) => right.split(" ").length - left.split(" ").length);

  const remainingQ = [...qExact].filter((phrase) => !rawExact.includes(phrase));
  const remainingC = [...cExact].filter((phrase) => !rawExact.includes(phrase));
  const fuzzy = fuzzyPhraseMatch(remainingQ, remainingC);

  if (!exact.length && !fuzzy.length) return null;

  return {
    query_title: queryField.title,
    candidate_title: candidateField.title,
    query_value: queryField.value,
    candidate_value: candidateField.value,
    exact: exact.slice(0, 10),
    fuzzy: fuzzy.slice(0, 10),
    score: scoreOf(exact, fuzzy),
  };
}

function clinicalFields(patient) {
  const fields = [];
  for (const record of patient.records || []) {
    for (const [title, value] of record.ehr?.details || []) {
      const normalizedTitle = normalize(title);
      if (EHR_METADATA_LABELS.has(normalizedTitle) || EHR_BOILERPLATE_LABELS.has(normalizedTitle)) continue;
      if (String(value || "").trim()) fields.push({ title, value: String(value) });
    }
  }
  return fields;
}

function ehrMatches(query, candidate) {
  const matches = [];
  for (const queryField of clinicalFields(query)) {
    for (const candidateField of clinicalFields(candidate)) {
      const overlap = fieldOverlap(queryField, candidateField);
      if (overlap) matches.push(overlap);
    }
  }
  const bestByPair = new Map();
  for (const match of matches) {
    const key = `${normalize(match.query_title)}:${normalize(match.candidate_title)}`;
    if (!bestByPair.has(key) || bestByPair.get(key).score < match.score) bestByPair.set(key, match);
  }
  return [...bestByPair.values()]
    .sort((left, right) => right.score - left.score || left.query_title.localeCompare(right.query_title, "vi"))
    .slice(0, 12);
}

function patientLabs(patient) {
  const labs = new Map();
  for (const record of patient.records || []) {
    for (const lab of record.labs || []) {
      const key = normalize(lab.name);
      if (!key) continue;
      const current = labs.get(key) || { label: lab.name, abnormal: false, results: [] };
      current.abnormal ||= Boolean(lab.flagged);
      current.results.push({
        date: lab.date || "Không rõ ngày",
        value: lab.value ?? "—",
        unit: lab.unit || "",
        range: lab.range || "—",
        flagged: Boolean(lab.flagged),
      });
      labs.set(key, current);
    }
  }
  return labs;
}

function patientModalities(patient) {
  const modalities = new Set();
  for (const record of patient.records || []) {
    for (const modality of ["XQ", "CT", "MRI"]) {
      if ((record.studies?.[modality] || []).length) modalities.add(modality);
    }
  }
  return modalities;
}

export function buildSimilarityEvidence(query, candidate, retrievalCandidate) {
  const matchedEhr = ehrMatches(query, candidate);
  const ehrExactPhrases = [...new Set(matchedEhr.flatMap((match) => match.exact))].slice(0, 16);
  const ehrFuzzyPhrases = [...new Set(
    matchedEhr
      .filter((match) => !(match.exact || []).length) // chỉ field chưa có exact
      .flatMap((match) => match.fuzzy.map((m) => m.query))
  )].slice(0, 16);
  const queryLabs = patientLabs(query);
  const candidateLabs = patientLabs(candidate);
  const sharedLabKeys = [...queryLabs.keys()].filter((name) => candidateLabs.has(name));
  const sharedLabs = sharedLabKeys.map((name) => queryLabs.get(name).label)
    .sort((left, right) => left.localeCompare(right, "vi")).slice(0, 16);
  const sharedLabResults = sharedLabKeys.map((name) => ({
    name: queryLabs.get(name).label,
    query_results: [...queryLabs.get(name).results]
      .sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 3),
    candidate_results: [...candidateLabs.get(name).results]
      .sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 3),
  })).sort((left, right) => left.name.localeCompare(right.name, "vi")).slice(0, 16);
  const sharedAbnormalLabs = sharedLabKeys
    .filter((name) => queryLabs.get(name).abnormal && candidateLabs.get(name).abnormal)
    .map((name) => queryLabs.get(name).label)
    .sort((left, right) => left.localeCompare(right, "vi")).slice(0, 16);
  const queryModalities = patientModalities(query);
  const candidateModalities = patientModalities(candidate);
  return {
    kind: "observable_overlap",
    disclaimer: "Các mục này là bằng chứng trùng quan sát được, không phải giải thích nhân quả cho điểm model.",
    shared_primary_icd_groups: retrievalCandidate.shared_primary_icd_groups || [],
    ehr_exact_phrases: ehrExactPhrases,
    ehr_fuzzy_phrases: ehrFuzzyPhrases,
    ehr_matches: matchedEhr,
    shared_labs: sharedLabs,
    shared_lab_results: sharedLabResults,
    shared_abnormal_labs: sharedAbnormalLabs,
    shared_modalities: [...queryModalities].filter((name) => candidateModalities.has(name)),
  };
}

export function listComparisonQueries() {
  const topk = readTopkIndex();
  const defaultId = topk.byQuery.has(DEFAULT_QUERY_PATIENT_ID)
    ? DEFAULT_QUERY_PATIENT_ID : topk.queries[0]?.patient_id;
  return { default_query_patient_id: defaultId, source: topk.source, queries: topk.queries };
}

export function getComparisonSession(queryPatientId) {
  const { query, candidates, source } = loadContext(queryPatientId);
  return {
    query,
    retrieval_source: source,
    candidates: candidates.map((candidate) => withVerification(query.id, candidate)),
  };
}

export function getComparisonCandidate(queryPatientId, similarPatientId) {
  const { query, candidates } = loadContext(queryPatientId);
  const retrievalCandidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!retrievalCandidate) return null;
  const patient = getPatient(similarPatientId);
  return patient ? {
    ...withVerification(query.id, retrievalCandidate),
    patient,
    similarity_evidence: buildSimilarityEvidence(query, patient, retrievalCandidate),
  } : null;
}

export function saveComparisonDecision(queryPatientId, similarPatientId, payload) {
  const { query, candidates } = loadContext(queryPatientId);
  const candidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!candidate) return null;
  const saved = setComparisonVerification(`${query.id}:${similarPatientId}`, payload);
  return {
    queryPatientId: query.id,
    similarPatientId,
    rank: candidate.rank,
    similarityScore: candidate.similarity_score,
    ...saved,
  };
}

export function getComparisonExport(queryPatientId) {
  const { query, candidates } = loadContext(queryPatientId);
  return candidates.map((candidate) => {
    const review = getVerification(`${query.id}:${candidate.patient_id}`) || {};
    return buildComparisonExportRow(query.id, candidate, review);
  });
}

export function buildComparisonExportRow(queryId, candidate, review = {}) {
  return {
    query_patient_id: queryId,
    similar_patient_id: candidate.patient_id,
    rank: candidate.rank,
    similarity_score: candidate.similarity_score,
    shared_primary_icd_groups: (candidate.shared_primary_icd_groups || []).join("|"),
    ...Object.fromEntries(REVIEW_CRITERIA.map(([key]) => [`${key}_score`, review.criteria_scores?.[key] ?? null])),
    overall_similarity: review.overall_similarity ?? null,
    legacy_review_level: review.status || "",
    note: review.note || "",
    reviewer: review.reviewer || "",
    reviewed_at: review.at || "",
  };
}
