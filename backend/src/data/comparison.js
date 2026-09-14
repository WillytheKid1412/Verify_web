import { getPatient } from "./rawPatients.js";
import { findPair, getContext, listQueries } from "../repositories/retrievalRepository.js";
import { saveReview } from "../repositories/reviewRepository.js";
import { normalize, phraseSet, tokenize } from "../utils/text.js";

const STOP_WORDS = new Set([
  "bệnh", "nhân", "điều", "trị", "chẩn", "đoán", "không", "có", "của",
  "cho", "và", "với", "trong", "ngoài", "được", "theo", "sau", "trước",
  "tại", "này", "đến", "vào", "ra", "viện", "khoa", "ngày", "tháng",
  "năm", "một", "các", "những", "hiện", "tiền", "sử", "tình", "trạng",
  "the", "patient", "normal", "âm", "tính", "dương", "ghi", "nhận",
  "bình", "thường", "cấp", "cứu", "khám", "kết", "quả", "lần",
]);
const EHR_METADATA_LABELS = new Set([
  "số bệnh án", "số vào viện", "mã bệnh án", "ngày vào viện", "ngày ra viện",
  "khoa điều trị", "kết quả điều trị",
]);
const EHR_BOILERPLATE_LABELS = new Set([
  "khám tổn thương", "diễn biến lâm sàng", "hướng điều trị", "phương pháp điều trị",
]);

function clinicalTokens(value) {
  return tokenize(value, { minLength: 2, stopWords: STOP_WORDS });
}

function clinicalFields(patient) {
  const fields = [];
  for (const record of patient.records || []) {
    for (const [title, value] of record.ehr?.details || []) {
      const normalizedTitle = normalize(title);
      if (EHR_METADATA_LABELS.has(normalizedTitle) || EHR_BOILERPLATE_LABELS.has(normalizedTitle)) continue;
      const tokens = clinicalTokens(value);
      if (tokens.length) fields.push({ title, value: String(value), tokens });
    }
  }
  return fields;
}

function fieldOverlap(queryField, candidateField) {
  if (normalize(queryField.title) !== normalize(candidateField.title)) return null;
  const queryTerms = new Set(queryField.tokens);
  const candidateTerms = new Set(candidateField.tokens);
  const terms = [...queryTerms].filter((term) => candidateTerms.has(term))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const candidatePhrases = phraseSet(candidateField.tokens);
  const phrases = [...phraseSet(queryField.tokens)].filter((phrase) => candidatePhrases.has(phrase))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (!phrases.length && terms.length < 2) return null;
  return {
    query_title: queryField.title,
    candidate_title: candidateField.title,
    query_value: queryField.value,
    candidate_value: candidateField.value,
    terms: terms.slice(0, 8),
    phrases: phrases.slice(0, 4),
    score: 3 + terms.length + phrases.reduce((total, phrase) => total + phrase.split(" ").length * 3, 0),
  };
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
  const ehrKeywords = [...new Set(matchedEhr.flatMap((match) => match.terms))].slice(0, 16);
  const ehrPhrases = [...new Set(matchedEhr.flatMap((match) => match.phrases))].slice(0, 12);
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
    ehr_keywords: ehrKeywords,
    ehr_phrases: ehrPhrases,
    ehr_exact_phrases: ehrPhrases,
    ehr_fuzzy_phrases: [],
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
  const query = await getPatient(patientId);
  if (!query) {
    const error = new Error(`Không đọc được dữ liệu query ${patientId} từ PostgreSQL.`);
    error.status = 404;
    throw error;
  }
  return { query, candidates: context.candidates, batch: context.batch };
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
  return patient ? {
    ...retrievalCandidate,
    patient,
    similarity_evidence: retrievalCandidate.observable_overlap
      || buildSimilarityEvidence(query, patient, retrievalCandidate),
  } : null;
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
