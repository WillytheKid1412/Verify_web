import { Router } from "express";
import {
  getComparisonCandidate,
  getComparisonExport,
  getComparisonSession,
  listComparisonQueries,
  saveComparisonDecision,
} from "../data/comparison.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const allowed = ["pending", "very_similar", "similar", "uncertain", "dissimilar", "very_dissimilar"];

router.get("/", (req, res, next) => {
  try { res.json(getComparisonSession(req.query.query_patient_id)); } catch (error) { next(error); }
});

router.get("/queries", (req, res, next) => {
  try { res.json(listComparisonQueries()); } catch (error) { next(error); }
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

router.get("/export", requireAdmin, (req, res, next) => {
  try {
    const rows = getComparisonExport(req.query.query_patient_id);
    if (req.query.format === "csv") {
      const columns = Object.keys(rows[0] || { query_patient_id: "", similar_patient_id: "", rank: "", similarity_score: "", review_level: "", note: "", reviewer: "", reviewed_at: "" });
      const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
      res.attachment("comparison-results.csv").type("text/csv; charset=utf-8").send(`\uFEFF${csv}`);
      return;
    }
    res.attachment("comparison-results.json").json(rows);
  } catch (error) { next(error); }
});

router.get("/:similarPatientId", (req, res) => {
  const candidate = getComparisonCandidate(req.query.query_patient_id, req.params.similarPatientId);
  if (!candidate) return res.status(404).json({ error: "Không tìm thấy bệnh nhân tương tự trong phiên hiện tại" });
  res.json(candidate);
});

router.post("/:similarPatientId/verify", (req, res) => {
  const { status, note, query_patient_id: queryPatientId } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
  const saved = saveComparisonDecision(queryPatientId, req.params.similarPatientId, {
    status, note, reviewer: req.user.username,
  });
  if (!saved) return res.status(404).json({ error: "Không tìm thấy bệnh nhân tương tự" });
  res.json(saved);
});

export default router;
