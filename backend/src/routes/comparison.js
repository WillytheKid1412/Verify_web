import { Router } from "express";
import {
  getComparisonCandidate,
  getComparisonExport,
  getComparisonSession,
  listComparisonQueries,
  saveComparisonDecision,
} from "../data/comparison.js";
import { requireAdmin } from "../middleware/auth.js";
import { recordAudit } from "../repositories/auditRepository.js";

const router = Router();
const allowed = ["pending", "very_similar", "similar", "uncertain", "dissimilar", "very_dissimilar"];

router.get("/", async (req, res, next) => {
  try { res.json(await getComparisonSession(req.query.query_patient_id, req.user)); } catch (error) { next(error); }
});

router.get("/queries", async (req, res, next) => {
  try { res.json(await listComparisonQueries(req.user)); } catch (error) { next(error); }
});

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

router.get("/export", requireAdmin, async (req, res, next) => {
  try {
    const rows = await getComparisonExport(req.query.query_patient_id, req.user);
    await recordAudit({
      actorId: req.user.id,
      action: "comparison.exported",
      resourceType: "verification_batch",
      metadata: { format: req.query.format === "csv" ? "csv" : "json", queryPatientId: req.query.query_patient_id },
      requestId: req.id,
      ip: req.ip,
    });
    if (req.query.format === "csv") {
      const columns = Object.keys(rows[0] || { query_patient_id: "", similar_patient_id: "", rank: "", similarity_score: "", review_level: "", note: "", reviewer: "", reviewed_at: "" });
      const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
      res.attachment("comparison-results.csv").type("text/csv; charset=utf-8").send(`\uFEFF${csv}`);
      return;
    }
    res.attachment("comparison-results.json").json(rows);
  } catch (error) { next(error); }
});

router.get("/:similarPatientId", async (req, res, next) => {
  try {
    const candidate = await getComparisonCandidate(
      req.query.query_patient_id, req.params.similarPatientId, req.user,
    );
    if (!candidate) return res.status(404).json({ error: "Không tìm thấy bệnh nhân tương tự trong phiên hiện tại" });
    res.json(candidate);
  } catch (error) { next(error); }
});

router.post("/:similarPatientId/verify", async (req, res, next) => {
  const { status, note, version, query_patient_id: queryPatientId } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
  if (!Number.isInteger(version) || version < 0) return res.status(400).json({ error: "Version đánh giá không hợp lệ" });
  if (String(note || "").length > 5_000) return res.status(400).json({ error: "Ghi chú tối đa 5.000 ký tự" });
  try {
    const saved = await saveComparisonDecision(
      queryPatientId,
      req.params.similarPatientId,
      { status, note, version },
      req.user,
      { requestId: req.id, ip: req.ip },
    );
    if (!saved) return res.status(404).json({ error: "Không tìm thấy bệnh nhân tương tự" });
    res.json(saved);
  } catch (error) { next(error); }
});

export default router;
