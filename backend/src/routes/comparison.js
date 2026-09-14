import { Router } from "express";
import {
  getComparisonCandidate,
  getComparisonExport,
  getComparisonSession,
  listComparisonQueries,
  saveComparisonDecision,
} from "../data/comparison.js";
import { toCsv } from "../utils/csv.js";
import { assertAllowed, httpError, wrapRoute } from "../utils/http.js";

const router = Router();
const allowed = ["pending", "very_similar", "similar", "uncertain", "dissimilar", "very_dissimilar"];

router.get("/", wrapRoute((req, res) => {
  res.json(getComparisonSession(req.query.query_patient_id));
}));

router.get("/queries", wrapRoute((req, res) => {
  res.json(listComparisonQueries());
}));

router.get("/export", wrapRoute((req, res) => {
  const rows = getComparisonExport(req.query.query_patient_id);
  if (req.query.format === "csv") {
    const columns = Object.keys(rows[0] || {
      query_patient_id: "", similar_patient_id: "", rank: "", similarity_score: "",
      review_level: "", note: "", reviewer: "", reviewed_at: "",
    });
    res.attachment("comparison-results.csv").type("text/csv; charset=utf-8").send(`\uFEFF${toCsv(rows, columns)}`);
    return;
  }
  res.attachment("comparison-results.json").json(rows);
}));

router.get("/:similarPatientId", wrapRoute((req, res) => {
  const candidate = getComparisonCandidate(req.query.query_patient_id, req.params.similarPatientId);
  if (!candidate) httpError(404, "Không tìm thấy bệnh nhân tương tự trong phiên hiện tại");
  res.json(candidate);
}));

router.post("/:similarPatientId/verify", wrapRoute((req, res) => {
  const { status, note, reviewer, query_patient_id: queryPatientId } = req.body || {};
  assertAllowed(status, allowed, "Trạng thái không hợp lệ");
  const saved = saveComparisonDecision(queryPatientId, req.params.similarPatientId, { status, note, reviewer });
  if (!saved) httpError(404, "Không tìm thấy bệnh nhân tương tự");
  res.json(saved);
}));

export default router;
