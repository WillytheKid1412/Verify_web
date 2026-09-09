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

const { buildSimilarityEvidence, listComparisonQueries } = await import("../src/data/comparison.js");

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
