import retrieval from "./retrieval.json" with { type: "json" };
import { generatePatients } from "./patients.js";
import { getVerification, setVerification } from "./store.js";
import { SAMPLE_PATIENT } from "./sample.js";

const seedPatients = generatePatients(21);

function makePatient(id, index) {
  const source = seedPatients[index % seedPatients.length];
  const records = [
    { id: "25.052970", label: "Bệnh án 25.052970", date: source.admitted },
    { id: "24.110251", label: "Bệnh án 24.110251", date: "2025-11-02" },
  ];
  return {
    ...source,
    id,
    records,
    ehr: { complaint: source.complaint, diagnosis: source.dx, history: source.history, medications: source.medications, allergies: source.allergies },
    studies: {
      XQ: [{ id: "xq-1", label: "XQ ngực thẳng", date: source.admitted, imageCount: 2 }],
      CT: [{ id: "ct-1", label: "CT ngực", date: source.admitted, series: ["Mediastinum", "Lung window"] }],
      MRI: [{ id: "mri-1", label: "MRI vùng khảo sát", date: source.admitted, series: ["T2 sagittal", "T2 axial"] }],
    },
  };
}

const query = makePatient(retrieval.patient_id, 0);
const candidates = retrieval.similar_patients.map((item, index) => ({
  ...item,
  patient: makePatient(item.patient_id, index + 1),
}));

export function getComparisonSession() {
  if (process.env.DEMO_SAMPLE === "true") return { query: SAMPLE_PATIENT, candidates: [{ rank: 1, patient_id: SAMPLE_PATIENT.id, similarity_score: 1, patient: { ...SAMPLE_PATIENT, verification: getVerification(`${SAMPLE_PATIENT.id}:${SAMPLE_PATIENT.id}`) } }] };
  return {
    query,
    candidates: candidates.map(({ patient, ...candidate }) => ({
      ...candidate,
      patient: { ...patient, verification: getVerification(`${query.id}:${patient.id}`) },
    })),
  };
}

export function saveComparisonDecision(similarPatientId, payload) {
  if (process.env.DEMO_SAMPLE === "true" && similarPatientId === SAMPLE_PATIENT.id) {
    const saved = setVerification(`${SAMPLE_PATIENT.id}:${SAMPLE_PATIENT.id}`, payload);
    return { queryPatientId: SAMPLE_PATIENT.id, similarPatientId, rank: 1, similarityScore: 1, ...saved };
  }
  const candidate = candidates.find((item) => item.patient_id === similarPatientId);
  if (!candidate) return null;
  const saved = setVerification(`${query.id}:${similarPatientId}`, payload);
  return { queryPatientId: query.id, similarPatientId, rank: candidate.rank, similarityScore: candidate.similarity_score, ...saved };
}
