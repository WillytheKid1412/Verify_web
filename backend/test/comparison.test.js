import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "verify-web-test-"));
const topkPath = path.join(temporary, "top20.csv");
const queryIds = ["q1", "q2", "q3", "q4", "q5"];
fs.writeFileSync(topkPath, [
  "query_patient_id,query_split,rank,related_patient_id,related_split,cosine_similarity,shares_primary_icd_group,shared_primary_icd_groups",
  ...queryIds.flatMap((queryId) => Array.from({ length: 6 }, (_, index) => {
    const rank = index + 1;
    return `${queryId},test,${rank},${queryId}-c${rank},train,${0.95 - rank / 100},${rank === 1 ? "True" : "False"},${rank === 1 ? "I63" : ""}`;
  })),
].join("\n"));
const retrievalPath = path.join(temporary, "retrieval.json");
fs.writeFileSync(retrievalPath, JSON.stringify({ query_patient_ids: queryIds }));
process.env.TOPK_FILE = topkPath;
process.env.RETRIEVAL_FILE = retrievalPath;
process.env.QUERY_PATIENT_ID = "q1";
process.env.DATA_DIR = path.join(temporary, "decisions");

const { buildComparisonExportRow, buildSimilarityEvidence, listComparisonQueries } = await import("../src/data/comparison.js");

test("loads query catalogue from the Top-K CSV", () => {
  const catalogue = listComparisonQueries();
  assert.equal(catalogue.default_query_patient_id, "q1");
  assert.equal(catalogue.queries.length, 5);
  assert.ok(catalogue.queries.every((query) => query.candidate_count === 5));
});

test("builds auditable overlap evidence", () => {
  const patient = ({ id, ehr, labs, modalities }) => ({
    id,
    records: [{
      ehr: { details: [["Chẩn đoán", ehr]] },
      labs,
      studies: {
        XQ: modalities.includes("XQ") ? [{ id: "x" }] : [],
        CT: modalities.includes("CT") ? [{ id: "c" }] : [],
        MRI: [],
      },
    }],
  });
  const query = patient({
    id: "q1", ehr: "Viêm phổi thùy dưới", modalities: ["XQ", "CT"],
    labs: [{ name: "CRP", flagged: true }, { name: "Glucose", flagged: false }],
  });
  const candidate = patient({
    id: "c1", ehr: "Theo dõi viêm phổi", modalities: ["XQ"],
    labs: [{ name: "CRP", flagged: true }],
  });
  const evidence = buildSimilarityEvidence(query, candidate, {
    shared_primary_icd_groups: ["J18"],
  });
  assert.deepEqual(evidence.shared_primary_icd_groups, ["J18"]);
  assert.ok(evidence.ehr_exact_phrases.some((phrase) => phrase.includes("viêm phổi")));
  assert.deepEqual(evidence.shared_labs, ["CRP"]);
  assert.deepEqual(evidence.shared_abnormal_labs, ["CRP"]);
  assert.deepEqual(evidence.shared_modalities, ["XQ"]);
});

test("exports nine criterion scores, overall score, and legacy review separately", () => {
  const candidate = { patient_id: "q1-c1", rank: 1, similarity_score: 0.94, shared_primary_icd_groups: ["I63"] };
  const scores = {
    symptoms: 1, diagnosis: 2, medications: 3, ct: 4, xq: 5, mri: 1,
    clinical_course: 2, severity: 3, lab_results: 4,
  };
  const row = buildComparisonExportRow("q1", candidate, {
    criteria_scores: scores, overall_similarity: 5, note: "Đã đối chiếu", reviewer: "doctor01", at: "2026-09-16T00:00:00.000Z",
  });
  assert.deepEqual(Object.fromEntries(Object.keys(scores).map((key) => [key, row[`${key}_score`]])), scores);
  assert.equal(row.overall_similarity, 5);
  assert.equal(row.legacy_review_level, "");
  assert.equal(row.reviewer, "doctor01");
  assert.equal(buildComparisonExportRow("q1", candidate, { status: "similar" }).legacy_review_level, "similar");
  assert.equal(buildComparisonExportRow("q1", candidate, { status: "similar" }).overall_similarity, null);
});
