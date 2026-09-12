import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilarityEvidence } from "../src/data/comparison.js";

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
