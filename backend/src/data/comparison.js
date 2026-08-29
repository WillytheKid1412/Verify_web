import fs from "fs";
import { fileURLToPath } from "url";
import { getPatient } from "./rawPatients.js";
import { getVerification, setVerification } from "./store.js";

const RETRIEVAL_FILE = fileURLToPath(new URL("./retrieval.json", import.meta.url));

function loadContext() {
  let retrieval;
  try {
    retrieval = JSON.parse(fs.readFileSync(RETRIEVAL_FILE, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được retrieval.json: ${error.message}`);
  }
  if (!retrieval?.patient_id || !Array.isArray(retrieval.similar_patients)) {
    throw new Error("retrieval.json phải có patient_id và mảng similar_patients.");
  }
  const query = getPatient(String(retrieval.patient_id));
  if (!query) throw new Error(`Không đọc được query ${retrieval.patient_id} trong data/raw.`);
  const candidates = retrieval.similar_patients.map((item, index) => ({
    rank: Number.isInteger(item.rank) ? item.rank : index + 1,
    patient_id: String(item.patient_id || ""),
    similarity_score: Number(item.similarity_score),
  })).filter((item) => item.patient_id && Number.isFinite(item.similarity_score));
  return { query, candidates };
}

function withVerification(queryId, candidate) {
  return { ...candidate, verification: getVerification(`${queryId}:${candidate.patient_id}`) };
}

export function getComparisonSession() {
  const { query, candidates } = loadContext();
  return { query, candidates: candidates.map((candidate) => withVerification(query.id, candidate)) };
}

export function getComparisonCandidate(similarPatientId) {
  const { query, candidates } = loadContext();
  const candidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!candidate) return null;
  const patient = getPatient(similarPatientId);
  return patient ? { ...withVerification(query.id, candidate), patient } : null;
}

export function saveComparisonDecision(similarPatientId, payload) {
  const { query, candidates } = loadContext();
  const candidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!candidate) return null;
  const saved = setVerification(`${query.id}:${similarPatientId}`, payload);
  return { queryPatientId: query.id, similarPatientId, rank: candidate.rank, similarityScore: candidate.similarity_score, ...saved };
}

export function getComparisonExport() {
  const { query, candidates } = loadContext();
  return candidates.map((candidate) => {
    const review = getVerification(`${query.id}:${candidate.patient_id}`) || {};
    return {
      query_patient_id: query.id,
      similar_patient_id: candidate.patient_id,
      rank: candidate.rank,
      similarity_score: candidate.similarity_score,
      review_level: review.status || "pending",
      note: review.note || "",
      reviewer: review.reviewer || "",
      reviewed_at: review.at || "",
    };
  });
}
