import { getPatient } from "./rawPatients.js";
import { findPair, getContext, listQueries } from "../repositories/retrievalRepository.js";
import { saveReview } from "../repositories/reviewRepository.js";
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

async function resolveQueryId(queryPatientId, actor) {
  if (queryPatientId) return String(queryPatientId);
  const listing = await listQueries(actor);
  return listing.queries[0]?.patient_id || "";
}

async function loadContext(queryPatientId, actor) {
  const patientId = await resolveQueryId(queryPatientId, actor);
  const context = patientId ? await getContext(patientId, actor) : null;
  if (!context) {
    const error = new Error("Không tìm thấy query được phân quyền trong batch đang hoạt động.");
    error.status = 404;
    throw error;
  }
  if (context.candidates.length !== 20 || context.candidates.some((item, index) => item.rank !== index + 1)) {
    const error = new Error(`Query ${patientId} chưa có đủ rank 1-20 trong retrieval run.`);
    error.status = 409;
    throw error;
  }
  const patient = await getPatient(patientId);
  if (!patient) {
    const error = new Error(`Không đọc được dữ liệu query ${patientId} từ PostgreSQL.`);
    error.status = 404;
    throw error;
  }
  return { query: patient, candidates: context.candidates, batch: context.batch };
}

export async function listComparisonQueries(actor) {
  const listing = await listQueries(actor);
  return {
    default_query_patient_id: listing.queries[0]?.patient_id || null,
    source: listing.batch ? `retrieval-run:${listing.batch.run_id}` : null,
    batch: listing.batch ? { id: listing.batch.id, name: listing.batch.name } : null,
    queries: listing.queries,
  };
}

export async function getComparisonSession(queryPatientId, actor) {
  const { query, candidates, batch } = await loadContext(queryPatientId, actor);
  return {
    query,
    retrieval_source: `retrieval-run:${batch.run_id}`,
    batch: { id: batch.id, name: batch.name },
    candidates,
  };
}

export async function getComparisonCandidate(queryPatientId, similarPatientId, actor) {
  const { query, candidates } = await loadContext(queryPatientId, actor);
  const retrievalCandidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!retrievalCandidate) return null;
  const patient = await getPatient(similarPatientId);
  if (!patient) return null;
  return {
    ...retrievalCandidate,
    patient,
    similarity_evidence: retrievalCandidate.observable_overlap
      || buildSimilarityEvidence(query, patient, retrievalCandidate),
  };
}

export async function saveComparisonDecision(queryPatientId, similarPatientId, payload, actor, requestContext = {}) {
  const pair = await findPair(queryPatientId, similarPatientId, actor);
  if (!pair) return null;
  const saved = await saveReview({
    pairId: pair.pair_id,
    reviewer: actor,
    status: payload.status,
    note: payload.note,
    expectedVersion: payload.version,
    requestId: requestContext.requestId,
    ip: requestContext.ip,
  });
  return {
    queryPatientId,
    similarPatientId,
    rank: pair.rank,
    similarityScore: pair.similarity_score,
    ...saved,
  };
}

export async function getComparisonExport(queryPatientId, actor) {
  const { query, candidates } = await loadContext(queryPatientId, actor);
  return candidates.map((candidate) => {
    const review = candidate.verification || {};
    return {
      query_patient_id: query.id,
      similar_patient_id: candidate.patient_id,
      rank: candidate.rank,
      similarity_score: candidate.similarity_score,
      shared_primary_icd_groups: (candidate.shared_primary_icd_groups || []).join("|"),
      review_level: review.status || "pending",
      note: review.note || "",
      reviewer: review.reviewer || "",
      reviewed_at: review.at || "",
    };
  });
}
