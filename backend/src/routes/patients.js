import { Router } from "express";
import { PATIENTS } from "../data/patients.js";
import { getVerifications, getVerification, setVerification } from "../data/store.js";

const router = Router();

// GET /api/patients — danh sách rút gọn (dùng cho sidebar) + trạng thái verify
router.get("/", (req, res) => {
  const verifications = getVerifications();
  const list = PATIENTS.map((p) => ({
    id: p.id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    urgency: p.urgency,
    status: verifications[p.id]?.status || "pending",
  }));
  res.json(list);
});

// GET /api/patients/:id — chi tiết đầy đủ 1 bệnh nhân
router.get("/:id", (req, res) => {
  const patient = PATIENTS.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Không tìm thấy bệnh nhân" });
  const verification = getVerification(patient.id);
  res.json({ ...patient, verification });
});

// POST /api/patients/:id/verify — xác nhận / từ chối / gắn cờ
router.post("/:id/verify", (req, res) => {
  const patient = PATIENTS.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Không tìm thấy bệnh nhân" });

  const { status, note } = req.body || {};
  const allowed = ["pending", "approved", "rejected", "flagged"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status phải là một trong: ${allowed.join(", ")}` });
  }

  const saved = setVerification(patient.id, { status, note, reviewer: req.user.username });
  res.json({ id: patient.id, ...saved });
});

export default router;
