import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "verify-web-test-"));
const topkPath = path.join(temporary, "top20.csv");
fs.writeFileSync(topkPath, [
  "query_patient_id,query_split,rank,related_patient_id,related_split,cosine_similarity,shares_primary_icd_group,shared_primary_icd_groups",
  "q1,test,1,c1,train,0.91,True,I63",
  "q1,test,2,c2,validation,0.88,False,",
].join("\n"));
const retrievalPath = path.join(temporary, "retrieval.json");
fs.writeFileSync(retrievalPath, JSON.stringify({ query_patient_ids: ["q1"] }));
process.env.TOPK_FILE = topkPath;
process.env.RETRIEVAL_FILE = retrievalPath;
process.env.QUERY_PATIENT_ID = "q1";
process.env.DATA_DIR = path.join(temporary, "decisions");

const { buildSimilarityEvidence, listComparisonQueries } = await import("../src/data/comparison.js");

test("loads query catalogue from the Top-K CSV", () => {
  const catalogue = listComparisonQueries();
  assert.equal(catalogue.default_query_patient_id, "q1");
  assert.deepEqual(catalogue.queries, [
    { patient_id: "q1", split: "test", candidate_count: 2 },
  ]);
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
  assert.ok(evidence.ehr_keywords.includes("viêm"));
  assert.ok(evidence.ehr_keywords.includes("phổi"));
  assert.deepEqual(evidence.shared_labs, ["CRP"]);
  assert.deepEqual(evidence.shared_abnormal_labs, ["CRP"]);
  assert.deepEqual(evidence.shared_modalities, ["XQ"]);
});
