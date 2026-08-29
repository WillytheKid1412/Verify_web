import { Router } from "express";
import { getComparisonSession, saveComparisonDecision } from "../data/comparison.js";

const router = Router();
const allowed = ["pending", "approved", "rejected", "flagged"];

router.get("/", (req, res) => res.json(getComparisonSession()));

router.post("/:similarPatientId/verify", (req, res) => {
  const { status, note, reviewer } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
  const saved = saveComparisonDecision(req.params.similarPatientId, { status, note, reviewer });
  if (!saved) return res.status(404).json({ error: "Không tìm thấy bệnh nhân tương tự" });
  res.json(saved);
});

export default router;
